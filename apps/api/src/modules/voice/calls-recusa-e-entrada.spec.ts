import { ForbiddenException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALL_RING_TIMEOUT_MS, DM_PERMISSIONS, WS_EVENTS } from "@streamz/shared";
import { CallsService } from "./calls.service";
import { VoiceService } from "./voice.service";
import type { FriendsService } from "../friends/friends.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * Recusar e entrar numa chamada que já rola.
 *
 * Três defeitos moravam aqui, e os três tinham a mesma raiz: o `call.ended` é
 * um evento de **conversa** (vai para todo `ChannelMember`), então emiti-lo sem
 * a chamada ter morrido desliga quem estava falando.
 *
 * 1. a recusa avisava `declined` a todo mundo antes de olhar a sala — A liga
 *    num grupo, B atende, C recusa, e A e B caíam;
 * 2. entrar pelo botão "Entrar" da faixa não calava o toque, e o relógio dos
 *    30 s encerrava depois a chamada de quem estava conversando;
 * 3. `call.decline` não perguntava se o telefone tocava para quem mandou — o
 *    que, somado ao primeiro, dava a qualquer participante o botão de derrubar
 *    a chamada dos outros.
 */
function servicos(participantes: Record<string, string[]>) {
  const emitidos: { evento: string; alvos: string[]; payload: unknown }[] = [];
  const todos = Array.from(new Set(Object.values(participantes).flat()));
  const usuarios = new Map(
    todos.map((id) => [
      id,
      {
        id,
        username: id,
        displayName: null,
        avatarUrl: null,
        status: "ONLINE",
        customStatusText: null,
        customStatusEmoji: null,
        customStatusExpiresAt: null,
      },
    ]),
  );
  const guilds = {
    async assertCanViewChannel(_userId: string, channelId: string) {
      return {
        tipo: "dm",
        channel: { id: channelId, guildId: null, type: "DM" },
        permissions: DM_PERMISSIONS,
      };
    },
  } as unknown as GuildsService;
  const prisma = {
    user: {
      async findMany({ where }: { where: { id: { in: string[] } } }) {
        return where.id.in.map((id) => usuarios.get(id)).filter(Boolean);
      },
      async findUnique({ where }: { where: { id: string } }) {
        return usuarios.get(where.id) ?? null;
      },
    },
    channel: {
      async findUnique({ where }: { where: { id: string } }) {
        return { id: where.id, guildId: null, type: "DM" };
      },
      async findMany() {
        return Object.keys(participantes).map((id) => ({ id }));
      },
    },
    channelMember: {
      async findMany({ where }: { where: { channelId: string } }) {
        return (participantes[where.channelId] ?? []).map((userId) => ({ userId }));
      },
    },
  } as unknown as PrismaService;
  const realtime = {
    emitToGuild() {},
    emitToUsers(alvos: string[], evento: string, payload: unknown) {
      emitidos.push({ evento, alvos, payload });
    },
  } as unknown as RealtimeService;
  const friends = { async assertNotBlocked() {} } as unknown as FriendsService;
  const voice = new VoiceService(guilds, prisma, realtime);
  const calls = new CallsService(voice, guilds, prisma, realtime, friends);
  const fins = () => emitidos.filter((e) => e.evento === WS_EVENTS.CALL_ENDED);
  const toques = () => emitidos.filter((e) => e.evento === WS_EVENTS.CALL_RING);
  const naSala = (channelId: string) => voice.membrosDaSala(channelId);
  return { calls, voice, fins, toques, naSala };
}

/** `emitir` dispara sem `await` (o `void … then`): deixa o microtask andar. */
const esvaziar = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe("recusa não derruba quem já está na chamada", () => {
  it("grupo: C recusa e a chamada de A com B continua de pé", async () => {
    const { calls, fins, naSala } = servicos({ dm1: ["ana", "bia", "caio"] });
    await calls.start("ana", "ana", "dm1");
    await calls.accept("bia", "dm1");
    await calls.decline("caio", "dm1");
    await esvaziar();
    expect(fins()).toHaveLength(0);
    expect((await naSala("dm1")).sort()).toEqual(["ana", "bia"]);
  });

  it("grupo: a recusa de um não apaga o toque de quem ainda falta atender", async () => {
    const { calls, fins } = servicos({ dm1: ["ana", "bia", "caio"] });
    await calls.start("ana", "ana", "dm1");
    // ninguém atendeu ainda: só A na sala, e B continua com o telefone tocando
    await calls.decline("caio", "dm1");
    await esvaziar();
    expect(fins()).toHaveLength(0);
    // e atender depois disso ainda funciona
    await calls.accept("bia", "dm1");
    await esvaziar();
    expect(fins()).toHaveLength(0);
  });

  it("grupo: a recusa do último pendente, com quem ligou sozinho, encerra", async () => {
    const { calls, fins } = servicos({ dm1: ["ana", "bia", "caio"] });
    await calls.start("ana", "ana", "dm1");
    await calls.decline("bia", "dm1");
    await calls.decline("caio", "dm1");
    await esvaziar();
    expect(fins()).toHaveLength(1);
    expect(fins()[0].payload).toMatchObject({ channelId: "dm1", reason: "declined" });
  });

  it("1-a-1: a recusa continua encerrando a chamada de quem ligou", async () => {
    const { calls, fins } = servicos({ dm1: ["ana", "bia"] });
    await calls.start("ana", "ana", "dm1");
    await calls.decline("bia", "dm1");
    await esvaziar();
    expect(fins()).toHaveLength(1);
    expect(fins()[0].payload).toMatchObject({ reason: "declined" });
    expect(fins()[0].payload).toMatchObject({ by: { id: "bia" } });
    // e o aviso vai para a conversa inteira, inclusive quem recusou noutro aparelho
    expect(fins()[0].alvos.sort()).toEqual(["ana", "bia"]);
  });

  it("1-a-1: depois da recusa, ligar de novo volta a tocar", async () => {
    const { calls, toques } = servicos({ dm1: ["ana", "bia"] });
    await calls.start("ana", "ana", "dm1");
    await calls.decline("bia", "dm1");
    await calls.end("ana", "dm1");
    await calls.start("ana", "ana", "dm1");
    expect(toques()).toHaveLength(2);
  });
});

