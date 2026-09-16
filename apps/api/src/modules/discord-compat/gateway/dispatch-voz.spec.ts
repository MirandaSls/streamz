import { WS_EVENTS } from "@streamz/shared";
import { describe, expect, it } from "vitest";

import type { GuildsService } from "../../guilds/guilds.service";
import type { AlvoDoEvento, RealtimeService } from "../../realtime/realtime.service";
import type { VoiceService } from "../../voice/voice.service";
import type { DadosDeCompatService } from "../dados.service";
import type { IdsService } from "../ids.service";
import type { ReacoesDeCompatService } from "../reacoes.service";
import type { LinhaDeMembro, LinhaDeServidor } from "../tipos";
import { INTENT } from "../tipos";
import { PonteDeEventos } from "./dispatch";
import type { RegistroDeSessoes, SessaoDoBot } from "./sessao";

/**
 * Os dois lugares em que a voz entra na ponte de eventos (F2):
 *
 * 1. `voice.state` → `VOICE_STATE_UPDATE`, **filtrado por
 *    `GUILD_VOICE_STATES`**. É por ele que o bot de música vê a call encher e
 *    esvaziar — e "ficou sozinho no canal" é como quase todo bot decide se
 *    desconectar.
 * 2. `voice_states` no `GUILD_CREATE`, que a F1 deixou vazio marcado "F2". É
 *    dele que o bot sabe quem **já** está no canal quando ele acabou de subir.
 *
 * E o que **não** sai: o estado do próprio bot. Quem o manda é o `voz.ts`, com
 * o `session_id` da sessão do gateway (ver o comentário em `dispatch.ts`).
 */

const assentar = () => new Promise((resolva) => setTimeout(resolva, 0));

const SF_SERVIDOR = 111222333444555666n;
const SF_CANAL = 222333444555666777n;
const SF_ANA = 555444333222111000n;
const SF_BOT = 444555666777888999n;

function membro(id: string, snowflake: bigint, ehBot = false): LinhaDeMembro {
  return {
    user: {
      id,
      snowflake,
      username: ehBot ? "musicabot" : "ana",
      displayName: null,
      isBot: ehBot,
    },
    cargoSnowflakes: [],
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    timeoutUntil: null,
    nickname: null,
  };
}

function servidor(): LinhaDeServidor {
  return {
    id: "g1",
    snowflake: SF_SERVIDOR,
    name: "Streamz",
    ownerSnowflake: SF_ANA,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    systemChannelSnowflake: null,
    rulesChannelSnowflake: null,
    cargos: [],
    canais: [
      {
        id: "c_voz",
        snowflake: SF_CANAL,
        guildId: "g1",
        guildSnowflake: SF_SERVIDOR,
        name: "Geral",
        type: "VOICE",
        position: 0,
        topic: null,
        nsfw: false,
        slowmodeSeconds: 0,
        categoriaSnowflake: null,
        destinatarios: [],
      },
    ],
    categorias: [],
    membros: [membro("u_ana", SF_ANA), membro("u_bot", SF_BOT, true)],
    memberCount: 2,
  };
}

function ambiente(emVoz: { channelId: string; userId: string }[] = []) {
  const despachados: { sessao: string; evento: string; dados: unknown }[] = [];
  const sessoes: SessaoDoBot[] = [];
  let ouvinte: ((a: AlvoDoEvento, e: string, d: unknown) => void) | null = null;

  const realtime = {
    onEvent(cb: (a: AlvoDoEvento, e: string, d: unknown) => void) {
      ouvinte = cb;
    },
  } as unknown as RealtimeService;

  const registro = { todas: () => sessoes } as unknown as RegistroDeSessoes;

  const dados = {
    async servidorCompleto() {
      return servidor();
    },
    async membroDoServidor(_guildId: string, userId: string) {
      if (userId === "u_ana") return membro("u_ana", SF_ANA);
      if (userId === "u_bot") return membro("u_bot", SF_BOT, true);
      return null;
    },
  } as unknown as DadosDeCompatService;

  const ids = {
    async snowflakeDeServidor() {
      return SF_SERVIDOR;
    },
    async snowflakeDeCanal() {
      return SF_CANAL;
    },
  } as unknown as IdsService;

  const guilds = {
    async assertCanViewChannel() {
      return {};
    },
  } as unknown as GuildsService;

  const voz = {
    async statesForGuild() {
      return emVoz.map((m) => ({
        channelId: m.channelId,
        guildId: "g1",
        user: { id: m.userId },
        connected: true,
        muted: false,
        deafened: false,
        video: false,
        screen: false,
      }));
    },
  } as unknown as VoiceService;

  // F5: a ponte resolve o emoji da reação por aqui. Nestes testes não há emoji
  // personalizado nenhum, então o token cru já é o `name` do Discord.
  const reacoes = {
    async traduzirToken(token: string) {
      return { id: null, name: token, animated: false };
    },
  } as unknown as ReacoesDeCompatService;

  const ponte = new PonteDeEventos(realtime, registro, dados, ids, guilds, voz, reacoes);
  ponte.iniciar();

  function ligar(id: string, botUserId: string, intents: number) {
    sessoes.push({
      id,
      botUserId,
      applicationId: `app_${botUserId}`,
      intents,
      despachar: (evento, dados_) => despachados.push({ sessao: id, evento, dados: dados_ }),
      fechar: () => undefined,
    });
  }

  async function emitir(evento: string, dado: unknown) {
    ouvinte?.({ tipo: "servidor", id: "g1" }, evento, dado);
    await assentar();
    await assentar();
  }

  return { ponte, ligar, emitir, despachados };
}

