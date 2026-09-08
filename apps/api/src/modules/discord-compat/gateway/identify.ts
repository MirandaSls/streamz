import { FECHAMENTO, VERSAO_DO_GATEWAY, type JsonDoDiscord } from "../tipos";

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

/** O que o `op 6 RESUME` carrega. */
export interface CorpoDoResume {
  token: string;
  session_id: string;
  /** o `s` do último dispatch que o bot viu; `null` no fio vira 0. */
  seq: number;
}

/** Recusa com um close code — a outra metade do retorno dos leitores. */
export type Recusa = { ok: false; codigo: number; razao: string };

function objeto(d: unknown): Record<string, unknown> | null {
  if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
  return d as Record<string, unknown>;
}

/** Lê e valida o `d` do op 2. Devolve o motivo do close quando recusa. */
export function lerIdentify(d: unknown): { ok: true; corpo: CorpoDoIdentify } | Recusa {
  const corpo = objeto(d);
  if (!corpo) {
    return { ok: false, codigo: FECHAMENTO.PAYLOAD_INVALIDO, razao: "IDENTIFY sem corpo" };
  }

  // Token ausente é 4004 e não 4002 de propósito: é uma falha de autenticação,
  // e 4004 é o único código que faz a lib **parar** de tentar. Um 4002 aqui
  // mandaria o bot reconectar para sempre com o mesmo defeito.
  const token = corpo.token;
  if (typeof token !== "string" || token.trim() === "") {
    return { ok: false, codigo: FECHAMENTO.TOKEN_INVALIDO, razao: "IDENTIFY sem token" };
  }

  const intents = corpo.intents;
  if (typeof intents !== "number" || !Number.isSafeInteger(intents) || intents < 0) {
    return { ok: false, codigo: FECHAMENTO.INTENTS_INVALIDOS, razao: "intents ausente ou inválido" };
  }

  const shard = lerShard(corpo.shard);
  if ("ok" in shard) return shard;

  return {
    ok: true,
    corpo: {
      token: token.trim(),
      intents,
      shard: shard.valor,
      properties: objeto(corpo.properties) ?? undefined,
      compress: corpo.compress === true,
      large_threshold:
        typeof corpo.large_threshold === "number" ? corpo.large_threshold : undefined,
    },
  };
}

/**
 * `shard` do IDENTIFY. Ausente vale `[0, 1]`.
 *
 * Qualquer coisa que não seja um shard só é **4010**, não 4002: o §13 é
 * explícito ("um shard, ponto") e 4010 é irrecuperável, que é exatamente o
 * recado — melhor um erro claro que um bot metade conectado.
 */
function lerShard(bruto: unknown): { valor: [number, number] } | Recusa {
  if (bruto === undefined || bruto === null) return { valor: [0, 1] };

  const invalido: Recusa = {
    ok: false,
    codigo: FECHAMENTO.SHARD_INVALIDO,
    razao: "o Streamz só opera com um shard: use shard [0, 1] ou omita",
  };

  if (!Array.isArray(bruto) || bruto.length !== 2) return invalido;
  const [indice, total] = bruto;
  if (typeof indice !== "number" || typeof total !== "number") return invalido;
  if (!Number.isSafeInteger(indice) || !Number.isSafeInteger(total)) return invalido;
  if (total !== 1 || indice !== 0) return invalido;
  return { valor: [0, 1] };
}

/** Lê e valida o `d` do op 6. */
export function lerResume(d: unknown): { ok: true; corpo: CorpoDoResume } | Recusa {
  const corpo = objeto(d);
  if (!corpo) {
    return { ok: false, codigo: FECHAMENTO.PAYLOAD_INVALIDO, razao: "RESUME sem corpo" };
  }

  const token = corpo.token;
  if (typeof token !== "string" || token.trim() === "") {
    return { ok: false, codigo: FECHAMENTO.TOKEN_INVALIDO, razao: "RESUME sem token" };
  }

  const sessionId = corpo.session_id;
  if (typeof sessionId !== "string" || sessionId === "") {
    return { ok: false, codigo: FECHAMENTO.PAYLOAD_INVALIDO, razao: "RESUME sem session_id" };
  }

  const seqBruto = corpo.seq;
  const seq = seqBruto === null || seqBruto === undefined ? 0 : seqBruto;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) {
    return { ok: false, codigo: FECHAMENTO.SEQUENCIA_INVALIDA, razao: "RESUME com seq inválido" };
  }

  return { ok: true, corpo: { token: token.trim(), session_id: sessionId, seq } };
}

/**
 * Monta o `d` do dispatch READY.
 *
 * As `guilds` saem **indisponíveis**: o `GUILD_CREATE` de cada uma vem logo
 * atrás e é ele que resolve o `ready` (§7). Os campos vazios do fim não são
 * enfeite — são os que as libs leem sem `.get()`: o discord.py itera
 * `data['guilds']` e o discord.js constrói `ClientApplication` de
 * `data.application`.
 */
export function montarReady(dados: {
  sessionId: string;
  usuario: JsonDoDiscord;
  aplicacao: JsonDoDiscord;
  guildSnowflakes: bigint[];
  resumeGatewayUrl: string;
}): JsonDoDiscord {
  return {
    v: VERSAO_DO_GATEWAY,
    user: dados.usuario,
    guilds: dados.guildSnowflakes.map((sf) => ({ id: String(sf), unavailable: true })),
    session_id: dados.sessionId,
    resume_gateway_url: dados.resumeGatewayUrl,
    shard: [0, 1],
    application: dados.aplicacao,
    // O Discord manda estes; libs tipadas às vezes os leem sem default. Custa
    // nada e tira uma classe inteira de "por que não conecta" da mesa.
    relationships: [],
    private_channels: [],
    presences: [],
    guild_join_requests: [],
    geo_ordered_rtc_regions: [],
    session_type: "normal",
    auth: {},
    _trace: ["streamz"],
  };
}
