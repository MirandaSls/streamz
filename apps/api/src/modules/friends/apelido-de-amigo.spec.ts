import { describe, expect, it, vi } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import { FriendsService } from "./friends.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * Item 3 do CONTRATO-MENUS: apelido de amigo — só entre amigos, some nos dois
 * sentidos quando a amizade acaba (remoção ou bloqueio).
 */

const EU = "ana";
const AMIGO = "bia";

function montar(opts: { amizade?: "ACCEPTED" | "PENDING" | null } = {}) {
  const { amizade = "ACCEPTED" } = opts;
  const prisma = {
    friendship: {
      findUnique: vi
        .fn()
        .mockResolvedValue(amizade ? { id: "f1", status: amizade } : null),
    },
    friendNickname: {
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  const realtime = { emitToUser: vi.fn() } as unknown as RealtimeService;
  const service = new FriendsService(prisma, realtime);
  return { service, prisma, realtime };
}

describe("PUT /friends/:userId/nickname", () => {
  it("com amizade ACCEPTED, grava (upsert) e emite friend.nicknameUpdated para user:<eu>", async () => {
    const { service, prisma, realtime } = montar();
    const dto = await service.definirApelidoDeAmigo(EU, AMIGO, "Bibi");
    expect(dto).toEqual({ userId: AMIGO, apelido: "Bibi" });
    expect(prisma.friendNickname.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId_targetId: { ownerId: EU, targetId: AMIGO } },
        create: { ownerId: EU, targetId: AMIGO, nickname: "Bibi" },
        update: { nickname: "Bibi" },
      }),
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith(EU, WS_EVENTS.FRIEND_NICKNAME_UPDATED, dto);
    // privado: só a minha aba recebe o evento
    expect(realtime.emitToUser).not.toHaveBeenCalledWith(
      AMIGO,
      WS_EVENTS.FRIEND_NICKNAME_UPDATED,
      expect.anything(),
    );
  });

  it("sem amizade, dá 400", async () => {
    const { service } = montar({ amizade: null });
    await expect(service.definirApelidoDeAmigo(EU, AMIGO, "Bibi")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("com pedido pendente (ainda não amigos), dá 400", async () => {
    const { service } = montar({ amizade: "PENDING" });
    await expect(service.definirApelidoDeAmigo(EU, AMIGO, "Bibi")).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("DELETE /friends/:userId/nickname", () => {
  it("remove e emite apelido: null", async () => {
    const { service, prisma, realtime } = montar();
    const dto = await service.removerApelidoDeAmigo(EU, AMIGO);
    expect(dto).toEqual({ userId: AMIGO, apelido: null });
    expect(prisma.friendNickname.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: EU, targetId: AMIGO },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(EU, WS_EVENTS.FRIEND_NICKNAME_UPDATED, dto);
  });

  it("é idempotente mesmo sem apelido gravado", async () => {
    const { service, prisma } = montar();
    prisma.friendNickname.deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    await expect(service.removerApelidoDeAmigo(EU, AMIGO)).resolves.toEqual({
      userId: AMIGO,
      apelido: null,
    });
  });
});

describe("apelido some quando a amizade acaba", () => {
  it("removeFriend apaga o apelido nos dois sentidos e avisa cada dono", async () => {
    const prisma = {
      friendship: {
        findUnique: vi.fn().mockResolvedValue({ id: "f1", status: "ACCEPTED" }),
        delete: vi.fn().mockReturnValue({ op: "friendship.delete" }),
      },
      friendNickname: {
        findMany: vi.fn().mockResolvedValue([
          { ownerId: EU, targetId: AMIGO },
          { ownerId: AMIGO, targetId: EU },
        ]),
        deleteMany: vi.fn().mockReturnValue({ op: "friendNickname.deleteMany" }),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const realtime = { emitToUser: vi.fn() } as unknown as RealtimeService;
    const service = new FriendsService(prisma, realtime);

    await service.removeFriend(EU, AMIGO);

    expect(realtime.emitToUser).toHaveBeenCalledWith(EU, WS_EVENTS.FRIEND_NICKNAME_UPDATED, {
      userId: AMIGO,
      apelido: null,
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(AMIGO, WS_EVENTS.FRIEND_NICKNAME_UPDATED, {
      userId: EU,
      apelido: null,
    });
  });

  it("sem apelido gravado, removeFriend não emite friend.nicknameUpdated", async () => {
    const prisma = {
      friendship: {
        findUnique: vi.fn().mockResolvedValue({ id: "f1", status: "ACCEPTED" }),
        delete: vi.fn().mockReturnValue({ op: "friendship.delete" }),
      },
      friendNickname: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockReturnValue({ op: "friendNickname.deleteMany" }),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const realtime = { emitToUser: vi.fn() } as unknown as RealtimeService;
    const service = new FriendsService(prisma, realtime);

    await service.removeFriend(EU, AMIGO);

    expect(realtime.emitToUser).not.toHaveBeenCalledWith(
      expect.anything(),
      WS_EVENTS.FRIEND_NICKNAME_UPDATED,
      expect.anything(),
    );
  });
});