const ESTADO_DA_ANA = {
  channelId: "c_voz",
  guildId: "g1",
  user: { id: "u_ana", username: "ana" },
  connected: true,
  muted: true,
  deafened: false,
  video: false,
  screen: false,
};

describe("voice.state → VOICE_STATE_UPDATE", () => {
  it("sai para quem pediu GUILD_VOICE_STATES, com os campos do §3", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar("s1", "u_bot", INTENT.GUILD_VOICE_STATES);
    await emitir(WS_EVENTS.VOICE_STATE, ESTADO_DA_ANA);

    expect(despachados).toHaveLength(1);
    expect(despachados[0].evento).toBe("VOICE_STATE_UPDATE");
    const d = despachados[0].dados as Record<string, unknown>;
    expect(d.guild_id).toBe(String(SF_SERVIDOR));
    expect(d.channel_id).toBe(String(SF_CANAL));
    expect(d.user_id).toBe(String(SF_ANA));
    expect(d.self_mute).toBe(true);
    expect(d.self_deaf).toBe(false);
    expect(d.deaf).toBe(false);
    expect(d.mute).toBe(false);
    expect(d.suppress).toBe(false);
    expect(d.request_to_speak_timestamp).toBeNull();
    expect(typeof d.session_id).toBe("string");
    expect((d.member as Record<string, unknown>).user).toBeDefined();
    // regra 6 do CONTRATO-F1: nada de bigint no que sai
    expect(() => JSON.stringify(d)).not.toThrow();
  });

  it("não sai para quem não pediu o intent", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar("s1", "u_bot", INTENT.GUILDS | INTENT.GUILD_MESSAGES);
    await emitir(WS_EVENTS.VOICE_STATE, ESTADO_DA_ANA);
    expect(despachados).toEqual([]);
  });

  it("desconectar vira o mesmo evento com channel_id null", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar("s1", "u_bot", INTENT.GUILD_VOICE_STATES);
    await emitir(WS_EVENTS.VOICE_STATE, { ...ESTADO_DA_ANA, connected: false });
    expect((despachados[0].dados as Record<string, unknown>).channel_id).toBeNull();
  });

  it("o estado do **próprio bot** não sai por aqui (o session_id é do voz.ts)", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar("s1", "u_bot", INTENT.GUILD_VOICE_STATES);
    await emitir(WS_EVENTS.VOICE_STATE, { ...ESTADO_DA_ANA, user: { id: "u_bot" } });
    expect(despachados).toEqual([]);
  });

  it("chamada em conversa direta (sem guildId) não vira VOICE_STATE_UPDATE", async () => {
    const { ligar, emitir, despachados } = ambiente();
    ligar("s1", "u_bot", INTENT.GUILD_VOICE_STATES);
    await emitir(WS_EVENTS.VOICE_STATE, { ...ESTADO_DA_ANA, guildId: null });
    expect(despachados).toEqual([]);
  });
});

describe("voice_states no GUILD_CREATE", () => {
  it("traz quem já está no canal, **sem** guild_id (é implícito ali)", async () => {
    const { ponte } = ambiente([{ channelId: "c_voz", userId: "u_ana" }]);
    const payload = await ponte.montarGuildCreate("g1", "u_bot");
    const estados = payload.voice_states as Record<string, unknown>[];

    expect(estados).toHaveLength(1);
    expect(estados[0].channel_id).toBe(String(SF_CANAL));
    expect(estados[0].user_id).toBe(String(SF_ANA));
    expect("guild_id" in estados[0]).toBe(false);
    expect((estados[0].member as Record<string, unknown>).user).toBeDefined();
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it("com a call vazia, sai lista vazia — e não campo faltando", async () => {
    const { ponte } = ambiente();
    const payload = await ponte.montarGuildCreate("g1", "u_bot");
    expect(payload.voice_states).toEqual([]);
  });
});
