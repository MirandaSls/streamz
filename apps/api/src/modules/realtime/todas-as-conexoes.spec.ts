import { describe, expect, it } from "vitest";
import type { Server } from "socket.io";
import { WS_EVENTS } from "@streamz/shared";
import { RealtimeService } from "./realtime.service";
import { InvitesService } from "../invites/invites.service";
import type { AuditService } from "../audit/audit.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { OnboardingService } from "../onboarding/onboarding.service";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * "Entrei num servidor de um aparelho e o outro não soube."
 *
 * A regra que estes testes prendem: o que muda a lista de servidores da conta
 * sai para a **sala do usuário** (`user:<id>`), onde estão *todas* as conexões
 * dela — não para o socket que fez a requisição. Sem isso, aceitar o convite no
 * site deixava o desktop com o rail velho até reiniciar.
 */

/** `Server` de mentira que anota para quais salas cada emissão foi. */
function servidorDeMentira() {
  const emissoes: { salas: string[]; evento: string; payload: unknown }[] = [];
  const entradas: { de: string; sala: string }[] = [];
  const server = {
    to(salas: string | string[]) {
      const lista = Array.isArray(salas) ? salas : [salas];
      return {
        emit(evento: string, payload: unknown) {
          emissoes.push({ salas: lista, evento, payload });
        },
      };
    },
    in(sala: string) {
      return {
        socketsJoin(alvo: string) {
          entradas.push({ de: sala, sala: alvo });
        },
        socketsLeave() {},
      };
    },
    emit() {},
  } as unknown as Server;
  const realtime = new RealtimeService();
  realtime.bind(server);
  return { realtime, emissoes, entradas };
}

describe("RealtimeService", () => {
  it("emitToUser vai para a sala do usuário, que tem todas as conexões dele", () => {
    const { realtime, emissoes } = servidorDeMentira();
    realtime.emitToUser("ana", WS_EVENTS.GUILD_JOINED, { guild: { id: "g1" } });
    expect(emissoes).toEqual([
      { salas: ["user:ana"], evento: "guild.joined", payload: { guild: { id: "g1" } } },
    ]);
  });

  it("joinGuildRoom põe todos os sockets do usuário na sala do servidor", () => {
    const { realtime, entradas } = servidorDeMentira();
    realtime.joinGuildRoom("ana", "g1");
    expect(entradas).toEqual([{ de: "user:ana", sala: "guild:g1" }]);
  });
});

/** Convite válido, sem limite de usos, num servidor de que ninguém é membro. */
function servicoDeConvites() {
  const { realtime, emissoes, entradas } = servidorDeMentira();
  const guild = {
    id: "g1",
    name: "Time de produto",
    iconUrl: null,
    ownerId: "bia",
    description: null,
  };
  const prisma = {
    invite: {
      async findUnique() {
        return {
          id: "i1",
          code: "jsc2zafi",
          guildId: "g1",
          expiresAt: null,
          maxUses: null,
          uses: 0,
          guild,
        };
      },
      async update() {
        return {};
      },
    },
    guildMember: {
      async findUnique() {
        return null; // ainda não sou membro
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
    async $transaction(fn: (tx: unknown) => Promise<void>) {
      await fn(prisma);
    },
  } as unknown as PrismaService;

  const guilds = {
    async isBanned() {
      return false;
    },
    async resyncChannelRooms() {},
  } as unknown as GuildsService;
  const onboarding = { async announceJoin() {} } as unknown as OnboardingService;
  const audit = { async log() {} } as unknown as AuditService;

  return {
    invites: new InvitesService(prisma, guilds, realtime, audit, onboarding),
    emissoes,
    entradas,
  };
}

describe("resgatar um convite", () => {
  it("avisa todas as conexões de quem entrou e põe os sockets na sala do servidor", async () => {
    const { invites, emissoes, entradas } = servicoDeConvites();

    await invites.redeem("ana", "jsc2zafi");

    const paraMim = emissoes.filter((e) => e.evento === WS_EVENTS.GUILD_JOINED);
    expect(paraMim).toHaveLength(1);
    // a sala do usuário — não um socket, não a sala do servidor
    expect(paraMim[0].salas).toEqual(["user:ana"]);
    expect(paraMim[0].payload).toEqual({
      guild: {
        id: "g1",
        name: "Time de produto",
        iconUrl: null,
        ownerId: "bia",
        description: null,
        unread: false,
        mentionCount: 0,
      },
      reason: "joined",
    });
    // e a sala do servidor recebe o membro novo, como já recebia
    expect(emissoes.some((e) => e.evento === WS_EVENTS.MEMBER_JOINED)).toBe(true);
    // sem isto o socket já aberto não receberia nada do servidor novo
    expect(entradas).toContainEqual({ de: "user:ana", sala: "guild:g1" });
  });
});
