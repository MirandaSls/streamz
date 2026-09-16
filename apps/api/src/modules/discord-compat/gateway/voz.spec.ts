import { createServer, type Server as ServidorHttp } from "node:http";
import type { AddressInfo } from "node:net";
import { Permission } from "@streamz/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import type { ApplicationsService } from "../../applications/applications.service";
import type { GuildsService } from "../../guilds/guilds.service";
import type { VoiceService } from "../../voice/voice.service";
import type { DadosDeCompatService } from "../dados.service";
import type { IdsService } from "../ids.service";
import type { LinhaDeCanal, LinhaDeMembro } from "../tipos";
import { OPCODE } from "../tipos";
import type { PonteDeEventos } from "./dispatch";
import { GatewayCompatService } from "./servidor";
import { RegistroDeSessoes, type SessaoDoBot } from "./sessao";
import { estadoDeVozParaDiscord, lerAtualizacaoDeVoz, VozDoGateway } from "./voz";

/**
 * O op 4 — a porta de entrada da voz (§8 do documento, §3 do CONTRATO-F2).
 *
 * O que estes testes prendem, na ordem em que quebrariam a fase:
 *
 * 1. **A ordem e o par**: `VOICE_STATE_UPDATE` e **logo atrás**
 *    `VOICE_SERVER_UPDATE`. Invertidos, o `@discordjs/voice` tenta configurar a
 *    rede sem `session_id` e a conexão de voz nunca fica pronta.
 * 2. **O `session_id` é o da sessão do gateway compat** — é o valor que o bot
 *    repassa ao `IDENTIFY` do gateway de voz e que a ponte compara com o `sid`
 *    do JWT.
 * 3. **Sair é `channel_id: null` e nada atrás.** Um `VOICE_SERVER_UPDATE` na
 *    saída faria a lib reconectar num canal de que ela acabou de sair.
 * 4. **Canal de outro servidor, canal de texto, sem CONNECT, sem SPEAK**: nada
 *    sai, e o bot não entra na sala.
 * 5. **Nada de `bigint` no fio** (regra 6 do CONTRATO-F1): todo id é string
 *    decimal — o teste de fio serializa de verdade e pegaria um `TypeError`.
 */

const SF_SERVIDOR = "111222333444555666";
const SF_CANAL_VOZ = "222333444555666777";
const SF_CANAL_TEXTO = "222333444555666778";
const SF_BOT = "444555666777888999";
const PODE_TUDO_NA_VOZ = Permission.VIEW_CHANNEL | Permission.CONNECT | Permission.SPEAK;

function canal(campos: Partial<LinhaDeCanal> = {}): LinhaDeCanal {
  return {
    id: "c_voz",
    snowflake: BigInt(SF_CANAL_VOZ),
    guildId: "g1",
    guildSnowflake: BigInt(SF_SERVIDOR),
    name: "Geral",
    type: "VOICE",
    position: 0,
    topic: null,
    nsfw: false,
    slowmodeSeconds: 0,
    categoriaSnowflake: null,
    destinatarios: [],
    ...campos,
  };
}

function membroDoBot(): LinhaDeMembro {
  return {
    user: {
      id: "u_bot",
      snowflake: BigInt(SF_BOT),
      username: "musicabot",
      displayName: "Bot de música",
      isBot: true,
    },
    cargoSnowflakes: [],
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    timeoutUntil: null,
    nickname: null,
  };
}

