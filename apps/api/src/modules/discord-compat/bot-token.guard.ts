import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ApplicationsService } from "../applications/applications.service";
import { tokenDoCabecalho } from "../applications/token";
import { naoAutenticado } from "./erros";
import { IdsService } from "./ids.service";
import type { RequisicaoDeBot } from "./tipos";

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

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<RequisicaoDeBot>();

    // um `Authorization` repetido chega como array; token nenhum tem essa forma,
    // e juntar dois valores só produziria um hash que não existe no banco
    const cabecalho = req.headers?.authorization;
    const token = tokenDoCabecalho(typeof cabecalho === "string" ? cabecalho : undefined);
    if (!token) throw naoAutenticado();

    const encontrado = await this.apps.verificarToken(token);
    if (!encontrado) throw naoAutenticado();

    // O snowflake do usuário-bot vem do `IdsService`, e **não** da parte 1 do
    // token: aquela é informação pública escolhida por quem manda o cabeçalho, e
    // lê-la aqui deixaria a resposta de `users/@me` sob controle do portador.
    const botSnowflake = await this.ids.snowflakeDeUsuario(encontrado.botUserId);
    // usuário-bot apagado com o token ainda de pé: 401, não 500 — para a lib é
    // exatamente o que é, uma credencial que não vale mais
    if (botSnowflake === null) throw naoAutenticado();

    req.bot = {
      applicationId: encontrado.application.id,
      applicationSnowflake: encontrado.application.snowflake,
      applicationName: encontrado.application.name,
      botUserId: encontrado.botUserId,
      botSnowflake,
    };
    return true;
  }
}
