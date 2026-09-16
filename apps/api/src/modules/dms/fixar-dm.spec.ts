import { describe, expect, it } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import type { ConversaFixadaEvent } from "@streamz/shared";
import { DMsService } from "./dms.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { FriendsService } from "../friends/friends.service";
import type { MessagesService } from "../messages/messages.service";
import type { StorageService } from "../storage/storage.service";

/**
 * Fixar/desafixar conversa de DM (`PUT`/`DELETE /dms/:id/pin`, item 1 do
 * contrato de menus): idempotência, permissão de participante, a ordem da
 * lista (`compararConversas`) e o desafixar automático ao fechar a conversa.
 */

const ANA = "ana";
const BIA = "bia";
const CAIO = "caio";

function usuario(id: string) {
  return {
    id,
    username: id,
    displayName: null,
    avatarUrl: null,
    status: "ONLINE",
    customStatusText: null,
    customStatusEmoji: null,
    customStatusExpiresAt: null,
  };
}

function canal(id: string, opcoes: { guildId?: string | null; criadoEm?: Date } = {}) {
  return {
    id,
    guildId: opcoes.guildId ?? null,
    name: null,
    type: "DM",
    position: 0,
    private: false,
    readOnly: false,
    categoryId: null,
    topic: null,
    slowmodeSeconds: 0,
    nsfw: false,
    ownerId: null,
    iconKey: null,
    pairKey: `${ANA}:${BIA}:${id}`,
    createdAt: opcoes.criadoEm ?? new Date("2026-09-01T10:00:00Z"),
    members: [
      { userId: ANA, user: usuario(ANA) },
      { userId: BIA, user: usuario(BIA) },
    ],
  };
}

/**
 * Serviço com um punhado de conversas da ana e um "relógio" de fixação
 * determinístico (para a ordem entre fixadas não depender da velocidade do
 * teste): cada `dMPin.upsert` novo grava um instante estritamente maior que o
 * anterior.
 */
function servico(canais: ReturnType<typeof canal>[], ultimaMensagem: Record<string, Date> = {}) {
  const escondidas: { userId: string; channelId: string; hiddenAt: Date }[] = [];
  const pins: { userId: string; channelId: string; pinnedAt: Date }[] = [];
  const eventos: { userId: string; evento: string; payload: unknown }[] = [];
  let relogio = 0;

  const prisma = {
    $transaction: async (acoes: Promise<unknown>[]) => Promise.all(acoes),
    channel: {
      findMany: async () => canais,
      findFirst: async ({
        where,
      }: {
        where: { id: string; guildId: null; members: { some: { userId: string } } };
      }) =>
        canais.find(
          (c) =>
            c.id === where.id &&
            c.guildId === where.guildId &&
            c.members.some((m) => m.userId === where.members.some.userId),
        ) ?? null,
    },
    $queryRaw: async () => [],
    attachment: { findMany: async () => [] },
    dMHidden: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        escondidas.filter((h) => h.userId === where.userId),
      upsert: async ({ where }: { where: { userId_channelId: { userId: string; channelId: string } } }) => {
        const { userId, channelId } = where.userId_channelId;
        const atual = escondidas.find((h) => h.userId === userId && h.channelId === channelId);
        if (atual) atual.hiddenAt = new Date();
        else escondidas.push({ userId, channelId, hiddenAt: new Date() });
      },
      deleteMany: async ({ where }: { where: { userId: string; channelId: string } }) => {
        const i = escondidas.findIndex(
          (h) => h.userId === where.userId && h.channelId === where.channelId,
        );
        if (i >= 0) escondidas.splice(i, 1);
      },
    },
    dMPin: {
      findUnique: async ({
        where,
      }: {
        where: { userId_channelId: { userId: string; channelId: string } };
      }) => {
        const { userId, channelId } = where.userId_channelId;
        return pins.find((p) => p.userId === userId && p.channelId === channelId) ?? null;
      },
      findMany: async ({
        where,
      }: {
        where: { userId?: string; channelId?: string | { in: string[] } };
      }) =>
        pins.filter((p) => {
          if (where.userId && p.userId !== where.userId) return false;
          if (typeof where.channelId === "string" && p.channelId !== where.channelId) return false;
          if (
            where.channelId &&
            typeof where.channelId === "object" &&
            !where.channelId.in.includes(p.channelId)
          )
            return false;
          return true;
        }),
      upsert: async ({
        where,
      }: {
        where: { userId_channelId: { userId: string; channelId: string } };
      }) => {
        const { userId, channelId } = where.userId_channelId;
        let p = pins.find((x) => x.userId === userId && x.channelId === channelId);
        if (!p) {
          p = { userId, channelId, pinnedAt: new Date(relogio++) };
          pins.push(p);
        }
        return p;
      },
      deleteMany: async ({ where }: { where: { userId: string; channelId: string } }) => {
        let removidas = 0;
        for (let i = pins.length - 1; i >= 0; i--) {
          if (pins[i].userId === where.userId && pins[i].channelId === where.channelId) {
            pins.splice(i, 1);
            removidas++;
          }
        }
        return { count: removidas };
      },
    },
  } as unknown as PrismaService;

  const readState = {
    async summaries(_userId: string, _username: string, ids: string[]) {
      return new Map(
        ids.map((id) => [
          id,
          {
            lastMessageAt: ultimaMensagem[id] ?? null,
            lastReadAt: null,
            mentionCount: 0,
            unreadCount: 0,
          },
        ]),
      );
    },
  } as unknown as ReadStateService;

  const realtime = {
    emitToUser(userId: string, evento: string, payload: unknown) {
      eventos.push({ userId, evento, payload });
    },
    joinChannelRooms() {},
    leaveChannelRooms() {},
  } as unknown as RealtimeService;

  const service = new DMsService(
    prisma,
    realtime,
    readState,
    {} as FriendsService,
    {} as MessagesService,
    {} as StorageService,
  );
  return { service, pins, escondidas, eventos };
}