/** Tudo de que o `VozDoGateway` depende, dublado — e o que ele fez, registrado. */
function ambiente(opcoes: { permissoes?: number; jaEmVoz?: string | null } = {}) {
  const permissoes = opcoes.permissoes ?? PODE_TUDO_NA_VOZ;
  const feitos: string[] = [];

  const ids = {
    async cuidDeServidor(sf: string) {
      return sf === SF_SERVIDOR ? "g1" : null;
    },
    async cuidDeUsuario(sf: string) {
      return sf === SF_BOT ? "u_bot" : null;
    },
    async cuidDeCanalOuCategoria(sf: string) {
      if (sf === SF_CANAL_VOZ) return { id: "c_voz", tipo: "canal" as const };
      if (sf === SF_CANAL_TEXTO) return { id: "c_texto", tipo: "canal" as const };
      return null;
    },
    async snowflakeDeUsuario() {
      return BigInt(SF_BOT);
    },
  } as unknown as IdsService;

  const dados = {
    async canalPorCuid(id: string) {
      if (id === "c_voz") return canal();
      if (id === "c_texto") {
        return canal({ id: "c_texto", snowflake: BigInt(SF_CANAL_TEXTO), type: "TEXT" });
      }
      if (id === "c_de_outro") {
        return canal({ id: "c_de_outro", guildId: "g2", guildSnowflake: 999n });
      }
      return null;
    },
    async membroDoServidor() {
      return membroDoBot();
    },
    async aplicacaoPorCuid() {
      return {
        id: "app1",
        snowflake: 777n,
        name: "Bot de música",
        description: null,
        dono: membroDoBot().user,
        bot: membroDoBot().user,
      };
    },
  } as unknown as DadosDeCompatService;

  const guilds = {
    async assertCanViewChannel(userId: string, channelId: string) {
      feitos.push(`assertCanViewChannel:${userId}:${channelId}`);
      return { permissions: permissoes };
    },
  } as unknown as GuildsService;

  const voz = {
    async assinarTokenDaPonte(d: Record<string, unknown>) {
      feitos.push(`assinarTokenDaPonte:${JSON.stringify(d)}`);
      return { token: "jwt.da.ponte", tamanho: 13, endpoint: "voz.streamz.chat" };
    },
    async join(userId: string, channelId: string, flags: Record<string, boolean>) {
      feitos.push(`join:${userId}:${channelId}:${JSON.stringify(flags)}`);
      return canal();
    },
    async leave(userId: string, channelId: string) {
      feitos.push(`leave:${userId}:${channelId}`);
      return canal();
    },
    async channelsOf() {
      const atual = opcoes.jaEmVoz === undefined ? "c_voz" : opcoes.jaEmVoz;
      return atual ? [atual] : [];
    },
  } as unknown as VoiceService;

  const registro = new RegistroDeSessoes();
  const servico = new VozDoGateway(ids, dados, guilds, voz, registro);
  return { servico, feitos, registro };
}

/** Uma sessão de mentira que só anota o que foi despachado. */
function sessaoFalsa(id = "9f3c") {
  const despachados: { evento: string; dados: unknown }[] = [];
  const sessao: SessaoDoBot = {
    id,
    botUserId: "u_bot",
    applicationId: "app1",
    intents: 0,
    despachar: (evento, dados) => despachados.push({ evento, dados }),
    fechar: () => undefined,
  };
  return { sessao, despachados };
}

describe("lerAtualizacaoDeVoz — o payload do discord.js", () => {
  it("lê o op 4 exatamente como o @discordjs/voice o manda", () => {
    const lido = lerAtualizacaoDeVoz({
      guild_id: SF_SERVIDOR,
      channel_id: SF_CANAL_VOZ,
      self_deaf: true,
      self_mute: false,
    });
    expect(lido).toEqual({
      ok: true,
      corpo: {
        guild_id: SF_SERVIDOR,
        channel_id: SF_CANAL_VOZ,
        self_mute: false,
        self_deaf: true,
      },
    });
  });

  it("channel_id null é sair, e não um payload inválido", () => {
    const lido = lerAtualizacaoDeVoz({
      guild_id: SF_SERVIDOR,
      channel_id: null,
      self_deaf: false,
      self_mute: false,
    });
    expect(lido.ok).toBe(true);
    if (lido.ok) expect(lido.corpo.channel_id).toBeNull();
  });

  it("recusa o que não dá para tratar, sem inventar valor", () => {
    expect(lerAtualizacaoDeVoz(null).ok).toBe(false);
    expect(lerAtualizacaoDeVoz([]).ok).toBe(false);
    expect(lerAtualizacaoDeVoz({ channel_id: SF_CANAL_VOZ }).ok).toBe(false);
    expect(lerAtualizacaoDeVoz({ guild_id: "", channel_id: null }).ok).toBe(false);
    expect(lerAtualizacaoDeVoz({ guild_id: SF_SERVIDOR, channel_id: 0 }).ok).toBe(false);
  });

  it("aceita guild_id numérico (cliente antigo) em vez de derrubar a voz por um tipo", () => {
    const lido = lerAtualizacaoDeVoz({ guild_id: 42, channel_id: null });
    expect(lido.ok).toBe(true);
    if (lido.ok) expect(lido.corpo.guild_id).toBe("42");
  });
});

