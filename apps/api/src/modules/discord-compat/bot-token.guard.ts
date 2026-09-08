import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ApplicationsService } from "../applications/applications.service";
import { IdsService } from "./ids.service";

/**
 * `Authorization: Bot <token>` → `req.bot` (`BotAutenticado`).
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * O caminho é o do §5: `tokenDoCabecalho` separa o prefixo `Bot ` (que é
 * **obrigatório** — é ele que faz os dois esquemas conviverem sem se pisarem),
 * `ApplicationsService.verificarToken` faz o `findUnique` pelo sha256, e o
 * `IdsService` completa o snowflake do usuário-bot.
 *
 * Sem cabeçalho, com prefixo errado, com token desconhecido ou com token
 * revogado: **401 no formato do Discord** (`erros.naoAutenticado()`). Nunca 403
 * — o `TokenInvalid` do discord.js nasce do 401 de `fetchGatewayInformation()`,
 * e um 403 ali deixa a lib em retry cego.
 *
 * O `JwtGuard` do app **não é tocado** e continua exigindo `Bearer`.
 */
@Injectable()
export class BotTokenGuard implements CanActivate {
  constructor(
    private readonly apps: ApplicationsService,
    private readonly ids: IdsService,
  ) {}

  async canActivate(_contexto: ExecutionContext): Promise<boolean> {
    throw new Error("F1 lote A: BotTokenGuard não implementado");
  }
}
