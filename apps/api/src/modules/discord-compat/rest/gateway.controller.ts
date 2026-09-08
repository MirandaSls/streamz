import { Controller, Get, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { BotTokenGuard } from "../bot-token.guard";
import { FiltroDeErrosDoDiscord } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { JsonDoDiscord } from "../tipos";

/**
 * `GET /api/v10/gateway` e `GET /api/v10/gateway/bot`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * É a **primeira** rota que o discord.js chama, e a mais importante da fase: o
 * `WebSocketManager` monta a URL do WebSocket a partir daqui, pelo mesmo
 * `REST` — trocar `rest.api` já redireciona o gateway, não existe (nem é
 * preciso) opção `ws.gateway`. Um 401 aqui vira `TokenInvalid` na lib.
 *
 * ```json
 * {"url":"wss://api.streamz.chat/gateway","shards":1,
 *  "session_start_limit":{"total":1000,"remaining":1000,"reset_after":0,"max_concurrency":1}}
 * ```
 *
 * A URL sai de `GATEWAY_PUBLIC_URL` (variável nova, opcional) e cai para
 * `wss://<host da requisição>/gateway` quando ela não existe — assim o teste
 * local em `http://localhost:3333` funciona sem configurar nada (`ws://`).
 * `shards` é **sempre 1** (§13).
 */
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/gateway")
export class GatewayCompatController {
  @Get()
  gateway(): JsonDoDiscord {
    throw new Error("F1 lote A: GatewayCompatController.gateway não implementado");
  }

  @Get("bot")
  gatewayDoBot(): JsonDoDiscord {
    throw new Error("F1 lote A: GatewayCompatController.gatewayDoBot não implementado");
  }
}

/**
 * Alias v9. As diferenças reais entre v9 e v10 não tocam nada do que
 * implementamos, então herdar é literalmente tudo o que há a fazer (§5).
 */
@Controller("v9/gateway")
export class GatewayCompatControllerV9 extends GatewayCompatController {}
