import { describe, expect, it } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DEFAULT_PERMISSIONS, DM_PERMISSIONS } from "@streamz/shared";
import { VoiceService } from "./voice.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * `GET /dms/:id/voice-states`: o estado da chamada de uma conversa, com o
 * mesmo guard das outras rotas de conversa.
 *
 * O `GuildsService` e o Prisma são substituídos pelo mínimo que este caminho
 * toca: a decisão de acesso e a tabela de usuários. O estado de voz é o da
 * store em memória do próprio service.
 */
function servico(participantes: Record<string, string[]>) {
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
    async assertCanViewChannel(userId: string, channelId: string) {
      if (channelId === "canal-de-servidor") {
        // c-cargos: o `assertCanViewChannel` de verdade sempre devolve a permissão
      // efetiva do canal — o token e as flags de voz saem dela
      return {
          tipo: "guild",
          channel: { id: channelId, guildId: "g1", type: "VOICE" },
          permissions: DEFAULT_PERMISSIONS,
        };
      }
      if (!participantes[channelId]?.includes(userId)) {
        throw new ForbiddenException("Você não participa desta conversa");
      }
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
      // "todo canal em que o usuário poderia estar em voz": as conversas dele
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
  const realtime = { emitToGuild() {}, emitToUsers() {} } as unknown as RealtimeService;
  return new VoiceService(guilds, prisma, realtime);
}

describe("statesForDM", () => {
  it("devolve quem está na chamada da conversa, no formato do estado de servidor", async () => {
    const voice = servico({ dm1: ["ana", "bia"] });
    await voice.join("ana", "dm1");
    await voice.join("bia", "dm1", { muted: true, deafened: false, video: false, screen: false });
    await voice.marcarReconectando("ana", "dm1", true);

    const estados = await voice.statesForDM("bia", "dm1");
    expect(estados.map((e) => [e.user.id, e.channelId, e.guildId, e.connected, e.muted, e.reconnecting]))
      .toEqual([
        ["ana", "dm1", null, true, false, true],
        ["bia", "dm1", null, true, true, false],
      ]);
  });

  it("conversa sem chamada é lista vazia, não erro", async () => {
    const voice = servico({ dm1: ["ana", "bia"] });
    await expect(voice.statesForDM("ana", "dm1")).resolves.toEqual([]);
  });

  it("quem não participa da conversa não lê a chamada dela", async () => {
    const voice = servico({ dm1: ["ana", "bia"] });
    await expect(voice.statesForDM("caio", "dm1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("canal de servidor não entra por aqui: o estado dele é o do servidor inteiro", async () => {
    const voice = servico({});
    await expect(voice.statesForDM("ana", "canal-de-servidor")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
