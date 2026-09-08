import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { zodBody } from "../../../common/zod.pipe";
import { InteractionsService } from "../../interactions/interactions.service";
import type { InteracaoAutenticada } from "../../interactions/tipos";
import { FiltroDeErrosDoDiscord, interacaoDesconhecida } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import { corpoDeCallbackSchema, type CorpoDeCallback } from "./corpos-f3";

/**
 * `POST /api/v10/interactions/:id/:token/callback` — a resposta do bot.
 *
 * ── Lote B (REST compat) implementa. ──
 *
 * **Esta rota não tem `BotTokenGuard`, e isso não é esquecimento.** O
 * `@discordjs/rest` manda o callback com `auth: false` — sem cabeçalho
 * `Authorization` nenhum —, e o discord.py faz o mesmo. Um guard aqui daria 401
 * em todo `reply()` do planeta. O credencial é o `:token` do caminho, e quem o
 * resolve é `InteractionsService.porToken` (que já devolve 404 `10062` para
 * token inexistente ou vencido).
 *
 * Tipos implementados na F3: **4** `CHANNEL_MESSAGE_WITH_SOURCE` e **5**
 * `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`. 6, 7, 8 e 9 são F5 → 501.
 *
 * Resposta: **204 sem corpo**, como o Discord. O discord.js não lê nada dela;
 * mandar um JSON só faria a lib gastar um parse à toa.
 *
 * `@Body()` cru + zod, como manda o §5: o `ValidationPipe` global com
 * `whitelist: true` apagaria `data.embeds`, `data.components` e `data.flags`
 * antes de o handler ver — o risco (b) do §12, que já mordeu na F1.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@Controller("v10/interactions")
export class InteractionCallbackCompatController {
  constructor(protected readonly interacoes: InteractionsService) {}

  @Post(":id/:token/callback")
  @HttpCode(204)
  async callback(
    @Param("id") id: string,
    @Param("token") token: string,
    // `data` fica intacto até o `responder`: é o único lugar onde `embeds`,
    // `components` e `flags` existem, e o pipe global os comeria num DTO
    @Body(zodBody(corpoDeCallbackSchema)) corpo: CorpoDeCallback,
  ): Promise<void> {
    const interacao = await this.resolver(id, token);
    await this.interacoes.responder(interacao, corpo.type, corpo.data);
  }

  /**
   * O `:token` do caminho → a interação, conferindo o `:id` junto.
   *
   * `porToken` já cuida do "não existe" e do "venceu". O que sobra para o
   * controller é o par: um token válido apresentado com o id de outra interação
   * leva **o mesmo** 404 `10062`, e não 403 — quem não tem o token não fica
   * sabendo que a interação existe. (Na prática só acontece com bot com defeito,
   * e o 404 é o que a lib sabe classificar.)
   */
  protected async resolver(id: string, token: string): Promise<InteracaoAutenticada> {
    const interacao = await this.interacoes.porToken(token);
    if (String(interacao.snowflake) !== id) throw interacaoDesconhecida();
    return interacao;
  }
}

@Controller("v9/interactions")
export class InteractionCallbackCompatControllerV9 extends InteractionCallbackCompatController {}
