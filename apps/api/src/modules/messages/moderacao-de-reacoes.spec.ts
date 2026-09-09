import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PERMISSIONS, DM_PERMISSIONS, Permission } from "@streamz/shared";
import { MessagesService } from "./messages.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ChannelsService } from "../channels/channels.service";
import type { EmojisService } from "../emojis/emojis.service";
import type { FriendsService } from "../friends/friends.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { OnboardingService } from "../onboarding/onboarding.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { StickersService } from "../emojis/stickers.service";
import type { StorageService } from "../storage/storage.service";

/**
 * ── j-bots F5 ── Mexer na reação **dos outros** é moderação.
 *
 * As três rotas novas do Discord (`DELETE .../reactions/:emoji/:uid`,
 * `DELETE .../reactions/:emoji` e `DELETE .../reactions`) exigem
 * `MANAGE_MESSAGES` lá, e exigem aqui. O que estes testes prendem é o "não":
 * um bot sem a permissão não pode limpar a votação da mensagem de outra
 * pessoa, e **em DM ninguém pode** — lá não há moderação (é o mesmo motivo
 * pelo qual `MANAGE_MESSAGES` fica fora de `DM_PERMISSIONS`).
 */

const ANA = "ana";
const BIA = "bia";
const CANAL = "c1";
const CANAL_DM = "dm1";
const RECUSA = "Você não pode gerenciar as reações desta mensagem";

function linha(channelId: string, guildId: string | null) {
  return {
    id: "m1",
    channelId,
    content: "votem aí",
    parentId: null,
    createdAt: new Date("2026-09-08T12:00:00.000Z"),
    editedAt: null,
    type: "DEFAULT",
    suppressEmbeds: false,
    replyMention: false,
    replyTo: null,
    pin: null,
    thread: null,
    poll: null,
    sticker: null,
    reactions: [],
    attachments: [],
    channel: { guildId },
    _count: { replies: 0 },
    author: {
      id: BIA,
      username: BIA,
      displayName: null,
      avatarUrl: null,
      status: "ONLINE",
      customStatusText: null,
      customStatusEmoji: null,
      customStatusExpiresAt: null,
    },
  };
}

function montar(opcoes: { dm?: boolean; podeModerar?: boolean } = {}) {
  const dm = opcoes.dm ?? false;
  const canal = dm ? CANAL_DM : CANAL;
  const prisma = {
    message: { findUnique: vi.fn().mockResolvedValue(linha(canal, dm ? null : "s1")) },
    reaction: {
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;

  const permissoes = dm
    ? DM_PERMISSIONS
    : opcoes.podeModerar
      ? DEFAULT_PERMISSIONS | Permission.MANAGE_MESSAGES
      : DEFAULT_PERMISSIONS;

  const guilds = {
    assertCanViewChannel: vi.fn().mockResolvedValue(
      dm
        ? { tipo: "dm", channel: { id: canal, guildId: null, type: "DM" }, permissions: permissoes }
        : {
            tipo: "guild",
            channel: { id: canal, guildId: "s1", type: "TEXT" },
            member: { role: "MEMBER" },
            permissions: permissoes,
          },
    ),
    assertNotTimedOut: vi.fn().mockResolvedValue(undefined),
  } as unknown as GuildsService;

  const service = new MessagesService(
    prisma,
    guilds,
    {} as StorageService,
    {} as ChannelsService,
    {} as StickersService,
    {} as EmojisService,
    {} as OnboardingService,
    {} as ReadStateService,
    {} as RealtimeService,
    {} as FriendsService,
  );
  return { service, prisma };
}

describe("tirar a reação de outra pessoa", () => {
  it("sem MANAGE_MESSAGES é recusado, e nada é apagado", async () => {
    const { service, prisma } = montar();
    await expect(service.removeReactionOf("m1", ANA, BIA, "👍")).rejects.toThrow(RECUSA);
    expect(prisma.reaction.delete).not.toHaveBeenCalled();
  });

  it("com MANAGE_MESSAGES apaga só a linha daquela pessoa e daquele emoji", async () => {
    const { service, prisma } = montar({ podeModerar: true });
    await service.removeReactionOf("m1", ANA, BIA, "👍");
    expect(prisma.reaction.delete).toHaveBeenCalledWith({
      where: { messageId_userId_emoji: { messageId: "m1", userId: BIA, emoji: "👍" } },
    });
  });

  it("tirar a **própria** não exige moderação (o bot pode mandar o id em vez de @me)", async () => {
    const { service, prisma } = montar();
    await service.removeReactionOf("m1", ANA, ANA, "👍");
    expect(prisma.reaction.delete).toHaveBeenCalledWith({
      where: { messageId_userId_emoji: { messageId: "m1", userId: ANA, emoji: "👍" } },
    });
  });

  it("em conversa direta não há moderação: mexer na reação alheia é recusado", async () => {
    const { service, prisma } = montar({ dm: true });
    await expect(service.removeReactionOf("m1", ANA, BIA, "👍")).rejects.toThrow(RECUSA);
    expect(prisma.reaction.delete).not.toHaveBeenCalled();
  });
});

describe("limpar as reações", () => {
  it("`emoji: null` apaga todas as da mensagem", async () => {
    const { service, prisma } = montar({ podeModerar: true });
    await service.clearReactions("m1", ANA, null);
    expect(prisma.reaction.deleteMany).toHaveBeenCalledWith({ where: { messageId: "m1" } });
  });

  it("com emoji apaga só as daquele emoji", async () => {
    const { service, prisma } = montar({ podeModerar: true });
    await service.clearReactions("m1", ANA, "<:festa:cm1x>");
    expect(prisma.reaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: "m1", emoji: "<:festa:cm1x>" },
    });
  });

  it("sem MANAGE_MESSAGES não apaga nada", async () => {
    const { service, prisma } = montar();
    await expect(service.clearReactions("m1", ANA, null)).rejects.toThrow(RECUSA);
    expect(prisma.reaction.deleteMany).not.toHaveBeenCalled();
  });
});
