import type { JsonDoDiscord } from "../tipos";

/**
 * O `op 2 IDENTIFY` e o `READY` que ele produz.
 *
 * ── Lote B (gateway compat) implementa. Puro o quanto der, para testar. ──
 *
 * O aperto de mão inteiro está no §7. O que **não** pode errar:
 *
 * - `READY.guilds` sai com `{id, unavailable: true}` e o `GUILD_CREATE`
 *   completo vem **logo atrás**. É isso que resolve a promessa de
 *   `client.once('ready')` no discord.js. Mandar as guilds completas no READY
 *   sem `GUILD_CREATE` deixa o `WebSocketShard` preso em `waitForGuilds`, sem
 *   erro nenhum.
 * - `d.user`, `d.guilds` e `d.application` **precisam existir**: o handler de
 *   READY acessa os três, e `new ClientApplication(client, data.application)`
 *   estoura com `TypeError` dentro da lib se o terceiro faltar.
 * - `resume_gateway_url`, `session_id`, `shard: [0, 1]` e `v: 10`.
 * - O orçamento é apertado: `readyTimeout` é 15 s, e o `GUILD_CREATE` de todos
 *   os servidores tem que caber nele.
 * - `shard: [n, m]` com `m > 1` → close **4010** (§13: um shard, ponto).
 * - `compress` na query e `compress: true` no corpo são **ignorados** na F1:
 *   respondemos quadro de texto assim mesmo (a compressão por payload é
 *   opcional por mensagem no protocolo, e o discord.py só descomprime
 *   `if type(msg) is bytes`). `encoding=etf` → close 4000 com a razão.
 */

/** O que o IDENTIFY carrega, do que nos interessa. */
export interface CorpoDoIdentify {
  token: string;
  intents: number;
  shard?: [number, number];
  properties?: Record<string, unknown>;
  compress?: boolean;
  large_threshold?: number;
}

/** Lê e valida o `d` do op 2. Devolve o motivo do close quando recusa. */
export function lerIdentify(
  _d: unknown,
): { ok: true; corpo: CorpoDoIdentify } | { ok: false; codigo: number; razao: string } {
  throw new Error("F1 lote B: lerIdentify não implementado");
}

/** Monta o `d` do dispatch READY. */
export function montarReady(_dados: {
  sessionId: string;
  usuario: JsonDoDiscord;
  aplicacao: JsonDoDiscord;
  guildSnowflakes: bigint[];
  resumeGatewayUrl: string;
}): JsonDoDiscord {
  throw new Error("F1 lote B: montarReady não implementado");
}
