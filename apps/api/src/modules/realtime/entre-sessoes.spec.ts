import { describe, expect, it } from "vitest";
import type { Server } from "socket.io";
import { WS_EVENTS } from "@streamz/shared";
import { RealtimeService } from "./realtime.service";
import { ReadController } from "../messages/read.controller";
import { GuildReadController } from "../channels/guild-read.controller";
import { InboxService } from "../messages/inbox.service";
import { DMsService } from "../dms/dms.service";
import { FriendsService } from "../friends/friends.service";
import { UsersService } from "../users/users.service";
import { DiscoveryService } from "../discovery/discovery.service";
import { OnboardingService } from "../onboarding/onboarding.service";
import type { AuditService } from "../audit/audit.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { MessagesService } from "../messages/messages.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { StorageService } from "../storage/storage.service";
import type { CallsService } from "../voice/calls.service";
import type { VoiceService } from "../voice/voice.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { JwtPayload } from "../../common/jwt.guard";

/**
 * "A mesma conta em dois clientes" — a auditoria do §4.1 virada em teste.
 *
 * A regra, uma só: **toda mutação que muda o que EU vejo tem de chegar às
 * outras conexões da minha conta**, e a sala que as tem todas é `user:<id>`.
 * Um teste por grupo de mutação (leitura, conversas, amizade, perfil,
 * servidores, onboarding); cada um só pergunta "saiu para `user:<id>`?" — o
 * conteúdo do payload é assunto dos testes de cada módulo.
 *
 * O que já estava coberto por `todas-as-conexoes.spec.ts` (criar servidor,
 * resgatar convite) não se repete aqui.
 */

/** `Server` de mentira que anota para quais salas cada emissão foi. */
function servidorDeMentira() {
  const emissoes: { salas: string[]; evento: string; payload: unknown }[] = [];
  const server = {
    to(salas: string | string[]) {
      const lista = Array.isArray(salas) ? salas : [salas];
      return {
        emit(evento: string, payload: unknown) {
          emissoes.push({ salas: lista, evento, payload });
        },
      };
    },
    in() {
      return { socketsJoin() {}, socketsLeave() {} };
    },
    emit(evento: string, payload: unknown) {
      emissoes.push({ salas: ["*"], evento, payload });
    },
  } as unknown as Server;
  const realtime = new RealtimeService();
  realtime.bind(server);
  return { realtime, emissoes };
}

/** As emissões de um evento, na ordem em que saíram. */
function doEvento(
  emissoes: { salas: string[]; evento: string; payload: unknown }[],
  evento: string,
) {
  return emissoes.filter((e) => e.evento === evento);
}

const ANA: JwtPayload = { sub: "ana", username: "ana" };

// ── leitura ──────────────────────────────────────────────────

describe("marcar como lido", () => {
  it("um canal: `channel.read` na sala da conta, com o servidor do canal", async () => {
    const { realtime, emissoes } = servidorDeMentira();
    const guilds = {
      async assertCanViewChannel() {
        return { tipo: "guild", channel: { id: "c1", guildId: "g1" } };
      },
    } as unknown as GuildsService;
    const readState = {
      async markRead() {
        return new Date("2026-09-03T12:00:00.000Z");
      },
    } as unknown as ReadStateService;

    await new ReadController(guilds, readState, realtime).markRead(ANA, "c1");

    expect(doEvento(emissoes, WS_EVENTS.CHANNEL_READ)).toEqual([
      {
        salas: ["user:ana"],
        evento: "channel.read",
        payload: {
          channelIds: ["c1"],
          lastReadAt: "2026-09-03T12:00:00.000Z",
          guildId: "g1",
        },
      },
    ]);
  });

  it("o servidor inteiro: um `channel.read` com todos os canais visíveis", async () => {
    const { realtime, emissoes } = servidorDeMentira();
    const guilds = {
      async assertMember() {
        return { role: "MEMBER" };
      },
      async visibleChannelsForUser() {
        return [
          { id: "c1", guildId: "g1" },
          { id: "c2", guildId: "g1" },
          { id: "c9", guildId: "g2" },
        ];
      },
    } as unknown as GuildsService;
    const prisma = {
      readState: { upsert: () => ({}) },
      async $transaction() {
        return [];
      },
    } as unknown as PrismaService;

    const resultado = await new GuildReadController(prisma, guilds, realtime).markRead(ANA, "g1");

    const [evento] = doEvento(emissoes, WS_EVENTS.CHANNEL_READ);
    expect(evento.salas).toEqual(["user:ana"]);
    expect(evento.payload).toEqual({
      channelIds: ["c1", "c2"],
      lastReadAt: resultado.lastReadAt,
      guildId: "g1",
    });
  });

  it('"marcar tudo como lido" manda um lote só, sem servidor', async () => {
    const { realtime, emissoes } = servidorDeMentira();
    const guilds = {
      async visibleChannelsForUser() {
        return [{ id: "c1" }, { id: "d7" }];
      },
    } as unknown as GuildsService;
    const prisma = {
      readState: { upsert: () => ({}) },
      async $transaction() {
        return [];
      },
    } as unknown as PrismaService;
    const inbox = new InboxService(
      prisma,
      guilds,
      {} as unknown as ReadStateService,
      {} as unknown as MessagesService,
      realtime,
    );

    await inbox.markAllRead("ana");

    const [evento] = doEvento(emissoes, WS_EVENTS.CHANNEL_READ);
    expect(evento.salas).toEqual(["user:ana"]);
    expect(evento.payload).toMatchObject({ channelIds: ["c1", "d7"], guildId: null });
  });
});

