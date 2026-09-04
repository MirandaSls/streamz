import { describe, expect, it, vi } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import { MessagesService } from "./messages.service";
import { ReadStateService } from "../read-state/read-state.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ChannelsService } from "../channels/channels.service";
import type { EmojisService } from "../emojis/emojis.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { OnboardingService } from "../onboarding/onboarding.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { StickersService } from "../emojis/stickers.service";
import type { StorageService } from "../storage/storage.service";

/**
 * "Quem escreve leu" — a leitura que o envio implica.
 *
 * O defeito: o modal "Convidar amigos" abre a conversa e manda o link sem que
 * ela esteja na tela. Ninguém chamava `POST /channels/:id/read`, então o
 * `lastMessageAt` andava e o `lastReadAt` ficava para trás — e a conversa
 * voltava na lista como **não lida**, com cara de mensagem que o destinatário
 * tivesse mandado para mim. Marcar no servidor (e não só no cliente) é o que
 * sobrevive ao F5 e o que apaga o badge nas outras sessões da conta (§4.2).
 */

const AUTOR = "ana";
const CANAL = "c1";
const QUANDO = new Date("2026-09-04T10:05:00.000Z");

function linhaDeMensagem() {
  return {
    id: "m1",
    channelId: CANAL,
    content: "https://streamz.chat/invite/vyuo3x0x",
    parentId: null,
    createdAt: QUANDO,
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
    channel: { guildId: null },
    _count: { replies: 0 },
    author: {
      id: AUTOR,
      username: AUTOR,
      displayName: null,
      avatarUrl: null,
      status: "ONLINE",
      customStatusText: null,
      customStatusEmoji: null,
      customStatusExpiresAt: null,
    },
  };
}

function montar(readStateFalha = false) {
  const prisma = {
    message: { create: vi.fn().mockResolvedValue(linhaDeMensagem()) },
  } as unknown as PrismaService;
  const guilds = {
    assertCanPostChannel: vi.fn().mockResolvedValue({
      tipo: "dm",
      channel: { id: CANAL, guildId: null, private: false },
      permissions: 0,
    }),
  } as unknown as GuildsService;
  const readState = {
    marcarLidoAoEnviar: readStateFalha
      ? vi.fn().mockRejectedValue(new Error("banco fora"))
      : vi.fn().mockResolvedValue(QUANDO),
  } as unknown as ReadStateService;
  const realtime = { emitToUser: vi.fn() } as unknown as RealtimeService;
  const service = new MessagesService(
    prisma,
    guilds,
    {} as StorageService,
    {} as ChannelsService,
    {} as StickersService,
    {} as EmojisService,
    {} as OnboardingService,
    readState,
    realtime,
  );
  return { service, readState, realtime, prisma };
}

describe("mandar uma mensagem marca o canal como lido para quem mandou", () => {
  it("grava a leitura no instante da mensagem", async () => {
    const { service, readState } = montar();
    await service.create(CANAL, AUTOR, "https://streamz.chat/invite/vyuo3x0x");
    expect(readState.marcarLidoAoEnviar).toHaveBeenCalledWith(AUTOR, CANAL, QUANDO);
  });

  it("avisa as outras sessões da conta (channel.read), e só elas", async () => {
    const { service, realtime } = montar();
    await service.create(CANAL, AUTOR, "oi");
    expect(realtime.emitToUser).toHaveBeenCalledWith(AUTOR, WS_EVENTS.CHANNEL_READ, {
      channelIds: [CANAL],
      lastReadAt: QUANDO.toISOString(),
      guildId: null,
    });
  });

  it("a mensagem é minha: o autor é quem enviou", async () => {
    const { service } = montar();
    const dto = await service.create(CANAL, AUTOR, "https://streamz.chat/invite/vyuo3x0x");
    expect(dto.author.id).toBe(AUTOR);
    expect(dto.content).toBe("https://streamz.chat/invite/vyuo3x0x");
  });

  it("falha na leitura não derruba o envio", async () => {
    const { service } = montar(true);
    await expect(service.create(CANAL, AUTOR, "oi")).resolves.toMatchObject({ id: "m1" });
  });
});

describe("ReadStateService.marcarLidoAoEnviar", () => {
  function prismaFalso(atual: Date | null) {
    const estado = { lastReadAt: atual };
    return {
      readState: {
        findUnique: vi.fn().mockResolvedValue(atual ? { lastReadAt: atual } : null),
        updateMany: vi.fn().mockImplementation(({ data }: { data: { lastReadAt: Date } }) => {
          if (estado.lastReadAt && estado.lastReadAt < data.lastReadAt) {
            estado.lastReadAt = data.lastReadAt;
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
        }),
        upsert: vi.fn().mockImplementation(() => {
          estado.lastReadAt = QUANDO;
          return Promise.resolve({});
        }),
      },
      estado,
    };
  }

  it("canal nunca lido passa a estar lido até a mensagem", async () => {
    const p = prismaFalso(null);
    const s = new ReadStateService(p as unknown as PrismaService);
    await expect(s.marcarLidoAoEnviar(AUTOR, CANAL, QUANDO)).resolves.toEqual(QUANDO);
    expect(p.readState.upsert).toHaveBeenCalled();
    expect(p.estado.lastReadAt).toEqual(QUANDO);
  });

  it("leitura antiga avança para o instante da mensagem", async () => {
    const p = prismaFalso(new Date("2026-09-04T09:00:00.000Z"));
    const s = new ReadStateService(p as unknown as PrismaService);
    await expect(s.marcarLidoAoEnviar(AUTOR, CANAL, QUANDO)).resolves.toEqual(QUANDO);
    expect(p.estado.lastReadAt).toEqual(QUANDO);
  });

  it("leitura mais nova não anda para trás", async () => {
    const depois = new Date("2026-09-04T11:00:00.000Z");
    const p = prismaFalso(depois);
    const s = new ReadStateService(p as unknown as PrismaService);
    await expect(s.marcarLidoAoEnviar(AUTOR, CANAL, QUANDO)).resolves.toEqual(depois);
    expect(p.readState.updateMany).not.toHaveBeenCalled();
    expect(p.estado.lastReadAt).toEqual(depois);
  });
});
