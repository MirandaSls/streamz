import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PERMISSIONS, DM_PERMISSIONS } from "@streamz/shared";
import { MessagesService } from "./messages.service";
import { FriendsService } from "../friends/friends.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ChannelsService } from "../channels/channels.service";
import type { EmojisService } from "../emojis/emojis.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { OnboardingService } from "../onboarding/onboarding.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { StickersService } from "../emojis/stickers.service";
import type { StorageService } from "../storage/storage.service";

/**
 * d-social: bloquear precisa calar a conversa que **já existe**.
 *
 * O defeito (assédio, e não teoria): A e B já tinham conversado por DM, então o
 * canal existia e os dois eram `ChannelMember`. B bloqueava A. A guardava o
 * `channelId`, emitia `message.create` pelo WebSocket, e a mensagem era gravada
 * **e entregue ao vivo** — B seguia na sala do canal desde o connect. O
 * `assertNotBlocked` só era chamado ao *abrir* a conversa, nunca ao escrever
 * nela. De quebra, cada mensagem trazia a conversa de volta para a coluna de
 * quem bloqueou (`DMsService.list` reexibe o que tem mensagem mais nova que o
 * fechamento). O bloqueio era decorativo.
 *
 * Estes testes são a trava: cobrem o canal de DM já existente nos dois
 * sentidos, e cobrem o que **não** pode ser barrado junto — o grupo e o canal
 * de servidor.
 */

const ANA = "ana"; // quem assedia
const BIA = "bia"; // quem bloqueou
const CANAL_DM = "dm1";
const CANAL_GRUPO = "g1";
const CANAL_SERVIDOR = "c1";
const SERVIDOR = "s1";
const QUANDO = new Date("2026-09-08T12:00:00.000Z");

const RECUSA = "Não é possível interagir com este usuário";

function linhaDeMensagem(channelId: string, authorId: string, guildId: string | null) {
  return {
    id: "m1",
    channelId,
    content: "oi",
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
    channel: { guildId },
    _count: { replies: 0 },
    author: {
      id: authorId,
      username: authorId,
      displayName: null,
      avatarUrl: null,
      status: "ONLINE",
      customStatusText: null,
      customStatusEmoji: null,
      customStatusExpiresAt: null,
    },
  };
}

/** Os canais do cenário, com os participantes de cada um. */
const CANAIS: Record<string, { id: string; type: string; guildId: string | null; membros: string[] }> = {
  [CANAL_DM]: { id: CANAL_DM, type: "DM", guildId: null, membros: [ANA, BIA] },
  // grupo: os dois brigados mais uma terceira pessoa
  [CANAL_GRUPO]: { id: CANAL_GRUPO, type: "GROUP", guildId: null, membros: [ANA, BIA, "caio"] },
  [CANAL_SERVIDOR]: { id: CANAL_SERVIDOR, type: "TEXT", guildId: SERVIDOR, membros: [] },
};

/**
 * `bloqueios` são pares "quemBloqueou>quemFoiBloqueado" — direcionais, como a
 * tabela `Block`. A checagem é que decide se vale nos dois sentidos.
 */
