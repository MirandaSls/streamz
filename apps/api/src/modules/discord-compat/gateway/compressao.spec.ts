import { createServer, type Server as ServidorHttp } from "node:http";
import type { AddressInfo } from "node:net";
import { constants, createInflate, type Inflate } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import type { ApplicationsService } from "../../applications/applications.service";
import type { DadosDeCompatService } from "../dados.service";
import { OPCODE } from "../tipos";
import { FIM_DE_MENSAGEM, FluxoZlib, lerCompressao, ZLIB_STREAM } from "./compressao";
import type { PonteDeEventos } from "./dispatch";
import { GatewayCompatService } from "./servidor";
import { RegistroDeSessoes } from "./sessao";
import type { VozDoGateway } from "./voz";

vi.mock("../traducao/usuario", () => ({
  usuarioParaDiscord: (u: { snowflake: bigint; username: string }) => ({
    id: String(u.snowflake),
    username: u.username,
    discriminator: "0",
    global_name: null,
    avatar: null,
    bot: true,
    system: false,
    public_flags: 0,
  }),
}));

/**
 * `compress=zlib-stream` (§7).
 *
 * O outro lado destes testes é um `zlib.Inflate` do Node com `Z_SYNC_FLUSH` —
 * que é **exatamente** o que o `zlib-sync` faz (`new Inflate({chunkSize})` e
 * `push(dado, Z_SYNC_FLUSH)`), sem trazer uma dependência nativa para o
 * monorepo só para testar. A prova com o `zlib-sync` de verdade roda num
 * contêiner descartável e está no PR.
 *
 * O que estes testes prendem:
 *
 * - um quadro comprimido volta a ser **o mesmo JSON**;
 * - o **estado atravessa as mensagens**: o segundo quadro só descomprime no
 *   mesmo inflate do primeiro. É a diferença entre um fluxo e N `deflateSync`,
 *   e errar isso dá um bot que conecta e trava no segundo dispatch;
 * - cada bloco termina em `00 00 FF FF`, que é como o cliente sabe que a
 *   mensagem acabou;
 * - `zstd-stream` (e qualquer outro valor) cai para **texto puro**, com aviso:
 *   recusar quebra o discord.py 2.7, e isso foi medido, não deduzido;
 * - sem `compress` na query, tudo continua em texto.
 */

/** O lado do cliente: um inflate só, alimentado bloco a bloco. */
function inflador() {
  const inflate: Inflate = createInflate({ chunkSize: 64 * 1024 });
  const pedacos: Buffer[] = [];
  const erros: Error[] = [];
  inflate.on("data", (p: Buffer) => pedacos.push(p));
  // Sem este ouvinte, um bloco corrompido vira exceção não tratada e derruba a
  // bateria inteira em vez de falhar o caso.
  inflate.on("error", (e) => erros.push(e as Error));

  return async function descomprimir(quadro: Buffer): Promise<string> {
    expect(quadro.subarray(-4)).toEqual(FIM_DE_MENSAGEM);
    inflate.write(quadro);
    await new Promise<void>((pronto) => inflate.flush(constants.Z_SYNC_FLUSH, () => pronto()));
    if (erros.length > 0) throw erros[0];
    const texto = Buffer.concat(pedacos).toString("utf8");
    pedacos.length = 0;
    return texto;
  };
}

describe("lerCompressao", () => {
  it("só o zlib-stream liga; texto puro é o padrão", () => {
    expect(lerCompressao(null)).toEqual({ zlib: false, aviso: null });
    expect(lerCompressao("")).toEqual({ zlib: false, aviso: null });
    expect(lerCompressao(ZLIB_STREAM)).toEqual({ zlib: true, aviso: null });
  });

  it("zstd-stream cai para texto puro, com aviso — recusar quebra o discord.py", () => {
    // Medido: o discord.py 2.7.1 pede `compress=zstd-stream` quando o
    // `zstandard` está instalado, e um close 4000 aqui derruba o `login()` com
    // um `AttributeError` dentro da lib, antes do `ready`. Com texto puro ele
    // funciona — a prova 4 da F1 é quem prende isso de ponta a ponta.
    const lido = lerCompressao("zstd-stream");
    expect(lido.zlib).toBe(false);
    expect(lido.aviso).toContain("zstd-stream");
  });
});

