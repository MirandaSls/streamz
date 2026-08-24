import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthTokens, PublicUser } from "@newdisc/shared";
import { RegisterDto, LoginDto } from "./dto";

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
    const user = await this.prisma.user.create({
      data: { username: dto.username, passwordHash, status: "ONLINE" },
    });

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
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; username: string }>(
        refreshToken,
        { secret: process.env.JWT_REFRESH_SECRET },
      );
      return this.issueTokens(payload.sub, payload.username);
    } catch {
      throw new UnauthorizedException("Refresh token inválido");
    }
  }

  private async issueTokens(sub: string, username: string): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub, username },
        { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? "15m" },
      ),
      this.jwt.signAsync(
        { sub, username },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  private toPublic(u: {
    id: string;
    username: string;
    avatarUrl: string | null;
    status: string;
  }): PublicUser {
    return {
      id: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      status: u.status as PublicUser["status"],
    };
  }
}