// ── conversas ────────────────────────────────────────────────

/** `DmsService` com o mínimo para fechar/sair de conversa. */
function servicoDeConversas(canal: Record<string, unknown>) {
  const { realtime, emissoes } = servidorDeMentira();
  const prisma = {
    channel: {
      async findFirst() {
        return canal;
      },
      async findUnique() {
        return canal;
      },
      async delete() {
        return canal;
      },
    },
    dMHidden: {
      async upsert() {
        return {};
      },
    },
    channelMember: {
      async delete() {
        return {};
      },
    },
    // fechar e sair também desafixam a conversa (menus de contexto)
    dMPin: {
      async deleteMany() {
        return { count: 0 };
      },
    },
    message: {
      async create() {
        return { id: "m1" };
      },
    },
    async $transaction() {
      return [];
    },
  } as unknown as PrismaService;
  const messages = {
    async getDTO() {
      return { id: "m1" };
    },
  } as unknown as MessagesService;
  const dms = new DMsService(
    prisma,
    realtime,
    {} as unknown as ReadStateService,
    {} as unknown as FriendsService,
    messages,
    {} as unknown as StorageService,
    // voz: estes testes não tocam chamada — o par que `sairDaChamada` usa
    { async expulsarDaVoz() {} } as unknown as VoiceService,
    { async onDisconnect() {} } as unknown as CallsService,
  );
  return { dms, emissoes };
}

describe("a conversa sai da coluna", () => {
  it("fechar avisa só as minhas conexões — o outro lado continua com ela", async () => {
    const { dms, emissoes } = servicoDeConversas({
      id: "d1",
      type: "DM",
      guildId: null,
      members: [{ userId: "ana" }, { userId: "bia" }],
    });

    await dms.hide("ana", "d1");

    expect(doEvento(emissoes, WS_EVENTS.CHANNEL_DELETED)).toEqual([
      {
        salas: ["user:ana"],
        evento: "channel.deleted",
        payload: { channelId: "d1", guildId: null },
      },
    ]);
  });

  it("sair do grupo tira o grupo das minhas outras conexões", async () => {
    const { dms, emissoes } = servicoDeConversas({
      id: "gr1",
      type: "GROUP",
      guildId: null,
      ownerId: "bia",
      members: [{ userId: "ana" }, { userId: "bia" }],
    });

    await dms.leaveGroup("ana", "gr1");

    const paraMim = doEvento(emissoes, WS_EVENTS.CHANNEL_DELETED);
    expect(paraMim).toHaveLength(1);
    expect(paraMim[0].salas).toEqual(["user:ana"]);
  });
});

// ── amizade ──────────────────────────────────────────────────

