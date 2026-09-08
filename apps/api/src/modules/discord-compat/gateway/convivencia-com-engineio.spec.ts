import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, get as pegar, type Server as ServidorHttp } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as ServidorSocketIo } from "socket.io";
import WebSocket from "ws";

vi.mock("../traducao/usuario", () => ({
  usuarioParaDiscord: () => ({ id: "222", username: "botzinho" }),
}));

import type { ApplicationsService } from "../../applications/applications.service";
import type { DadosDeCompatService } from "../dados.service";
import { OPCODE } from "../tipos";
import type { PonteDeEventos } from "./dispatch";
import { GatewayCompatService } from "./servidor";
import { RegistroDeSessoes } from "./sessao";

/**
 * O risco (c) do §12, medido em vez de argumentado.
 *
 * O engine.io registra o próprio listener de `'upgrade'` e, quando o path não é
 * o dele, agenda um `socket.end()` para `destroyUpgradeTimeout` (1 s) depois —
 * executando só `if (socket.writable && socket.bytesWritten <= 0)`
 * (`engine.io/build/server.js`, no `attach`). Como o nosso `handleUpgrade`
 * escreve o `101` e o `HELLO` na hora, `bytesWritten` já passou de zero quando
 * o relógio dispara.
 *
 * Este teste existe porque a falha, se ela voltar, é **silenciosa**: basta
 * alguém pôr um `await` (uma consulta ao banco, por exemplo) antes do
 * `handleUpgrade` para a conexão passar a cair sozinha depois de um segundo,
 * sem uma linha no log. Por isso a espera é de 3 s, três vezes o relógio.
 */
describe("convivência com o engine.io do Socket.IO", () => {
  let http: ServidorHttp;
  let socketIo: ServidorSocketIo;
  let servico: GatewayCompatService;
  let porta: number;

  beforeEach(async () => {
    http = createServer((_req, res) => res.end("ok"));

    // Do jeito que o Nest monta: o `IoAdapter` faz `new Server(httpServer,
    // opções)`, e é esse construtor que chama o `engine.attach` com o
    // `destroyUpgrade` no padrão.
    socketIo = new ServidorSocketIo(http, { cors: { origin: true } });

    await new Promise<void>((pronto) => http.listen(0, "127.0.0.1", pronto));
    porta = (http.address() as AddressInfo).port;

    // E o gateway compat **depois** do listen, como no `main.ts`.
    servico = new GatewayCompatService(
      new RegistroDeSessoes(),
      { verificarToken: vi.fn(async () => null) } as unknown as ApplicationsService,
      {} as unknown as DadosDeCompatService,
      {} as unknown as PonteDeEventos,
    );
    servico.ligar(http);
  });

  afterEach(async () => {
    await servico.desligar();
    await socketIo.close();
    await new Promise<void>((pronto) => http.close(() => pronto()));
  });

  it(
    "o socket de /gateway sobrevive aos 3 s do destroyUpgrade e segue respondendo ACK",
    async () => {
      const bot = new WebSocket(`ws://127.0.0.1:${porta}/gateway?v=10&encoding=json`);
      const quadros: { op: number; d: unknown }[] = [];
      let fechou: number | null = null;
      bot.on("message", (dado) => quadros.push(JSON.parse(String(dado))));
      bot.on("close", (codigo) => void (fechou = codigo));

      await new Promise<void>((pronto, falhou) => {
        bot.once("open", pronto);
        bot.once("error", falhou);
      });
      expect(quadros.some((q) => q.op === OPCODE.HELLO)).toBe(true);

      // Três vezes o `destroyUpgradeTimeout`.
      await new Promise((r) => setTimeout(r, 3000));

      expect(fechou).toBeNull();
      expect(bot.readyState).toBe(WebSocket.OPEN);

      bot.send(JSON.stringify({ op: OPCODE.HEARTBEAT, d: null }));
      await new Promise<void>((pronto, falhou) => {
        const relogio = setTimeout(() => falhou(new Error("nenhum ACK em 2 s")), 2000);
        bot.on("message", (dado) => {
          if (JSON.parse(String(dado)).op === OPCODE.HEARTBEAT_ACK) {
            clearTimeout(relogio);
            pronto();
          }
        });
      });

      bot.close();
    },
    20_000,
  );

  it("o Socket.IO continua atendendo em /socket.io", async () => {
    const corpo = await new Promise<string>((pronto, falhou) => {
      pegar(
        `http://127.0.0.1:${porta}/socket.io/?EIO=4&transport=polling`,
        (res) => {
          let texto = "";
          res.on("data", (p) => (texto += p));
          res.on("end", () => pronto(texto));
        },
      ).on("error", falhou);
    });

    // O handshake do engine.io v4 é `0{"sid":…}` — se o gateway compat tivesse
    // roubado o path, aqui viria o "ok" do handler HTTP comum.
    expect(corpo.startsWith("0{")).toBe(true);
    expect(corpo).toContain("sid");
  });
});
