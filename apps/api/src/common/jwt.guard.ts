import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AccountStatusService } from "../modules/auth/account-status.service";

export interface JwtPayload {
  sub: string;
  username: string;
  /**
   * Id da linha de sessão (refresh token) que emitiu este access token. Ausente
   * em tokens emitidos antes de a claim existir — quem usa trata como `null`, e
   * o efeito é só não conseguir marcar "sessão atual" na lista de dispositivos.
   */
  sid?: string;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly contas: AccountStatusService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) throw new UnauthorizedException("Token ausente");

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Token inválido");
    }

    // O access token vale 15 min; desativar ou excluir a conta precisa valer
    // antes disso. O `AccountStatusService` cobre a diferença com um cache curto.
    const estado = await this.contas.estado(payload.sub);
    if (!estado.existe || estado.excluida) throw new UnauthorizedException("Conta encerrada");
    if (estado.desativada) throw new UnauthorizedException("Conta desativada");

    req.user = payload;
    return true;
  }
}
