import { Controller, Get, Req, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { BotTokenGuard } from "../bot-token.guard";
import { FiltroDeErrosDoDiscord } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { JsonDoDiscord, RequisicaoDeBot } from "../tipos";

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
 *
 * `@SkipThrottle()`: o teto global por IP (300/min, `common/throttle.ts`) é para
 * navegador. O teto do bot é o de `RateLimitDoDiscordInterceptor` — 50 req/s por
 * bot, anunciado nos cabeçalhos que a lib entende. Deixar os dois somando faria
 * um bot de música tomar um 429 sem `retry_after` e no formato errado, que é
 * exatamente o retry cego que o §5 manda evitar.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/gateway")
export class GatewayCompatController {
  @Get()
  gateway(@Req() req: RequisicaoDeBot): JsonDoDiscord {
    return { url: urlDoGateway(req) };
  }

  @Get("bot")
  gatewayDoBot(@Req() req: RequisicaoDeBot): JsonDoDiscord {
    return {
      url: urlDoGateway(req),
      // um shard, ponto (§13): a lib abre uma conexão por shard, e o IDENTIFY
      // recusa qualquer `shard: [n, m]` com m > 1 com close 4010
      shards: 1,
      // números de fachada: não limitamos início de sessão. O discord.js lê os
      // quatro campos e divide por `max_concurrency` — um 0 ali daria `Infinity`.
      session_start_limit: {
        total: 1000,
        remaining: 1000,
        reset_after: 0,
        max_concurrency: 1,
      },
    };
  }
}

/**
 * Alias v9. As diferenças reais entre v9 e v10 não tocam nada do que
 * implementamos, então herdar é literalmente tudo o que há a fazer (§5).
 */
@Controller("v9/gateway")
export class GatewayCompatControllerV9 extends GatewayCompatController {}

/**
 * A URL do WebSocket que o bot vai abrir.
 *
 * `GATEWAY_PUBLIC_URL` é a resposta determinística, e é o que a produção deve
 * configurar. Sem ela, a URL é montada com o que o próprio cliente pediu — é o
 * que faz `http://localhost:3333` funcionar sem configurar nada.
 *
 * O esquema sai de `x-forwarded-proto` **antes** de `req.secure` porque atrás do
 * Traefik a conexão até o Node é HTTP puro: sem esse cabeçalho (ou sem
 * `TRUST_PROXY`, que é opcional e vem desligado) anunciaríamos `ws://` num
 * domínio que só aceita `wss://`, e o bot ficaria em retry sem erro nenhum.
 */
export function urlDoGateway(req: RequisicaoDeBot): string {
  const configurada = process.env.GATEWAY_PUBLIC_URL?.trim();
  if (configurada) return configurada.replace(/\/+$/, "");

  const host =
    primeiro(req.headers["x-forwarded-host"]) ?? primeiro(req.headers.host) ?? "localhost:3333";
  const encaminhado = primeiro(req.headers["x-forwarded-proto"])?.split(",")[0]?.trim();
  const seguro = encaminhado ? encaminhado === "https" : req.secure === true;
  return `${seguro ? "wss" : "ws"}://${host}/gateway`;
}

/** Cabeçalho repetido chega como array; vale o primeiro. */
function primeiro(valor: unknown): string | undefined {
  if (typeof valor === "string") return valor;
  if (Array.isArray(valor) && typeof valor[0] === "string") return valor[0];
  return undefined;
}
