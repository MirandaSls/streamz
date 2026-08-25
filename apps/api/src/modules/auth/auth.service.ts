import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueViolation } from "../../common/prisma-errors";
import type { AuthTokens, PublicUser, UserStatus } from "@newdisc/shared";
import { RegisterDto, LoginDto } from "./dto";

interface RefreshPayload {
  sub: string;
  username: string;
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const exists = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (exists) throw new ConflictException("Nome de usuário já em uso");

    const passwordHash = await argon2.hash(dto.password);
    let user;
    try {
      user = await this.prisma.user.create({
        data: { username: dto.username, passwordHash, status: "ONLINE" },
      });
    } catch (e) {
      // corrida: dois registros do mesmo username ao mesmo tempo
      if (isUniqueViolation(e)) throw new ConflictException("Nome de usuário já em uso");
      throw e;
    }

    return { user: this.toPublic(user), tokens: await this.issueTokens(user.id, user.username) };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user) throw new UnauthorizedException("Credenciais inválidas");

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException("Credenciais inválidas");

    return { user: this.toPublic(user), tokens: await this.issueTokens(user.id, user.username) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Refresh token inválido");
    }
    // tokens emitidos antes da rotação não têm jti → inválidos, mas nunca 500
    if (!payload.jti) throw new UnauthorizedException("Refresh token inválido");

    // Rotação atômica: revoga o token apresentado e emite o novo par na mesma
    // transação. O token só vale se está registrado e não foi revogado/expirado
    // (um token vazado morre no primeiro uso); se a emissão falhar, o revoke é
    // desfeito no rollback — sem logout silencioso.
    return this.prisma.$transaction(async (tx) => {
      const rotated = await tx.refreshToken.updateMany({
        where: {
          tokenHash: this.hashJti(payload.jti),
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (rotated.count === 0) {
        throw new UnauthorizedException("Refresh token inválido");
      }
      return this.issueTokens(payload.sub, payload.username, tx);
    });
  }

  /** Revoga o refresh token no logout (logout deixa de ser só client-side). */
  async logout(refreshToken: string): Promise<{ ok: true }> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashJti(payload.jti), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // token inválido/expirado: nada a revogar
    }
    return { ok: true };
  }

  private async issueTokens(
    sub: string,
    username: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<AuthTokens> {
    const jti = randomBytes(32).toString("hex");
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub, username },
        { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? "15m" },
      ),
      this.jwt.signAsync(
        { sub, username, jti },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
        },
      ),
    ]);

    // Persiste o hash do jti para permitir rotação/revogação. A expiração da
    // linha acompanha a do próprio token (claim exp).
    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await db.refreshToken.create({
      data: {
        userId: sub,
        tokenHash: this.hashJti(jti),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashJti(jti: string): string {
    return createHash("sha256").update(jti).digest("hex");
  }

  private toPublic(u: {
    id: string;
    username: string;
    avatarUrl: string | null;
    status: UserStatus;
  }): PublicUser {
    return {
      id: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      status: u.status,
    };
  }
}
