import { describe, expect, it, vi } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import { FriendsService } from "./friends.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * Item 4 do CONTRATO-MENUS: ignorar. Diferente de bloquear — não mexe em
 * amizade/bloqueio, e o alvo nunca sabe (a API não conta nada a ele).
 */

const EU = "ana";
const ALVO = "bia";
const ALVO_ROW = { id: ALVO, username: "bia", displayName: null, avatarUrl: null, status: "OFFLINE" };

function montar(opts: { alvoExiste?: boolean } = {}) {
  const { alvoExiste = true } = opts;
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(alvoExiste ? ALVO_ROW : null) },
    userIgnore: {
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const realtime = { emitToUser: vi.fn() } as unknown as RealtimeService;
  const service = new FriendsService(prisma, realtime);
  return { service, prisma, realtime };
}

describe("POST /friends/ignores", () => {
  it("ignora e emite user.ignored (ignorado: true) só para user:<eu>", async () => {
    const { service, prisma, realtime } = montar();
    const dto = await service.ignorarUsuario(EU, ALVO);
    expect(dto.ignorado).toBe(true);
    expect(dto.userId).toBe(ALVO);
    expect(dto.user.id).toBe(ALVO);
    expect(prisma.userIgnore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ignorerId_ignoredId: { ignorerId: EU, ignoredId: ALVO } },
        create: { ignorerId: EU, ignoredId: ALVO },
      }),
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith(EU, WS_EVENTS.USER_IGNORED, dto);
    // o ignorado não fica sabendo
    expect(realtime.emitToUser).not.toHaveBeenCalledWith(
      ALVO,
      WS_EVENTS.USER_IGNORED,
      expect.anything(),
    );
  });

  it("ignorar a si mesmo dá 400", async () => {
    const { service } = montar();
    await expect(service.ignorarUsuario(EU, EU)).rejects.toMatchObject({ status: 400 });
  });

  it("alvo inexistente dá 404", async () => {
    const { service } = montar({ alvoExiste: false });
    await expect(service.ignorarUsuario(EU, ALVO)).rejects.toMatchObject({ status: 404 });
  });

  it("é idempotente: ignorar de novo continua respondendo ignorado: true", async () => {
    const { service } = montar();
    await service.ignorarUsuario(EU, ALVO);
    await expect(service.ignorarUsuario(EU, ALVO)).resolves.toMatchObject({ ignorado: true });
  });
});

describe("DELETE /friends/ignores/:userId", () => {
  it("deixa de ignorar e emite user.ignored (ignorado: false)", async () => {
    const { service, prisma, realtime } = montar();
    const dto = await service.deixarDeIgnorar(EU, ALVO);
    expect(dto).toMatchObject({ userId: ALVO, ignorado: false });
    expect(prisma.userIgnore.delete).toHaveBeenCalledWith({
      where: { ignorerId_ignoredId: { ignorerId: EU, ignoredId: ALVO } },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(EU, WS_EVENTS.USER_IGNORED, dto);
  });

  it("é idempotente mesmo sem nunca ter ignorado (delete falha e é ignorado)", async () => {
    const { service, prisma } = montar();
    prisma.userIgnore.delete = vi.fn().mockRejectedValue(new Error("P2025"));
    await expect(service.deixarDeIgnorar(EU, ALVO)).resolves.toMatchObject({ ignorado: false });
  });

  it("alvo inexistente dá 404", async () => {
    const { service } = montar({ alvoExiste: false });
    await expect(service.deixarDeIgnorar(EU, ALVO)).rejects.toMatchObject({ status: 404 });
  });
});
