import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server as ServidorHttp } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";

// O lote C ainda não escreveu a tradução (ela lança). Aqui basta a forma: o
// que este teste prova é o aperto de mão, não o mapeamento de campos.
vi.mock("../traducao/usuario", () => ({
  usuarioParaDiscord: (u: { snowflake: bigint; username: string; displayName: string | null }) => ({
    id: String(u.snowflake),
    username: u.username,
    discriminator: "0",
    global_name: u.displayName,
    avatar: null,
    bot: true,
    system: false,
    public_flags: 0,
  }),
}));

import type { ApplicationsService } from "../../applications/applications.service";
import type { DadosDeCompatService } from "../dados.service";
import { FECHAMENTO, OPCODE } from "../tipos";
import type { PonteDeEventos } from "./dispatch";
import { GatewayCompatService } from "./servidor";
import { RegistroDeSessoes, SessaoWs } from "./sessao";
import type { VozDoGateway } from "./voz";

const TOKEN = "MjIy.aBcDeF.um-token-de-teste-que-nao-vale-nada";

function fakes() {
  const aplicativos = {
    verificarToken: vi.fn(async (token: string) =>
      token === TOKEN
        ? {
            application: { id: "app-cuid", snowflake: 111n, name: "Bot de teste" },
            botUserId: "bot-cuid",
          }
        : null,
    ),
  } as unknown as ApplicationsService;

  const dados = {
    usuarioPorCuid: vi.fn(async () => ({
      id: "bot-cuid",
      snowflake: 222n,
      username: "botzinho",
      displayName: "Botzinho",
      isBot: true,
    })),
    servidoresDoBot: vi.fn(async () => [{ id: "guild-cuid", snowflake: 333n }]),
  } as unknown as DadosDeCompatService;

  const ponte = {
    montarGuildCreate: vi.fn(async () => ({ id: "333", name: "Servidor", unavailable: false })),
  } as unknown as PonteDeEventos;

  // F2: o op 4 é roteado para cá. O que ele faz está provado em `voz.spec.ts`;
  // aqui só interessa que a conexão **não** caia por causa dele.
  const voz = {
    tratarAtualizacaoDeVoz: vi.fn(async () => undefined),
  } as unknown as VozDoGateway;

  return { aplicativos, dados, ponte, voz };
}

/** Um quadro recebido, com o registro de ter chegado como texto ou binário. */
interface QuadroRecebido {
  binario: boolean;
  op: number;
  d: unknown;
  s: number | null;
  t: string | null;
}

interface Cliente {
  soquete: WebSocket;
  quadros: QuadroRecebido[];
  fechamento: { codigo: number; razao: string } | null;
  aberto: boolean;
  mandar(op: number, d: unknown): void;
  esperarOp(op: number, t?: string): Promise<QuadroRecebido>;
  esperarFechamento(): Promise<{ codigo: number; razao: string }>;
}

async function esperar(condicao: () => boolean, oQue: string, limiteMs = 4000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (condicao()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`esperei ${limiteMs} ms por: ${oQue}`);
}

function conectar(porta: number, consulta = "v=10&encoding=json"): Cliente {
  const soquete = new WebSocket(`ws://127.0.0.1:${porta}/gateway?${consulta}`);
  const cliente: Cliente = {
    soquete,
    quadros: [],
    fechamento: null,
    aberto: false,
    mandar: (op, d) => soquete.send(JSON.stringify({ op, d })),
    esperarOp: async (op, t) => {
      await esperar(
        () => cliente.quadros.some((q) => q.op === op && (t === undefined || q.t === t)),
        `op ${op}${t ? ` (${t})` : ""}`,
      );
      return cliente.quadros.find((q) => q.op === op && (t === undefined || q.t === t))!;
    },
    esperarFechamento: async () => {
      await esperar(() => cliente.fechamento !== null, "o close");
      return cliente.fechamento!;
    },
  };
  soquete.on("open", () => void (cliente.aberto = true));
  soquete.on("message", (dado, binario) => {
    const quadro = JSON.parse(String(dado)) as Omit<QuadroRecebido, "binario">;
    cliente.quadros.push({ ...quadro, binario });
  });
  soquete.on("close", (codigo, razao) => {
    cliente.fechamento = { codigo, razao: razao.toString() };
  });
  soquete.on("error", () => {
    /* o close já conta a história */
  });
  return cliente;
}