describe("FluxoZlib", () => {
  it("um quadro volta a ser o mesmo JSON, e o estado atravessa as mensagens", async () => {
    const fluxo = new FluxoZlib();
    const descomprimir = inflador();

    const primeira = JSON.stringify({ op: 10, d: { heartbeat_interval: 41250 } });
    const segunda = JSON.stringify({ op: 0, s: 1, t: "READY", d: { v: 10, session_id: "abc" } });

    expect(await descomprimir(await fluxo.comprimir(primeira))).toBe(primeira);
    expect(await descomprimir(await fluxo.comprimir(segunda))).toBe(segunda);
    fluxo.fechar();
  });

  it("só o **primeiro** bloco traz o cabeçalho zlib: é um fluxo, não N deflates", async () => {
    const fluxo = new FluxoZlib();
    const descomprimir = inflador();
    const texto = JSON.stringify({ op: 0, t: "GUILD_CREATE", d: { id: "1", name: "Streamz" } });

    const primeiro = await fluxo.comprimir(texto);
    const segundo = await fluxo.comprimir(texto);

    // 0x78 é o CMF de um zlib com janela de 32 KB — o cabeçalho de **início de
    // fluxo**. Se cada mensagem fosse um `deflateSync`, ele apareceria de novo,
    // e o inflate do cliente (que é um só) estouraria no segundo quadro com
    // "incorrect header check". Foi esse o defeito que este teste existe para
    // prender.
    expect(primeiro[0]).toBe(0x78);
    expect(segundo[0]).not.toBe(0x78);

    // E o mesmo inflate lê os dois, na ordem.
    expect(await descomprimir(primeiro)).toBe(texto);
    expect(await descomprimir(segundo)).toBe(texto);
    fluxo.fechar();
  });

  it("`escrever` mantém a ordem — que, num fluxo compartilhado, é o formato", async () => {
    const fluxo = new FluxoZlib();
    const descomprimir = inflador();
    const quadros: Buffer[] = [];
    const textos = Array.from({ length: 25 }, (_, i) => JSON.stringify({ op: 0, s: i, t: "X" }));

    for (const texto of textos) fluxo.escrever(texto, (q) => quadros.push(q));
    await new Promise((r) => setTimeout(r, 200));

    expect(quadros).toHaveLength(textos.length);
    for (let i = 0; i < textos.length; i += 1) {
      expect(await descomprimir(quadros[i])).toBe(textos[i]);
    }
    fluxo.fechar();
  });

  it("depois de `fechar`, escrever não faz nada e não lança", async () => {
    const fluxo = new FluxoZlib();
    fluxo.fechar();
    let entregou = false;
    fluxo.escrever("{}", () => {
      entregou = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(entregou).toBe(false);
    expect(fluxo.morto).toBe(true);
  });
});

// ── no fio ───────────────────────────────────────────────────

describe("o gateway com compress=zlib-stream", () => {
  let http: ServidorHttp;
  let servico: GatewayCompatService;
  let porta: number;
  const TOKEN = "MjIy.aBcDeF.um-token-de-teste-que-nao-vale-nada";

  beforeEach(async () => {
    const aplicativos = {
      verificarToken: vi.fn(async (t: string) =>
        t === TOKEN
          ? { application: { id: "app", snowflake: 111n, name: "Bot" }, botUserId: "bot" }
          : null,
      ),
    } as unknown as ApplicationsService;
    const dados = {
      usuarioPorCuid: vi.fn(async () => ({
        id: "bot",
        snowflake: 222n,
        username: "botzinho",
        displayName: null,
        isBot: true,
      })),
      servidoresDoBot: vi.fn(async () => [{ id: "g", snowflake: 333n }]),
    } as unknown as DadosDeCompatService;
    const ponte = {
      montarGuildCreate: vi.fn(async () => ({ id: "333", unavailable: false })),
    } as unknown as PonteDeEventos;

    servico = new GatewayCompatService(
      new RegistroDeSessoes(),
      aplicativos,
      dados,
      ponte,
      {} as unknown as VozDoGateway,
    );
    http = createServer();
    await new Promise<void>((pronto) => http.listen(0, "127.0.0.1", pronto));
    porta = (http.address() as AddressInfo).port;
    servico.ligar(http);
  });

  afterEach(async () => {
    await servico.desligar();
    await new Promise<void>((pronto) => http.close(() => pronto()));
  });

  it("manda HELLO, READY e GUILD_CREATE **binários**, no mesmo fluxo", async () => {
    const soquete = new WebSocket(
      `ws://127.0.0.1:${porta}/gateway?v=10&encoding=json&compress=${ZLIB_STREAM}`,
    );
    const brutos: { binario: boolean; dado: Buffer }[] = [];
    soquete.on("message", (dado, binario) => {
      brutos.push({ binario, dado: dado as Buffer });
    });
    await new Promise((pronto) => soquete.once("open", pronto));

    soquete.send(JSON.stringify({ op: OPCODE.IDENTIFY, d: { token: TOKEN, intents: 1 } }));
    for (let i = 0; i < 100 && brutos.length < 3; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(brutos.length).toBeGreaterThanOrEqual(3);
    expect(brutos.every((q) => q.binario)).toBe(true);

    // Um inflate só para a conexão inteira, como o cliente faz.
    const descomprimir = inflador();
    const quadros = [];
    for (const bruto of brutos) quadros.push(JSON.parse(await descomprimir(bruto.dado)));

    expect(quadros[0].op).toBe(OPCODE.HELLO);
    expect(quadros[0].d.heartbeat_interval).toBeGreaterThan(0);
    expect(quadros[1].t).toBe("READY");
    expect(quadros[1].s).toBe(1);
    expect(quadros[2].t).toBe("GUILD_CREATE");
    expect(quadros[2].s).toBe(2);

    soquete.close();
  });

  it("sem compress na query, tudo continua em texto (o padrão não mudou)", async () => {
    const soquete = new WebSocket(`ws://127.0.0.1:${porta}/gateway?v=10&encoding=json`);
    const binarios: boolean[] = [];
    soquete.on("message", (_dado, binario) => binarios.push(binario));
    await new Promise((pronto) => soquete.once("open", pronto));
    await new Promise((r) => setTimeout(r, 100));
    expect(binarios.length).toBeGreaterThan(0);
    expect(binarios.some((b) => b)).toBe(false);
    soquete.close();
  });

  it("compress=zstd-stream não derruba a conexão: responde em texto", async () => {
    const soquete = new WebSocket(`ws://127.0.0.1:${porta}/gateway?v=10&compress=zstd-stream`);
    const binarios: boolean[] = [];
    let fechou: number | null = null;
    soquete.on("message", (_d, binario) => binarios.push(binario));
    soquete.on("close", (codigo) => {
      fechou = codigo;
    });
    await new Promise((pronto) => soquete.once("open", pronto));
    await new Promise((r) => setTimeout(r, 150));
    expect(fechou).toBeNull();
    expect(binarios.length).toBeGreaterThan(0);
    expect(binarios.some((b) => b)).toBe(false);
    soquete.close();
  });
});
