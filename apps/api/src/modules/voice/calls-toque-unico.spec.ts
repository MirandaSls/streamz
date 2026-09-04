import { describe, expect, it } from "vitest";
import { DM_PERMISSIONS, WS_EVENTS } from "@streamz/shared";
import { CallsService } from "./calls.service";
import { VoiceService } from "./voice.service";
import type { FriendsService } from "../friends/friends.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * `POST /dms/:id/call` chamado duas vezes pelo mesmo clique.
 *
 * O botão de ligar da conversa ficava clicável enquanto a chamada saía, e cada
 * clique era um `POST` novo. Dois pedidos podem ler a contagem da sala **antes**
 * de qualquer um dos dois entrar nela — e aí os dois concluem que a chamada
 * nasce agora e mandam `call.ring`. Do outro lado, o telefone recomeçava do
 * zero no meio do primeiro toque.
 *
 * O cliente agora ignora o segundo clique (`stores/chamada-em-curso.ts`), mas a
 * regra tem de valer no servidor também: quem chega por outro caminho (outra
 * sessão da conta, um retry do HTTP) não pode fazer o telefone tocar de novo.
 */
function servicos(participantes: Record<string, string[]>) {
  const emitidos: { evento: string; alvos: string[] }[] = [];
  const usuarios = new Map(
    ["ana", "bia"].map((id) => [
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
      // c-cargos: o `assertCanViewChannel` de verdade sempre devolve a permissão
      // efetiva do canal — o token e as flags de voz saem dela
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

describe("um clique duplo no telefone não toca duas vezes", () => {
  it("dois `start` seguidos do mesmo usuário emitem um `call.ring` só", async () => {
    const { calls, toques } = servicos({ dm1: ["ana", "bia"] });
    await calls.start("ana", "ana", "dm1");
    await calls.start("ana", "ana", "dm1");
    expect(toques()).toHaveLength(1);
    expect(toques()[0].alvos).toEqual(["bia"]);
  });

  it("dois `start` em paralelo (o clique duplo de verdade) também", async () => {
    const { calls, toques } = servicos({ dm1: ["ana", "bia"] });
    await Promise.all([calls.start("ana", "ana", "dm1"), calls.start("ana", "ana", "dm1")]);
    expect(toques()).toHaveLength(1);
  });

  it("a segunda resposta continua dizendo para quem a chamada toca", async () => {
    const { calls } = servicos({ dm1: ["ana", "bia"] });
    const primeira = await calls.start("ana", "ana", "dm1");
    const segunda = await calls.start("ana", "ana", "dm1");
    expect(primeira.ringing.map((u) => u.id)).toEqual(["bia"]);
    expect(segunda.ringing.map((u) => u.id)).toEqual(["bia"]);
  });

  it("quem atende não faz o telefone tocar de novo", async () => {
    const { calls, toques } = servicos({ dm1: ["ana", "bia"] });
    await calls.start("ana", "ana", "dm1");
    await calls.start("bia", "bia", "dm1");
    expect(toques()).toHaveLength(1);
  });

  it("uma chamada nova, depois de a anterior acabar, toca de novo", async () => {
    const { calls, toques } = servicos({ dm1: ["ana", "bia"] });
    await calls.start("ana", "ana", "dm1");
    await calls.end("ana", "dm1");
    await calls.start("ana", "ana", "dm1");
    expect(toques()).toHaveLength(2);
  });
});