describe("estadoDeVozParaDiscord", () => {
  it("traz todos os campos que as libs leem sem default", () => {
    const estado = estadoDeVozParaDiscord({
      guildSnowflake: SF_SERVIDOR,
      canalSnowflake: SF_CANAL_VOZ,
      usuarioSnowflake: SF_BOT,
      sessionId: "9f3c",
      membro: null,
      selfMute: false,
      selfDeaf: true,
      selfVideo: false,
      selfStream: false,
    });
    expect(estado).toEqual({
      guild_id: SF_SERVIDOR,
      channel_id: SF_CANAL_VOZ,
      user_id: SF_BOT,
      session_id: "9f3c",
      deaf: false,
      mute: false,
      self_deaf: true,
      self_mute: false,
      self_video: false,
      self_stream: false,
      suppress: false,
      request_to_speak_timestamp: null,
    });
  });

  it("omite guild_id quando o estado vai dentro do GUILD_CREATE", () => {
    const estado = estadoDeVozParaDiscord({
      guildSnowflake: null,
      canalSnowflake: SF_CANAL_VOZ,
      usuarioSnowflake: SF_BOT,
      sessionId: SF_BOT,
      membro: null,
      selfMute: false,
      selfDeaf: false,
      selfVideo: false,
      selfStream: false,
    });
    expect("guild_id" in estado).toBe(false);
  });
});

describe("VozDoGateway — entrar no canal", () => {
  it("despacha VOICE_STATE_UPDATE e, logo atrás, VOICE_SERVER_UPDATE", async () => {
    const { servico, feitos } = ambiente();
    const { sessao, despachados } = sessaoFalsa("9f3c");

    await servico.tratarAtualizacaoDeVoz(sessao, {
      guild_id: SF_SERVIDOR,
      channel_id: SF_CANAL_VOZ,
      self_deaf: true,
      self_mute: false,
    });

    expect(despachados.map((d) => d.evento)).toEqual([
      "VOICE_STATE_UPDATE",
      "VOICE_SERVER_UPDATE",
    ]);

    const estado = despachados[0].dados as Record<string, unknown>;
    expect(estado.guild_id).toBe(SF_SERVIDOR);
    expect(estado.channel_id).toBe(SF_CANAL_VOZ);
    expect(estado.user_id).toBe(SF_BOT);
    // o session_id é o da sessão do gateway compat: é o que a ponte compara
    expect(estado.session_id).toBe("9f3c");
    expect(estado.self_deaf).toBe(true);
    expect(estado.self_mute).toBe(false);
    expect((estado.member as Record<string, unknown>).user).toBeDefined();

    expect(despachados[1].dados).toEqual({
      token: "jwt.da.ponte",
      guild_id: SF_SERVIDOR,
      endpoint: "voz.streamz.chat",
    });

    // §D5.7: quem grava o estado é a API, com o `join` que já existe — é ele
    // que põe o bot na coluna e no palco do web sem uma linha de UI nova.
    expect(feitos).toContain(
      'join:u_bot:c_voz:{"muted":false,"deafened":true,"video":false,"screen":false}',
    );
  });

  it("assina o token **antes** de entrar na sala", async () => {
    const { servico, feitos } = ambiente();
    const { sessao } = sessaoFalsa();
    await servico.tratarAtualizacaoDeVoz(sessao, {
      guild_id: SF_SERVIDOR,
      channel_id: SF_CANAL_VOZ,
      self_deaf: true,
      self_mute: false,
    });
    const assinou = feitos.findIndex((f) => f.startsWith("assinarTokenDaPonte:"));
    const entrou = feitos.findIndex((f) => f.startsWith("join:"));
    expect(assinou).toBeGreaterThanOrEqual(0);
    expect(assinou).toBeLessThan(entrou);
  });

  it("não entra em canal de texto nem em canal de outro servidor", async () => {
    for (const canalSnowflake of [SF_CANAL_TEXTO, "555"]) {
      const { servico, feitos } = ambiente();
      const { sessao, despachados } = sessaoFalsa();
      await servico.tratarAtualizacaoDeVoz(sessao, {
        guild_id: SF_SERVIDOR,
        channel_id: canalSnowflake,
        self_deaf: true,
        self_mute: false,
      });
      expect(despachados).toEqual([]);
      expect(feitos.some((f) => f.startsWith("join:"))).toBe(false);
    }
  });

  it("sem CONNECT ou sem SPEAK não entra e não despacha nada", async () => {
    for (const permissoes of [
      Permission.VIEW_CHANNEL | Permission.SPEAK, // sem CONNECT
      Permission.VIEW_CHANNEL | Permission.CONNECT, // sem SPEAK
    ]) {
      const { servico, feitos } = ambiente({ permissoes });
      const { sessao, despachados } = sessaoFalsa();
      await servico.tratarAtualizacaoDeVoz(sessao, {
        guild_id: SF_SERVIDOR,
        channel_id: SF_CANAL_VOZ,
        self_deaf: true,
        self_mute: false,
      });
      expect(despachados).toEqual([]);
      expect(feitos.some((f) => f.startsWith("assinarTokenDaPonte:"))).toBe(false);
      expect(feitos.some((f) => f.startsWith("join:"))).toBe(false);
    }
  });
});