describe("recusar é responder a um telefone que toca para você", () => {
  it("quem ligou não recusa a própria chamada", async () => {
    const { calls, fins } = servicos({ dm1: ["ana", "bia", "caio"] });
    await calls.start("ana", "ana", "dm1");
    await expect(calls.decline("ana", "dm1")).rejects.toBeInstanceOf(ForbiddenException);
    await esvaziar();
    expect(fins()).toHaveLength(0);
  });

  it("quem já entrou na chamada não recusa o toque que ainda corre para outro", async () => {
    const { calls, fins, naSala } = servicos({ dm1: ["ana", "bia", "caio"] });
    await calls.start("ana", "ana", "dm1");
    // "bia" entra pela faixa (sai de `pendentes`), mas o telefone de "caio"
    // continua tocando — e era esse toque que a recusa dela derrubava
    await calls.start("bia", "bia", "dm1");
    await expect(calls.decline("bia", "dm1")).rejects.toBeInstanceOf(ForbiddenException);
    await esvaziar();
    expect(fins()).toHaveLength(0);
    expect((await naSala("dm1")).sort()).toEqual(["ana", "bia"]);
  });

  it("sem toque nenhum, recusar é um nada — nunca um `call.ended`", async () => {
    const { calls, fins } = servicos({ dm1: ["ana", "bia", "caio"] });
    await calls.start("ana", "ana", "dm1");
    // "bia" atende e cala o toque; o cartão de "caio" só some quando ele clica
    await calls.accept("bia", "dm1");
    await calls.decline("caio", "dm1");
    await esvaziar();
    expect(fins()).toHaveLength(0);
  });
});

describe("entrar numa chamada em andamento não morre aos 30 s", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("quem entra pela faixa cala o toque e sobrevive ao relógio", async () => {
    const { calls, fins, naSala } = servicos({ dm1: ["ana", "bia"] });
    await calls.start("ana", "ana", "dm1");
    // o botão "Entrar" da faixa é um `start`, não um `accept`
    await calls.start("bia", "bia", "dm1");
    await vi.advanceTimersByTimeAsync(CALL_RING_TIMEOUT_MS + 1_000);
    await esvaziar();
    expect(fins()).toHaveLength(0);
    expect((await naSala("dm1")).sort()).toEqual(["ana", "bia"]);
  });

  it("quem ligou desliga e quem entrou pela faixa continua na chamada", async () => {
    const { calls, fins, naSala } = servicos({ dm1: ["ana", "bia", "caio"] });
    await calls.start("ana", "ana", "dm1");
    await calls.start("bia", "bia", "dm1");
    await calls.end("ana", "dm1");
    await esvaziar();
    await vi.advanceTimersByTimeAsync(CALL_RING_TIMEOUT_MS + 1_000);
    await esvaziar();
    // o `timeout` daqui era o "Ninguém atendeu" que fechava a tela de quem
    // estava conversando havia meio minuto
    expect(fins().map((f) => (f.payload as { reason: string }).reason)).not.toContain("timeout");
    expect(await naSala("dm1")).toEqual(["bia"]);
  });

  it("ninguém atendendo mesmo: o toque expira e encerra como sempre", async () => {
    const { calls, fins, naSala } = servicos({ dm1: ["ana", "bia"] });
    await calls.start("ana", "ana", "dm1");
    await vi.advanceTimersByTimeAsync(CALL_RING_TIMEOUT_MS + 1_000);
    await esvaziar();
    expect(fins()).toHaveLength(1);
    expect(fins()[0].payload).toMatchObject({ reason: "timeout", by: null });
    expect(await naSala("dm1")).toEqual([]);
  });

  it("o caminho feliz de 1-a-1 segue inteiro: ligar, atender, conversar, desligar", async () => {
    const { calls, fins, toques, naSala } = servicos({ dm1: ["ana", "bia"] });
    await calls.start("ana", "ana", "dm1");
    expect(toques()).toHaveLength(1);
    await calls.accept("bia", "dm1");
    await vi.advanceTimersByTimeAsync(CALL_RING_TIMEOUT_MS + 1_000);
    await esvaziar();
    expect(fins()).toHaveLength(0);
    expect((await naSala("dm1")).sort()).toEqual(["ana", "bia"]);
    await calls.end("bia", "dm1");
    await calls.end("ana", "dm1");
    await esvaziar();
    expect(fins()).toHaveLength(1);
    expect(fins()[0].payload).toMatchObject({ reason: "ended" });
    expect(await naSala("dm1")).toEqual([]);
  });
});
