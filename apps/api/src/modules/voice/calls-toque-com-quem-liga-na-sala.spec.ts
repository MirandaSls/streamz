import { describe, expect, it } from "vitest";
import { DM_PERMISSIONS, WS_EVENTS } from "@streamz/shared";
import { CallsService } from "./calls.service";
import { VoiceService } from "./voice.service";
import type { FriendsService } from "../friends/friends.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * O telefone toca mesmo quando **quem liga** já está na sala de voz.
 *
 * `CallsService.start` decidia se a chamada nasce agora contando a sala
 * inteira (`count(channelId) > 0`) — e quem liga entra nessa conta. Bastava a
 * conta de quem liga já constar no estado de voz para a chamada nascer como
 * "entrei numa que já estava rolando", e o outro lado **nunca tocava**. É um
 * defeito silencioso: nada falha, o `POST` devolve 200 e quem ligou fica
 * olhando "Chamando…" para um telefone que não tocou em lugar nenhum.
 *
 * Três caminhos reais põem quem liga na sala antes da contagem, e nenhum é
 * exótico:
 *
 * 1. **a corrida HTTP × WebSocket** — o cliente emite `voice.join` junto com o
 *    `POST /dms/:id/call` (é o que registra o `voiceChannelId` no socket, sem
 *    o qual mudo/câmera não propagam e a aba fechada vira fantasma). Quem
 *    chega primeiro é a rede que decide;
 * 2. **a tentativa anterior que morreu no meio** — o LiveKit falhou depois do
 *    `POST`, o cliente mostrou o erro e ninguém desfez o estado de voz: a
 *    conta segue na sala até o relógio da solidão. A ligação seguinte sai muda;
 * 3. **a reconexão do socket** (`rejoinAposReconexao`) e a carência de
 *    `VOICE_RECONNECT_GRACE_MS`, que mantêm a conta na sala de propósito.
 *
 * A pergunta certa não é "tem alguém na sala?", é "tem **outra pessoa** na
 * sala?" — a mesma que `expirar` já fazia com `naSala.some(id => id !==
 * fromUserId)`. Com ela a ordem entre HTTP e WS deixa de importar.
 */
function servicos(participantes: Record<string, string[]>) {
  const emitidos: { evento: string; alvos: string[] }[] = [];
  const usuarios = new Map(
    ["ana", "bia", "caio"].map((id) => [
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
    emitToUsers(alvos: string[], evento: string) {
      emitidos.push({ evento, alvos });
    },
  } as unknown as RealtimeService;
  const friends = { async assertNotBlocked() {} } as unknown as FriendsService;
  const voice = new VoiceService(guilds, prisma, realtime);
  const calls = new CallsService(voice, guilds, prisma, realtime, friends);
  const toques = () => emitidos.filter((e) => e.evento === WS_EVENTS.CALL_RING);
  return { calls, voice, toques };
}

describe("o telefone de quem recebe toca", () => {
  it("ana liga para bia: bia recebe `call.ring`", async () => {
    const { calls, toques } = servicos({ dm1: ["ana", "bia"] });
    const r = await calls.start("ana", "ana", "dm1");
    expect(toques()).toHaveLength(1);
    expect(toques()[0].alvos).toEqual(["bia"]);
    expect(r.ringing.map((u) => u.id)).toEqual(["bia"]);
  });

  it("o `voice.join` do WS chegou antes do `POST`: o telefone toca do mesmo jeito", async () => {
    const { calls, voice, toques } = servicos({ dm1: ["ana", "bia"] });
    // a corrida: o socket de quem liga entrou na voz antes de o `start` contar
    await voice.join("ana", "dm1");
    const r = await calls.start("ana", "ana", "dm1");
    expect(toques()).toHaveLength(1);
    expect(toques()[0].alvos).toEqual(["bia"]);
    expect(r.ringing.map((u) => u.id)).toEqual(["bia"]);
  });

  it("a tentativa anterior deixou quem liga na sala: a ligação seguinte toca", async () => {
    const { calls, voice, toques } = servicos({ dm1: ["ana", "bia"] });
    // o LiveKit falhou depois do `POST` e ninguém tirou ana do estado de voz
    await voice.join("ana", "dm1");
    await calls.start("ana", "ana", "dm1");
    expect(toques()).toHaveLength(1);
  });

  it("num grupo, quem liga na sala não cala o toque dos outros dois", async () => {
    const { calls, voice, toques } = servicos({ g1: ["ana", "bia", "caio"] });
    await voice.join("ana", "g1");
    await calls.start("ana", "ana", "g1");
    expect(toques()).toHaveLength(1);
    expect(toques()[0].alvos.sort()).toEqual(["bia", "caio"]);
  });

  it("entrar numa chamada de outra pessoa continua silencioso", async () => {
    const { calls, voice, toques } = servicos({ dm1: ["ana", "bia"] });
    // bia já está na chamada; ana entra pelo botão "Entrar" da faixa
    await voice.join("bia", "dm1");
    await calls.start("ana", "ana", "dm1");
    expect(toques()).toHaveLength(0);
  });
});