describe("GatewayCompatService — o aperto de mão do §7", () => {
  let http: ServidorHttp;
  let servico: GatewayCompatService;
  let registro: RegistroDeSessoes;
  let porta: number;
  let clientes: Cliente[];

  beforeEach(async () => {
    clientes = [];
    registro = new RegistroDeSessoes();
    const { aplicativos, dados, ponte, voz } = fakes();
    servico = new GatewayCompatService(registro, aplicativos, dados, ponte, voz);

    http = createServer((_req, res) => res.end("ok"));
    await new Promise<void>((pronto) => http.listen(0, "127.0.0.1", pronto));
    porta = (http.address() as AddressInfo).port;
    servico.ligar(http);
  });

  afterEach(async () => {
    for (const c of clientes) c.soquete.terminate();
    await servico.desligar();
    await new Promise<void>((pronto) => http.close(() => pronto()));
  });

  function abrir(consulta?: string) {
    const cliente = conectar(porta, consulta);
    clientes.push(cliente);
    return cliente;
  }

  it("manda HELLO na hora, com o intervalo de heartbeat do Discord", async () => {
    const bot = abrir();
    const hello = await bot.esperarOp(OPCODE.HELLO);
    expect(hello.d).toEqual({ heartbeat_interval: 41_250 });
    expect(hello.s).toBeNull();
    expect(hello.binario).toBe(false);
  });

  it("responde HEARTBEAT_ACK a cada op 1, antes e depois do IDENTIFY", async () => {
    const bot = abrir();
    await bot.esperarOp(OPCODE.HELLO);

    bot.mandar(OPCODE.HEARTBEAT, null);
    const ack = await bot.esperarOp(OPCODE.HEARTBEAT_ACK);
    expect(ack.d).toBeNull();

    bot.mandar(OPCODE.IDENTIFY, { token: TOKEN, intents: 33_281 });
    await bot.esperarOp(OPCODE.DISPATCH, "READY");

    bot.mandar(OPCODE.HEARTBEAT, 2);
    await esperar(
      () => bot.quadros.filter((q) => q.op === OPCODE.HEARTBEAT_ACK).length === 2,
      "o segundo ACK",
    );
  });

  it("IDENTIFY → READY com user, guilds e application, e o GUILD_CREATE logo atrás", async () => {
    const bot = abrir();
    await bot.esperarOp(OPCODE.HELLO);
    bot.mandar(OPCODE.IDENTIFY, {
      token: TOKEN,
      intents: 33_281,
      properties: { os: "linux", browser: "discord.js", device: "discord.js" },
      shard: [0, 1],
    });

    const ready = await bot.esperarOp(OPCODE.DISPATCH, "READY");
    const d = ready.d as Record<string, unknown>;

    // Os três que o handler de READY do discord.js acessa sem checar (§7).
    expect(d.user).toBeDefined();
    expect(d.guilds).toBeDefined();
    expect(d.application).toBeDefined();

    expect(d.v).toBe(10);
    expect(d.shard).toEqual([0, 1]);
    expect(typeof d.session_id).toBe("string");
    expect(d.resume_gateway_url).toBe(`ws://127.0.0.1:${porta}/gateway`);
    // As guilds saem INDISPONÍVEIS; é o GUILD_CREATE que resolve o `ready`.
    expect(d.guilds).toEqual([{ id: "333", unavailable: true }]);
    expect(ready.s).toBe(1);

    const guildCreate = await bot.esperarOp(OPCODE.DISPATCH, "GUILD_CREATE");
    expect(guildCreate.s).toBe(2);
    expect(guildCreate.d).toMatchObject({ id: "333", unavailable: false });

    // E a sessão existe para o lote D fazer fan-out nela.
    const sessao = registro.porId(d.session_id as string);
    expect(sessao).not.toBeNull();
    expect(sessao?.botUserId).toBe("bot-cuid");
    expect(sessao?.intents).toBe(33_281);
  });

  it("token inválido leva 4004, e o IDENTIFY repetido leva 4005", async () => {
    const ruim = abrir();
    await ruim.esperarOp(OPCODE.HELLO);
    ruim.mandar(OPCODE.IDENTIFY, { token: "nao-existe", intents: 1 });
    expect((await ruim.esperarFechamento()).codigo).toBe(FECHAMENTO.TOKEN_INVALIDO);

    const bom = abrir();
    await bom.esperarOp(OPCODE.HELLO);
    bom.mandar(OPCODE.IDENTIFY, { token: TOKEN, intents: 1 });
    await bom.esperarOp(OPCODE.DISPATCH, "READY");
    bom.mandar(OPCODE.IDENTIFY, { token: TOKEN, intents: 1 });
    expect((await bom.esperarFechamento()).codigo).toBe(FECHAMENTO.JA_AUTENTICADO);
  });

  it("shard [0, 2] leva 4010 — um shard, ponto (§13)", async () => {
    const bot = abrir();
    await bot.esperarOp(OPCODE.HELLO);
    bot.mandar(OPCODE.IDENTIFY, { token: TOKEN, intents: 1, shard: [0, 2] });

    const fim = await bot.esperarFechamento();
    expect(fim.codigo).toBe(FECHAMENTO.SHARD_INVALIDO);
    expect(fim.razao).toContain("um shard");
  });

  it("encoding=etf leva 4000 com a razão, e nunca chega a ver um IDENTIFY", async () => {
    const bot = abrir("v=10&encoding=etf");
    const fim = await bot.esperarFechamento();
    expect(fim.codigo).toBe(FECHAMENTO.ERRO_DESCONHECIDO);
    expect(fim.razao).toContain("etf");
    expect(bot.quadros).toHaveLength(0);
  });

  it("compress=zlib-stream na query é ignorado: conexão normal, quadro de texto", async () => {
    const bot = abrir("v=10&encoding=json&compress=zlib-stream");
    const hello = await bot.esperarOp(OPCODE.HELLO);
    expect(hello.binario).toBe(false);

    bot.mandar(OPCODE.IDENTIFY, { token: TOKEN, intents: 1, compress: true });
    const ready = await bot.esperarOp(OPCODE.DISPATCH, "READY");
    expect(ready.binario).toBe(false);
    expect(bot.fechamento).toBeNull();
  });

  it("aceita e ignora os ops 3, 4 e 8 sem derrubar a conexão", async () => {
    const bot = abrir();
    await bot.esperarOp(OPCODE.HELLO);
    bot.mandar(OPCODE.PRESENCE_UPDATE, { status: "online" });
    bot.mandar(OPCODE.VOICE_STATE_UPDATE, { guild_id: "333", channel_id: null });
    bot.mandar(OPCODE.REQUEST_GUILD_MEMBERS, { guild_id: "333" });
    bot.mandar(OPCODE.HEARTBEAT, null);

    await bot.esperarOp(OPCODE.HEARTBEAT_ACK);
    expect(bot.fechamento).toBeNull();
  });

  it("opcode que só existe de saída leva 4001, e JSON quebrado leva 4002", async () => {
    const invasor = abrir();
    await invasor.esperarOp(OPCODE.HELLO);
    invasor.mandar(OPCODE.HELLO, {});
    expect((await invasor.esperarFechamento()).codigo).toBe(FECHAMENTO.OPCODE_INVALIDO);

    const torto = abrir();
    await torto.esperarOp(OPCODE.HELLO);
    torto.soquete.send("{isto não é json");
    expect((await torto.esperarFechamento()).codigo).toBe(FECHAMENTO.PAYLOAD_INVALIDO);
  });
});