describe("fixar/desafixar conversa (PUT/DELETE /dms/:id/pin)", () => {
  it("fixa: grava o DMPin, emite dm.pinUpdated e devolve fixadaEm preenchido", async () => {
    const canais = [canal("c1")];
    const { service, eventos } = servico(canais);

    const evento = await service.pin(ANA, "c1");
    expect(evento.channelId).toBe("c1");
    expect(evento.fixadaEm).toEqual(expect.any(String));

    const dm = await service.get(ANA, "c1");
    expect(dm.fixadaEm).toBe(evento.fixadaEm);

    const emitido = eventos.at(-1);
    expect(emitido?.userId).toBe(ANA);
    expect(emitido?.evento).toBe(WS_EVENTS.DM_PIN_UPDATED);
    expect((emitido?.payload as ConversaFixadaEvent).fixadaEm).toBe(evento.fixadaEm);
  });

  it("fixar é idempotente: fixar de novo devolve o mesmo pinnedAt", async () => {
    const { service, pins } = servico([canal("c1")]);
    const primeiro = await service.pin(ANA, "c1");
    const segundo = await service.pin(ANA, "c1");
    expect(segundo.fixadaEm).toBe(primeiro.fixadaEm);
    expect(pins).toHaveLength(1);
  });

  it("desafixa: apaga o DMPin e devolve fixadaEm null, mesmo repetindo", async () => {
    const { service } = servico([canal("c1")]);
    await service.pin(ANA, "c1");

    const evento = await service.unpin(ANA, "c1");
    expect(evento).toEqual({ channelId: "c1", fixadaEm: null });
    expect((await service.get(ANA, "c1")).fixadaEm).toBeNull();

    // desafixar o que já está desafixado também responde null (idempotente)
    await expect(service.unpin(ANA, "c1")).resolves.toEqual({ channelId: "c1", fixadaEm: null });
  });

  it("404 para quem não participa da conversa", async () => {
    const { service } = servico([canal("c1")]);
    await expect(service.pin(CAIO, "c1")).rejects.toThrow("Conversa não encontrada");
    await expect(service.unpin(CAIO, "c1")).rejects.toThrow("Conversa não encontrada");
  });

  it("404 para canal de servidor (não é DM/GROUP)", async () => {
    const { service } = servico([canal("c1", { guildId: "g1" })]);
    await expect(service.pin(ANA, "c1")).rejects.toThrow("Conversa não encontrada");
  });

  it("ordem da lista: fixadas primeiro (por ordem de fixação), depois por atividade", async () => {
    const canais = [canal("c1"), canal("c2"), canal("c3"), canal("c4")];
    const { service } = servico(canais, {
      c3: new Date("2026-09-10T10:00:00Z"),
      c4: new Date("2026-09-05T10:00:00Z"),
    });

    // fixa c2 antes de c1: c2 entra primeiro no bloco das fixadas
    await service.pin(ANA, "c2");
    await service.pin(ANA, "c1");

    const lista = await service.list(ANA, ANA);
    expect(lista.map((c) => c.id)).toEqual(["c2", "c1", "c3", "c4"]);
    expect(lista.find((c) => c.id === "c2")?.fixadaEm).toEqual(expect.any(String));
    expect(lista.find((c) => c.id === "c3")?.fixadaEm).toBeNull();
  });

  it("fechar a conversa (hide) desafixa", async () => {
    const { service, eventos } = servico([canal("c1")]);
    await service.pin(ANA, "c1");
    expect((await service.get(ANA, "c1")).fixadaEm).not.toBeNull();

    await service.hide(ANA, "c1");
    expect((await service.get(ANA, "c1")).fixadaEm).toBeNull();

    const pinEventos = eventos.filter((e) => e.evento === WS_EVENTS.DM_PIN_UPDATED);
    expect((pinEventos.at(-1)?.payload as ConversaFixadaEvent).fixadaEm).toBeNull();
  });
});
