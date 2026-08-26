import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { JwtPayload } from "./jwt.guard";

/**
 * Autenticação opcional: preenche `req.user` quando há um token válido e deixa
 * passar quando não há.
 *
 * Serve para rota pública que muda de cara para quem já está logado — a prévia
 * do convite (`GET /invites/:code`) abre deslogado, mas quando reconhece o
 * visitante já diz se ele *é* membro do servidor. Nunca use isto onde a
 * ausência de token deveria negar acesso: use `JwtGuard`.
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return true;
    try {
      req.user = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      // token vencido/inválido numa rota pública é o mesmo que não ter token
    }
    return true;
  }
}
