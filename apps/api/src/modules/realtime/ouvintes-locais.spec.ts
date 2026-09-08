import { describe, expect, it } from "vitest";
import type { Server } from "socket.io";
import type { AlvoDoEvento } from "./realtime.service";
import { RealtimeService } from "./realtime.service";

/**
 * O gancho `onEvent` — a única mudança que a casca de bots faz em arquivo fora
 * de `discord-compat/` (§7 do documento, §3 do CONTRATO-F1).
 *
 * O que estes testes prendem, e por quê:
 *
 * - **os cinco `emit*` avisam**, com o alvo certo: é a lista inteira do
 *   contrato, e um `emit` esquecido vira um evento que o bot nunca recebe, sem
 *   erro em lugar nenhum;
 * - **`join`/`leave` de sala não avisam**: não são eventos, não há o que
 *   traduzir;
 * - **um ouvinte que lança não derruba o `emit`**: o navegador não pode perder
 *   uma mensagem porque um bot tem defeito. Esta é a razão do `try/catch` por
 *   ouvinte, e é a que mais importa.
 */

/** `Server` de mentira que anota o que foi emitido, como no teste vizinho. */
function ambiente() {
  const emissoes: { salas: string[] | null; evento: string }[] = [];
  const saidas: string[] = [];
  const server = {
    to(salas: string | string[]) {
      const lista = Array.isArray(salas) ? salas : [salas];
      return { emit: (evento: string) => emissoes.push({ salas: lista, evento }) };
    },
    in() {
      return { socketsJoin: () => saidas.push("join"), socketsLeave: () => saidas.push("leave") };
    },
    emit: (evento: string) => emissoes.push({ salas: null, evento }),
  } as unknown as Server;

  const realtime = new RealtimeService();
  realtime.bind(server);

  const vistos: { alvo: AlvoDoEvento; evento: string; dado: unknown }[] = [];
  realtime.onEvent((alvo, evento, dado) => vistos.push({ alvo, evento, dado }));
  return { realtime, emissoes, vistos, saidas };
}

describe("RealtimeService.onEvent", () => {
  it("emitAll avisa com alvo 'todos'", () => {
    const { realtime, vistos } = ambiente();
    realtime.emitAll("presence.update", { userId: "ana" });
    expect(vistos).toEqual([
      { alvo: { tipo: "todos" }, evento: "presence.update", dado: { userId: "ana" } },
    ]);
  });

  it("emitToUser avisa com o id do usuário", () => {
    const { realtime, vistos } = ambiente();
    realtime.emitToUser("ana", "guild.joined", { guildId: "g1" });
    expect(vistos[0]?.alvo).toEqual({ tipo: "usuario", id: "ana" });
  });

  it("emitToUsers avisa com a lista", () => {
    const { realtime, vistos } = ambiente();
    realtime.emitToUsers(["ana", "bia"], "channel.created", { id: "c1" });
    expect(vistos[0]?.alvo).toEqual({ tipo: "usuarios", ids: ["ana", "bia"] });
  });

  it("emitToUsers com lista vazia não emite nem avisa", () => {
    const { realtime, vistos, emissoes } = ambiente();
    realtime.emitToUsers([], "channel.created", { id: "c1" });
    expect(emissoes).toEqual([]);
    expect(vistos).toEqual([]);
  });

  it("emitToChannel avisa com o id do canal", () => {
    const { realtime, vistos } = ambiente();
    realtime.emitToChannel("c1", "message.new", { id: "m1" });
    expect(vistos[0]?.alvo).toEqual({ tipo: "canal", id: "c1" });
    expect(vistos[0]?.evento).toBe("message.new");
  });

  it("emitToGuild avisa com o id do servidor", () => {
    const { realtime, vistos } = ambiente();
    realtime.emitToGuild("g1", "role.created", { id: "r1" });
    expect(vistos[0]?.alvo).toEqual({ tipo: "servidor", id: "g1" });
  });

  it("os cinco emit* avisam, e o Socket.IO recebe todos eles", () => {
    const { realtime, vistos, emissoes } = ambiente();
    realtime.emitAll("a", 1);
    realtime.emitToUser("ana", "b", 2);
    realtime.emitToUsers(["ana"], "c", 3);
    realtime.emitToChannel("c1", "d", 4);
    realtime.emitToGuild("g1", "e", 5);
    expect(vistos.map((v) => v.evento)).toEqual(["a", "b", "c", "d", "e"]);
    expect(emissoes).toHaveLength(5);
  });

  it("join/leave de sala não são eventos e não avisam", () => {
    const { realtime, vistos, saidas } = ambiente();
    realtime.joinGuildRoom("ana", "g1");
    realtime.leaveGuildRoom("ana", "g1");
    realtime.joinChannelRooms(["ana"], "c1");
    realtime.leaveChannelRooms("ana", ["c1"]);
    realtime.closeChannelRoom("c1");
    expect(saidas.length).toBeGreaterThan(0); // mexeram nas salas, sim
    expect(vistos).toEqual([]); // mas não avisaram ninguém
  });

  it("um ouvinte que lança não derruba o emit nem os outros ouvintes", () => {
    const { realtime, emissoes } = ambiente();
    const sobreviventes: string[] = [];
    realtime.onEvent(() => {
      throw new Error("bot com defeito");
    });
    realtime.onEvent((_alvo, evento) => sobreviventes.push(evento));

    expect(() => realtime.emitToChannel("c1", "message.new", { id: "m1" })).not.toThrow();
    // o navegador recebeu do mesmo jeito — é o que não pode faltar
    expect(emissoes).toEqual([{ salas: ["channel:c1"], evento: "message.new" }]);
    expect(sobreviventes).toEqual(["message.new"]);
  });

  it("avisa mesmo sem Socket.IO ligado (a ponte não depende do bind)", () => {
    const realtime = new RealtimeService();
    const vistos: string[] = [];
    realtime.onEvent((_alvo, evento) => vistos.push(evento));
    realtime.emitToChannel("c1", "message.new", { id: "m1" });
    expect(vistos).toEqual(["message.new"]);
  });
});
