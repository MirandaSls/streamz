import { WS_EVENTS } from "@streamz/shared";
import { describe, expect, it } from "vitest";

import type { GuildsService } from "../../guilds/guilds.service";
import type { AlvoDoEvento, RealtimeService } from "../../realtime/realtime.service";
import type { VoiceService } from "../../voice/voice.service";
import type { DadosDeCompatService } from "../dados.service";
import type { IdsService } from "../ids.service";
import type { ReacoesDeCompatService } from "../reacoes.service";
import type { LinhaDeMembro, LinhaDeUsuario } from "../tipos";
import { INTENT } from "../tipos";
import { PonteDeEventos } from "./dispatch";
import type { RegistroDeSessoes, SessaoDoBot } from "./sessao";

/**
 * ── F5 ── A reação vira `MESSAGE_REACTION_*`, e não mais `MESSAGE_UPDATE`.
 *
 * O que estes testes prendem, na ordem em que quebrariam um bot de verdade:
 *
 * 1. o payload **exato** — `user_id`, `channel_id`, `message_id`, `guild_id`,
 *    `member` e `emoji`. Sem `user_id` não existe "reaction roles"; sem
 *    `emoji.id` correto não existe emoji personalizado;
 * 2. `member` **só** no ADD e **só** em servidor, como no Discord;
 * 3. o intent é o das reações (`GUILD_MESSAGE_REACTIONS` /
 *    `DIRECT_MESSAGE_REACTIONS`) — um bot que pediu só `GUILD_MESSAGES` não vê
 *    reação nenhuma, e é a causa nº 1 de "meu bot não recebe as reações";
 * 4. **nenhum `MESSAGE_UPDATE` sai por reação** — era o defeito da F1;
 * 5. limpar reações vira `_REMOVE_ALL` (sem emoji) ou `_REMOVE_EMOJI`;
 * 6. sem bot com o intent ligado, o banco não é tocado.
 */

const assentar = () => new Promise((resolva) => setTimeout(resolva, 0));

const CANAL = 222333444555666777n;
const SERVIDOR = 111222333444555666n;
const MENSAGEM = 1234567890123456789n;
const ANA = 555444333222111000n;

interface Despachado {
  evento: string;
  dados: Record<string, unknown>;
}

function usuario(campos: Partial<LinhaDeUsuario> = {}): LinhaDeUsuario {
  return {
    id: "u_ana",
    snowflake: ANA,
    username: "ana",
    displayName: "Ana",
    isBot: false,
    ...campos,
  };
}

function membro(): LinhaDeMembro {
  return {
    user: usuario(),
    cargoSnowflakes: [777n],
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    timeoutUntil: null,
  };
}

