import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { JwtPayload } from "../../common/jwt.guard";
import { PlatformAdminService } from "./platform-admin.service";

/**
 * Barra tudo que não for administrador da instância.
 *
 * Vai **sempre** depois do `JwtGuard` (`@UseGuards(JwtGuard, PlatformAdminGuard)`),
 * que é quem preenche `req.user` e já recusou conta desativada ou excluída.
 * Sozinho ele não autentica ninguém.
 *
 * Responde 403 sem dizer que o painel existe. Não é teatro: a lista de
 * administradores é a informação mais interessante da instância para quem
 * quiser atacá-la, e "essa rota é do admin" já é meia resposta.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly admins: PlatformAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = req.user;
    if (!user?.sub || !(await this.admins.ehAdmin(user.sub))) {
      throw new ForbiddenException("Acesso restrito");
    }
    return true;
  }
}