describe("VozDoGateway — sair do canal", () => {
  it("channel_id null tira o bot da sala e manda o estado **sem** VOICE_SERVER_UPDATE", async () => {
    const { servico, feitos } = ambiente();
    const { sessao, despachados } = sessaoFalsa("9f3c");

    await servico.tratarAtualizacaoDeVoz(sessao, {
      guild_id: SF_SERVIDOR,
      channel_id: null,
      self_deaf: false,
      self_mute: false,
    });

    expect(feitos).toContain("leave:u_bot:c_voz");
    expect(despachados.map((d) => d.evento)).toEqual(["VOICE_STATE_UPDATE"]);
    const estado = despachados[0].dados as Record<string, unknown>;
    expect(estado.channel_id).toBeNull();
    expect(estado.guild_id).toBe(SF_SERVIDOR);
    expect(estado.user_id).toBe(SF_BOT);
  });

  it("channel_id null sem estar em voz não faz nada", async () => {
    const { servico, feitos } = ambiente({ jaEmVoz: null });
    const { sessao, despachados } = sessaoFalsa();
    await servico.tratarAtualizacaoDeVoz(sessao, { guild_id: SF_SERVIDOR, channel_id: null });
    expect(despachados).toEqual([]);
    expect(feitos.some((f) => f.startsWith("leave:"))).toBe(false);
  });
});

describe("VozDoGateway.desconectarPelaPonte — a rota interna (§D5.7)", () => {
  it("tira o bot da sala e avisa as sessões dele com channel_id null", async () => {
    const { servico, feitos, registro } = ambiente();
    const { sessao, despachados } = sessaoFalsa("9f3c");
    registro.registrar(sessao);

    expect(await servico.desconectarPelaPonte(SF_BOT, SF_CANAL_VOZ)).toBe(true);
    expect(feitos).toContain("leave:u_bot:c_voz");
    expect(despachados.map((d) => d.evento)).toEqual(["VOICE_STATE_UPDATE"]);
    expect((despachados[0].dados as Record<string, unknown>).channel_id).toBeNull();
  });

  it("ids que não existem aqui não viram exceção — a ponte não tem o que fazer com uma", async () => {
    const { servico } = ambiente();
    expect(await servico.desconectarPelaPonte("1", "2")).toBe(false);
  });
});

// ── o fio ────────────────────────────────────────────────────