function montar(bloqueios: string[] = []) {
  const prisma = {
    block: {
      count: vi.fn().mockImplementation(({ where }: { where: { OR: { blockerId: string; blockedId: string }[] } }) =>
        Promise.resolve(
          where.OR.filter((par) => bloqueios.includes(`${par.blockerId}>${par.blockedId}`)).length,
        ),
      ),
    },
    channelMember: {
      findFirst: vi
        .fn()
        .mockImplementation(
          ({ where }: { where: { channelId: string; userId: { not: string } } }) => {
            const outro = CANAIS[where.channelId]?.membros.find((m) => m !== where.userId.not);
            return Promise.resolve(outro ? { userId: outro } : null);
          },
        ),
    },
    message: {
      create: vi.fn().mockImplementation(({ data }: { data: { channelId: string; authorId: string } }) =>
        Promise.resolve(
          linhaDeMensagem(data.channelId, data.authorId, CANAIS[data.channelId]?.guildId ?? null),
        ),
      ),
      findUnique: vi.fn().mockResolvedValue(linhaDeMensagem(CANAL_DM, BIA, null)),
    },
    reaction: { upsert: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const acessoDe = (channelId: string) => {
    const canal = CANAIS[channelId];
    const channel = {
      id: canal.id,
      guildId: canal.guildId,
      type: canal.type,
      private: false,
      readOnly: false,
    };
    return canal.guildId === null
      ? { tipo: "dm", channel, permissions: DM_PERMISSIONS }
      : { tipo: "guild", channel, member: { role: "MEMBER" }, permissions: DEFAULT_PERMISSIONS };
  };
  const guilds = {
    assertCanPostChannel: vi.fn().mockImplementation((_u: string, c: string) => Promise.resolve(acessoDe(c))),
    assertCanViewChannel: vi.fn().mockImplementation((_u: string, c: string) => Promise.resolve(acessoDe(c))),
    assertNotTimedOut: vi.fn().mockResolvedValue(undefined),
  } as unknown as GuildsService;
  const onboarding = { blocksPosting: vi.fn().mockResolvedValue(false) } as unknown as OnboardingService;
  const channels = { assertSlowmode: vi.fn().mockResolvedValue(undefined) } as unknown as ChannelsService;
  const readState = { marcarLidoAoEnviar: vi.fn().mockResolvedValue(QUANDO) } as unknown as ReadStateService;
  const realtime = { emitToUser: vi.fn() } as unknown as RealtimeService;
  // o FriendsService é o de verdade: é o `blockedBetween` dele que define o
  // sentido do bloqueio, e é isso que estes testes precisam exercitar
  const friends = new FriendsService(prisma, realtime);

  const service = new MessagesService(
    prisma,
    guilds,
    {} as StorageService,
    channels,
    {} as StickersService,
    {} as EmojisService,
    onboarding,
    readState,
    realtime,
    friends,
  );
  return { service, prisma };
}

describe("bloqueio vale na DM que já existe", () => {
  it("quem foi bloqueado não escreve no canal de DM que já existia", async () => {
    const { service, prisma } = montar([`${BIA}>${ANA}`]);
    await expect(service.create(CANAL_DM, ANA, "oi de novo")).rejects.toThrow(RECUSA);
    // o essencial: a mensagem não chega nem a ser gravada
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("quem bloqueou também não escreve — a barreira vale nos dois sentidos", async () => {
    const { service, prisma } = montar([`${BIA}>${ANA}`]);
    await expect(service.create(CANAL_DM, BIA, "última palavra")).rejects.toThrow(RECUSA);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("sem bloqueio, a DM segue normal", async () => {
    const { service } = montar();
    await expect(service.create(CANAL_DM, ANA, "oi")).resolves.toMatchObject({ id: "m1" });
  });

  it("grupo não cala: um bloqueio entre dois não derruba a conversa dos três", async () => {
    const { service } = montar([`${BIA}>${ANA}`]);
    await expect(service.create(CANAL_GRUPO, ANA, "oi, gente")).resolves.toMatchObject({
      channelId: CANAL_GRUPO,
    });
  });

  it("canal de servidor não é afetado pelo bloqueio", async () => {
    const { service } = montar([`${BIA}>${ANA}`]);
    await expect(service.create(CANAL_SERVIDOR, ANA, "bom dia")).resolves.toMatchObject({
      channelId: CANAL_SERVIDOR,
    });
  });

  it("reagir na DM de quem me bloqueou também é recusado", async () => {
    const { service, prisma } = montar([`${BIA}>${ANA}`]);
    await expect(service.addReaction("m1", ANA, "👍")).rejects.toThrow(RECUSA);
    expect(prisma.reaction.upsert).not.toHaveBeenCalled();
  });

  it("reagir na DM sem bloqueio continua funcionando", async () => {
    const { service, prisma } = montar();
    await expect(service.addReaction("m1", ANA, "👍")).resolves.toMatchObject({ id: "m1" });
    expect(prisma.reaction.upsert).toHaveBeenCalled();
  });
});