function ambiente() {
  const despachados: Despachado[] = [];
  const sessoes: SessaoDoBot[] = [];
  const consultas: string[] = [];
  /** `bot:canal` que o `assertCanViewChannel` recusa. */
  const semAcesso = new Set<string>();

  let ouvinte: ((a: AlvoDoEvento, e: string, d: unknown) => void) | null = null;

  const realtime = {
    onEvent(cb: (a: AlvoDoEvento, e: string, d: unknown) => void) {
      ouvinte = cb;
    },
  } as unknown as RealtimeService;

  const registro = { todas: () => sessoes } as unknown as RegistroDeSessoes;

  const dados = {
    async membroDoServidor(guildId: string, userId: string) {
      consultas.push(`membroDoServidor:${guildId}:${userId}`);
      return membro();
    },
  } as unknown as DadosDeCompatService;

  const ids = {
    async snowflakeDeServidor(id: string) {
      consultas.push(`snowflakeDeServidor:${id}`);
      return id === "g1" ? SERVIDOR : null;
    },
    async snowflakeDeCanal(id: string) {
      consultas.push(`snowflakeDeCanal:${id}`);
      return id === "c1" || id === "dm1" ? CANAL : null;
    },
    async snowflakeDeMensagem(id: string) {
      consultas.push(`snowflakeDeMensagem:${id}`);
      return id === "m1" ? MENSAGEM : null;
    },
    async snowflakeDeUsuario(id: string) {
      consultas.push(`snowflakeDeUsuario:${id}`);
      return id === "u_ana" ? ANA : null;
    },
  } as unknown as IdsService;

  const guilds = {
    async assertCanViewChannel(userId: string, channelId: string) {
      consultas.push(`assertCanViewChannel:${userId}:${channelId}`);
      if (semAcesso.has(`${userId}:${channelId}`)) throw new Error("Canal privado");
      return {};
    },
  } as unknown as GuildsService;

  const voz = {
    async statesForGuild() {
      return [];
    },
  } as unknown as VoiceService;

  const reacoes = {
    async traduzirToken(token: string) {
      consultas.push(`traduzirToken:${token}`);
      if (token === "<:festa:cm1xemoji000000000000000>") {
        return { id: "141414141414141414", name: "festa", animated: true };
      }
      return { id: null, name: token, animated: false };
    },
  } as unknown as ReacoesDeCompatService;

  const ponte = new PonteDeEventos(realtime, registro, dados, ids, guilds, voz, reacoes);
  ponte.iniciar();

  function ligar(intents: number, botUserId = "bot_1") {
    sessoes.push({
      id: `s_${sessoes.length}`,
      botUserId,
      applicationId: `app_${botUserId}`,
      intents,
      despachar: (evento, dados_) =>
        despachados.push({ evento, dados: dados_ as Record<string, unknown> }),
      fechar: () => undefined,
    });
  }

  async function emitir(evento: string, dado: unknown) {
    ouvinte?.({ tipo: "canal", id: "c1" }, evento, dado);
    await assentar();
  }

  return { ligar, emitir, despachados, consultas, semAcesso };
}

/** O payload interno de `reaction.added` num canal de servidor. */
function reacaoNoServidor(emoji = "👍") {
  return {
    messageId: "m1",
    channelId: "c1",
    guildId: "g1",
    userId: "u_ana",
    emoji,
  };
}

describe("MESSAGE_REACTION_ADD / _REMOVE", () => {
  it("o payload é o do Discord, campo por campo, com o `member` no ADD", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar(INTENT.GUILD_MESSAGE_REACTIONS);

    await emitir(WS_EVENTS.REACTION_ADDED, reacaoNoServidor());

    expect(despachados).toHaveLength(1);
    expect(despachados[0].evento).toBe("MESSAGE_REACTION_ADD");
    expect(despachados[0].dados).toMatchObject({
      user_id: String(ANA),
      channel_id: String(CANAL),
      message_id: String(MENSAGEM),
      guild_id: String(SERVIDOR),
      emoji: { id: null, name: "👍", animated: false },
    });
    // o `member` traz o usuário junto: é o que evita uma ida à REST na lib
    expect(despachados[0].dados.member).toMatchObject({ user: { id: String(ANA) } });
  });

  it("o REMOVE não leva `member` (quem tirou pode nem estar mais no servidor)", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar(INTENT.GUILD_MESSAGE_REACTIONS);

    await emitir(WS_EVENTS.REACTION_REMOVED, reacaoNoServidor());

    expect(despachados[0].evento).toBe("MESSAGE_REACTION_REMOVE");
    expect(despachados[0].dados).not.toHaveProperty("member");
    expect(despachados[0].dados).toMatchObject({ user_id: String(ANA), guild_id: String(SERVIDOR) });
  });

  it("emoji personalizado sai com o snowflake e o `animated`", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar(INTENT.GUILD_MESSAGE_REACTIONS);

    await emitir(
      WS_EVENTS.REACTION_ADDED,
      reacaoNoServidor("<:festa:cm1xemoji000000000000000>"),
    );

    expect(despachados[0].dados.emoji).toEqual({
      id: "141414141414141414",
      name: "festa",
      animated: true,
    });
    // o cuid do nosso banco não pode aparecer no que o bot recebe
    expect(JSON.stringify(despachados[0].dados)).not.toContain("cm1xemoji");
  });

  it("em conversa direta usa DIRECT_MESSAGE_REACTIONS e sai sem `guild_id`", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar(INTENT.DIRECT_MESSAGE_REACTIONS);

    await emitir(WS_EVENTS.REACTION_ADDED, {
      messageId: "m1",
      channelId: "dm1",
      guildId: null,
      userId: "u_ana",
      emoji: "👍",
    });

    expect(despachados[0].evento).toBe("MESSAGE_REACTION_ADD");
    expect(despachados[0].dados).not.toHaveProperty("guild_id");
    expect(despachados[0].dados).not.toHaveProperty("member");
  });

  it("quem pediu só GUILD_MESSAGES não recebe reação nenhuma", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar(INTENT.GUILDS | INTENT.GUILD_MESSAGES | INTENT.MESSAGE_CONTENT);

    await emitir(WS_EVENTS.REACTION_ADDED, reacaoNoServidor());

    expect(despachados).toEqual([]);
  });

  it("quem não enxerga o canal não recebe", async () => {
    const { ligar, emitir, despachados, semAcesso } = ambiente();
    ligar(INTENT.GUILD_MESSAGE_REACTIONS);
    semAcesso.add("bot_1:c1");

    await emitir(WS_EVENTS.REACTION_ADDED, reacaoNoServidor());

    expect(despachados).toEqual([]);
  });

  it("sem nenhum bot com o intent, o banco não é tocado", async () => {
    const { ligar, emitir, consultas, despachados } = ambiente();
    ligar(INTENT.GUILD_MESSAGES);

    await emitir(WS_EVENTS.REACTION_ADDED, reacaoNoServidor());

    expect(despachados).toEqual([]);
    expect(consultas.filter((c) => c.startsWith("snowflake"))).toEqual([]);
  });

  it("payload incompleto é ignorado em silêncio, sem consultar nada", async () => {
    const { ligar, emitir, despachados, consultas } = ambiente();
    ligar(INTENT.GUILD_MESSAGE_REACTIONS);

    await emitir(WS_EVENTS.REACTION_ADDED, { messageId: "m1", channelId: "c1" });

    expect(despachados).toEqual([]);
    expect(consultas).toEqual([]);
  });
});