describe("op 4 no fio: do quadro do bot aos dois dispatches", () => {
  let http: ServidorHttp;
  let servico: GatewayCompatService;
  let porta: number;
  const TOKEN = "NDQ0.aBcDeF.um-token-de-teste-que-nao-vale-nada";

  beforeEach(async () => {
    const { servico: voz } = ambiente();

    const aplicativos = {
      verificarToken: vi.fn(async (t: string) =>
        t === TOKEN
          ? {
              application: { id: "app1", snowflake: 777n, name: "Bot de música" },
              botUserId: "u_bot",
            }
          : null,
      ),
    } as unknown as ApplicationsService;

    const dados = {
      usuarioPorCuid: vi.fn(async () => membroDoBot().user),
      servidoresDoBot: vi.fn(async () => [{ id: "g1", snowflake: BigInt(SF_SERVIDOR) }]),
    } as unknown as DadosDeCompatService;

    const ponte = {
      montarGuildCreate: vi.fn(async () => ({ id: SF_SERVIDOR, unavailable: false })),
    } as unknown as PonteDeEventos;

    servico = new GatewayCompatService(new RegistroDeSessoes(), aplicativos, dados, ponte, voz);
    http = createServer();
    await new Promise<void>((pronto) => http.listen(0, "127.0.0.1", pronto));
    porta = (http.address() as AddressInfo).port;
    servico.ligar(http);
  });

  afterEach(async () => {
    await servico.desligar();
    await new Promise<void>((pronto) => http.close(() => pronto()));
  });

  it("o par sai na ordem certa, em texto puro e sem um bigint no meio", async () => {
    const soquete = new WebSocket(`ws://127.0.0.1:${porta}/gateway?v=10&encoding=json`);
    const quadros: { op: number; t: string | null; d: unknown }[] = [];
    soquete.on("message", (dado) => quadros.push(JSON.parse(String(dado))));
    await new Promise((pronto) => soquete.once("open", pronto));

    const esperar = async (t: string) => {
      for (let i = 0; i < 100; i += 1) {
        const achado = quadros.find((q) => q.op === OPCODE.DISPATCH && q.t === t);
        if (achado) return achado;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`o dispatch ${t} não chegou. Recebidos: ${quadros.map((q) => q.t).join()}`);
    };

    soquete.send(JSON.stringify({ op: OPCODE.IDENTIFY, d: { token: TOKEN, intents: 1 } }));
    await esperar("GUILD_CREATE");

    soquete.send(
      JSON.stringify({
        op: OPCODE.VOICE_STATE_UPDATE,
        d: {
          guild_id: SF_SERVIDOR,
          channel_id: SF_CANAL_VOZ,
          self_deaf: true,
          self_mute: false,
        },
      }),
    );

    const estado = await esperar("VOICE_STATE_UPDATE");
    const servidorDeVoz = await esperar("VOICE_SERVER_UPDATE");
    // A ordem no fio, não só a presença dos dois.
    expect(quadros.indexOf(estado)).toBeLessThan(quadros.indexOf(servidorDeVoz));
    expect((estado.d as Record<string, unknown>).channel_id).toBe(SF_CANAL_VOZ);
    expect(servidorDeVoz.d).toEqual({
      token: "jwt.da.ponte",
      guild_id: SF_SERVIDOR,
      endpoint: "voz.streamz.chat",
    });

    soquete.close();
  });

  it("op 4 malformado é ignorado: a conexão continua de pé", async () => {
    const soquete = new WebSocket(`ws://127.0.0.1:${porta}/gateway?v=10&encoding=json`);
    let fechou = false;
    soquete.on("close", () => {
      fechou = true;
    });
    await new Promise((pronto) => soquete.once("open", pronto));
    soquete.send(JSON.stringify({ op: OPCODE.IDENTIFY, d: { token: TOKEN, intents: 1 } }));
    await new Promise((r) => setTimeout(r, 100));
    soquete.send(JSON.stringify({ op: OPCODE.VOICE_STATE_UPDATE, d: { nada: true } }));
    await new Promise((r) => setTimeout(r, 200));
    expect(fechou).toBe(false);
    soquete.close();
  });
});