describe("amizade", () => {
  function servicoDeAmizade() {
    const { realtime, emissoes } = servidorDeMentira();
    const bia = {
      id: "bia",
      username: "bia",
      displayName: null,
      avatarUrl: null,
      status: "ONLINE",
      customStatusText: null,
      customStatusEmoji: null,
      customStatusExpiresAt: null,
    };
    const prisma = {
      user: {
        async findUnique() {
          return bia;
        },
      },
      friendship: {
        async findUnique() {
          return null;
        },
        async create() {
          return {
            id: "f1",
            requesterId: "ana",
            addresseeId: "bia",
            createdAt: new Date("2026-09-03T12:00:00.000Z"),
            requester: { ...bia, id: "ana", username: "ana" },
            addressee: bia,
          };
        },
        async deleteMany() {
          return {};
        },
      },
      block: {
        async count() {
          return 0;
        },
        async findFirst() {
          return null;
        },
        async upsert() {
          return {};
        },
      },
      // d-social: bloquear procura a DM da dupla para tirá-la da minha coluna.
      // Aqui os dois nunca conversaram — não há canal, e o que este teste olha
      // é só o aviso `user.blocked`.
      channel: {
        async findUnique() {
          return null;
        },
      },
      dMHidden: {
        async upsert() {
          return {};
        },
      },
      // bloquear apaga os apelidos de amigo nos dois sentidos
      friendNickname: {
        async findMany() {
          return [];
        },
        async deleteMany() {
          return { count: 0 };
        },
      },
      async $transaction() {
        return [];
      },
    } as unknown as PrismaService;
    return { friends: new FriendsService(prisma, realtime), emissoes };
  }

  it("o pedido chega aos dois lados, cada um com a sua direção", async () => {
    const { friends, emissoes } = servicoDeAmizade();

    await friends.request("ana", "bia");

    const pedidos = doEvento(emissoes, WS_EVENTS.FRIEND_REQUEST);
    expect(pedidos.map((e) => e.salas)).toEqual([["user:bia"], ["user:ana"]]);
    expect(pedidos.map((e) => (e.payload as { direcao: string }).direcao)).toEqual([
      "incoming",
      "outgoing",
    ]);
  });

  it("bloquear manda a pessoa junto, para as minhas listas mudarem sem refazer o GET", async () => {
    const { friends, emissoes } = servicoDeAmizade();

    await friends.block("ana", "bia");

    const [evento] = doEvento(emissoes, WS_EVENTS.USER_BLOCKED);
    expect(evento.salas).toEqual(["user:ana"]);
    expect(evento.payload).toMatchObject({ userId: "bia", blocked: true, user: { id: "bia" } });
  });
});

// ── perfil ───────────────────────────────────────────────────

describe("perfil", () => {
  it("tirar o banner avisa, como trocá-lo já avisava", async () => {
    const { realtime, emissoes } = servidorDeMentira();
    const eu = {
      id: "ana",
      username: "ana",
      displayName: null,
      avatarUrl: null,
      status: "ONLINE",
      bannerKey: "banners/ana/antigo",
      customStatusText: null,
      customStatusEmoji: null,
      customStatusExpiresAt: null,
    };
    const prisma = {
      user: {
        async findUnique() {
          return eu;
        },
        async update() {
          return { ...eu, bannerKey: null };
        },
      },
    } as unknown as PrismaService;
    const storage = { async delete() {} } as unknown as StorageService;
    const users = new UsersService(
      prisma,
      realtime,
      storage,
      {} as unknown as FriendsService,
    );

    await users.removeBanner("ana");

    expect(doEvento(emissoes, WS_EVENTS.USER_UPDATED)).toHaveLength(1);
  });
});

// ── servidores ───────────────────────────────────────────────

describe("entrar por Descobrir", () => {
  it("põe o servidor no rail de todas as minhas conexões (como o convite)", async () => {
    const { realtime, emissoes } = servidorDeMentira();
    const prisma = {
      guild: {
        async findUnique() {
          return {
            id: "g1",
            name: "Público",
            discoverable: true,
            iconUrl: null,
            ownerId: "bia",
            description: null,
            bannerColor: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          };
        },
      },
      guildMember: {
        async findUnique() {
          return null;
        },
        async create() {
          return {};
        },
      },
      user: {
        async findUnique() {
          return {
            id: "ana",
            username: "ana",
            displayName: null,
            avatarUrl: null,
            status: "ONLINE",
            customStatusText: null,
            customStatusEmoji: null,
            customStatusExpiresAt: null,
          };
        },
      },
      channel: {
        async findMany() {
          return [];
        },
      },
    } as unknown as PrismaService;
    const guilds = {
      async isBanned() {
        return false;
      },
    } as unknown as GuildsService;
    const onboarding = { async announceJoin() {} } as unknown as OnboardingService;

    await new DiscoveryService(prisma, guilds, realtime, onboarding).join("ana", "g1");

    const [evento] = doEvento(emissoes, WS_EVENTS.GUILD_JOINED);
    expect(evento.salas).toEqual(["user:ana"]);
    expect(evento.payload).toMatchObject({ guild: { id: "g1" }, reason: "joined" });
  });
});

describe("onboarding do servidor", () => {
  it("aceitar as regras destranca o servidor nas minhas outras conexões", async () => {
    const { realtime, emissoes } = servidorDeMentira();
    const prisma = {
      guildMember: {
        async update() {
          return { acceptedRulesAt: new Date("2026-09-03T12:00:00.000Z") };
        },
      },
    } as unknown as PrismaService;
    const guilds = {
      async assertMember() {
        return { acceptedRulesAt: null };
      },
    } as unknown as GuildsService;
    const onboarding = new OnboardingService(
      prisma,
      guilds,
      realtime,
      {} as unknown as AuditService,
    );

    await onboarding.acceptRules("ana", "g1");

    expect(doEvento(emissoes, WS_EVENTS.GUILD_SETTINGS_UPDATED)).toEqual([
      { salas: ["user:ana"], evento: "guild.settingsUpdated", payload: { guildId: "g1" } },
    ]);
  });
});