describe("GatewayCompatService — RESUME", () => {
  let http: ServidorHttp;
  let servico: GatewayCompatService;
  let registro: RegistroDeSessoes;
  let porta: number;
  let clientes: Cliente[];

  beforeEach(async () => {
    clientes = [];
    registro = new RegistroDeSessoes();
    const { aplicativos, dados, ponte, voz } = fakes();
    servico = new GatewayCompatService(registro, aplicativos, dados, ponte, voz);
    http = createServer();
    await new Promise<void>((pronto) => http.listen(0, "127.0.0.1", pronto));
    porta = (http.address() as AddressInfo).port;
    servico.ligar(http);
  });

  afterEach(async () => {
    for (const c of clientes) c.soquete.terminate();
    await servico.desligar();
    await new Promise<void>((pronto) => http.close(() => pronto()));
  });

  function abrir(consulta?: string) {
    const cliente = conectar(porta, consulta);
    clientes.push(cliente);
    return cliente;
  }

  /** Faz o IDENTIFY inteiro e devolve o `session_id` e o último `s` visto. */
  async function identificar() {
    const bot = abrir();
    await bot.esperarOp(OPCODE.HELLO);
    bot.mandar(OPCODE.IDENTIFY, { token: TOKEN, intents: 1 });
    const ready = await bot.esperarOp(OPCODE.DISPATCH, "READY");
    await bot.esperarOp(OPCODE.DISPATCH, "GUILD_CREATE");
    return { bot, sessionId: (ready.d as Record<string, unknown>).session_id as string, seq: 2 };
  }

  it("sessão conhecida: replay do buffer e depois RESUMED", async () => {
    const { bot, sessionId, seq } = await identificar();

    // O bot cai sem close: a sessão fica de pé para o RESUME.
    bot.soquete.terminate();
    await esperar(() => registro.porId(sessionId) !== null, "a sessão sobreviver à queda");

    // Enquanto está fora, o lote D despacharia por aqui; vai para o buffer.
    const sessao = registro.porId(sessionId) as SessaoWs;
    sessao.despachar("MESSAGE_CREATE", { id: "999", content: "!ping" });

    const voltou = abrir();
    await voltou.esperarOp(OPCODE.HELLO);
    voltou.mandar(OPCODE.RESUME, { token: TOKEN, session_id: sessionId, seq });

    const reposto = await voltou.esperarOp(OPCODE.DISPATCH, "MESSAGE_CREATE");
    expect(reposto.s).toBe(3);
    expect(reposto.d).toEqual({ id: "999", content: "!ping" });

    const resumed = await voltou.esperarOp(OPCODE.DISPATCH, "RESUMED");
    expect(resumed.s).toBe(4);
    // A ordem importa: o replay vem antes do RESUMED.
    const so = voltou.quadros.filter((q) => q.op === OPCODE.DISPATCH).map((q) => q.t);
    expect(so).toEqual(["MESSAGE_CREATE", "RESUMED"]);
    expect(voltou.fechamento).toBeNull();
  });

  it("sessão desconhecida: op 9 INVALID_SESSION com d: false", async () => {
    const bot = abrir();
    await bot.esperarOp(OPCODE.HELLO);
    bot.mandar(OPCODE.RESUME, { token: TOKEN, session_id: "sessao-que-nunca-existiu", seq: 7 });

    const invalida = await bot.esperarOp(OPCODE.INVALID_SESSION);
    expect(invalida.d).toBe(false);
  });

  it("RESUME com token inválido leva 4004, não op 9", async () => {
    const { sessionId } = await identificar();
    const bot = abrir();
    await bot.esperarOp(OPCODE.HELLO);
    bot.mandar(OPCODE.RESUME, { token: "nao-existe", session_id: sessionId, seq: 1 });
    expect((await bot.esperarFechamento()).codigo).toBe(FECHAMENTO.TOKEN_INVALIDO);
  });

  it("desligar() manda op 7 RECONNECT antes de fechar", async () => {
    const { bot } = await identificar();
    await servico.desligar();
    await bot.esperarOp(OPCODE.RECONNECT);
    expect((await bot.esperarFechamento()).codigo).toBe(FECHAMENTO.ERRO_DESCONHECIDO);
  });
});

describe("GatewayCompatService.ligar", () => {
  it("é idempotente: chamar duas vezes não registra um segundo listener", async () => {
    const registro = new RegistroDeSessoes();
    const { aplicativos, dados, ponte, voz } = fakes();
    const servico = new GatewayCompatService(registro, aplicativos, dados, ponte, voz);
    const http = createServer();
    await new Promise<void>((pronto) => http.listen(0, "127.0.0.1", pronto));

    servico.ligar(http);
    servico.ligar(http);
    expect(http.listenerCount("upgrade")).toBe(1);

    await servico.desligar();
    expect(http.listenerCount("upgrade")).toBe(0);
    await new Promise<void>((pronto) => http.close(() => pronto()));
  });
});