describe("MESSAGE_REACTION_REMOVE_ALL / _REMOVE_EMOJI", () => {
  it("`emoji: null` vira o _REMOVE_ALL, sem campo `emoji`", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar(INTENT.GUILD_MESSAGE_REACTIONS);

    await emitir(WS_EVENTS.REACTIONS_CLEARED, {
      messageId: "m1",
      channelId: "c1",
      guildId: "g1",
      emoji: null,
    });

    expect(despachados[0].evento).toBe("MESSAGE_REACTION_REMOVE_ALL");
    expect(despachados[0].dados).toEqual({
      channel_id: String(CANAL),
      message_id: String(MENSAGEM),
      guild_id: String(SERVIDOR),
    });
  });

  it("com emoji vira o _REMOVE_EMOJI, com o emoji traduzido", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar(INTENT.GUILD_MESSAGE_REACTIONS);

    await emitir(WS_EVENTS.REACTIONS_CLEARED, {
      messageId: "m1",
      channelId: "c1",
      guildId: "g1",
      emoji: "👍",
    });

    expect(despachados[0].evento).toBe("MESSAGE_REACTION_REMOVE_EMOJI");
    expect(despachados[0].dados).toEqual({
      channel_id: String(CANAL),
      message_id: String(MENSAGEM),
      guild_id: String(SERVIDOR),
      emoji: { id: null, name: "👍", animated: false },
    });
  });
});

describe("o MESSAGE_UPDATE por reação acabou", () => {
  it("um `reaction.added` não produz MESSAGE_UPDATE nenhum", async () => {
    const { ligar, emitir, despachados } = ambiente();
    // o bot pede tudo: mensagens **e** reações
    ligar(INTENT.GUILD_MESSAGES | INTENT.GUILD_MESSAGE_REACTIONS | INTENT.MESSAGE_CONTENT);

    await emitir(WS_EVENTS.REACTION_ADDED, reacaoNoServidor());

    expect(despachados.map((d) => d.evento)).toEqual(["MESSAGE_REACTION_ADD"]);
  });
});
