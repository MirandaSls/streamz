import { describe, expect, it, vi } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import { UsersService } from "./users.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { StorageService } from "../storage/storage.service";
import type { FriendsService } from "../friends/friends.service";

/**
 * Item 2 do CONTRATO-MENUS: nota privada sobre outro usuário.
 * `GET /users/me/notes`, `GET`/`PUT /users/:id/note` — texto vazio apaga,
 * evento `user.noteUpdated` só para `user:<eu>`.
 */

const EU = "ana";
const ALVO = "bia";

function montar(opts: { alvoExiste?: boolean; notaAtual?: string | null } = {}) {
  const { alvoExiste = true, notaAtual = null } = opts;
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(alvoExiste ? { id: ALVO } : null),
    },
    userNote: {
      findMany: vi.fn().mockResolvedValue(
        notaAtual ? [{ targetId: ALVO, text: notaAtual }] : [],
      ),
      findUnique: vi.fn().mockResolvedValue(notaAtual ? { text: notaAtual } : null),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  const realtime = { emitToUser: vi.fn() } as unknown as RealtimeService;
  const storage = {} as StorageService;
  const friends = {} as FriendsService;
  const service = new UsersService(prisma, realtime, storage, friends);
  return { service, prisma, realtime };
}

describe("GET /users/me/notes", () => {
  it("devolve as notas por id do alvo", async () => {
    const { service } = montar({ notaAtual: "gosta de gatos" });
    await expect(service.minhasNotas(EU)).resolves.toEqual({ [ALVO]: "gosta de gatos" });
  });

  it("sem notas, devolve objeto vazio", async () => {
    const { service } = montar();
    await expect(service.minhasNotas(EU)).resolves.toEqual({});
  });
});

describe("GET /users/:id/note", () => {
  it("com nota gravada, devolve o texto", async () => {
    const { service } = montar({ notaAtual: "chefe do bia" });
    await expect(service.notaDeUsuario(EU, ALVO)).resolves.toEqual({
      userId: ALVO,
      nota: "chefe do bia",
    });
  });

  it("sem nota, devolve null", async () => {
    const { service } = montar();
    await expect(service.notaDeUsuario(EU, ALVO)).resolves.toEqual({ userId: ALVO, nota: null });
  });

  it("alvo inexistente dá 404", async () => {
    const { service } = montar({ alvoExiste: false });
    await expect(service.notaDeUsuario(EU, ALVO)).rejects.toMatchObject({ status: 404 });
  });
});

describe("PUT /users/:id/note", () => {
  it("com texto, grava (upsert) e emite user.noteUpdated para user:<eu>", async () => {
    const { service, prisma, realtime } = montar();
    const dto = await service.salvarNota(EU, ALVO, "gosta de café");
    expect(dto).toEqual({ userId: ALVO, nota: "gosta de café" });
    expect(prisma.userNote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId_targetId: { ownerId: EU, targetId: ALVO } },
        create: { ownerId: EU, targetId: ALVO, text: "gosta de café" },
        update: { text: "gosta de café" },
      }),
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith(EU, WS_EVENTS.USER_NOTE_UPDATED, dto);
  });

  it("com texto vazio, apaga (deleteMany) e responde nota: null", async () => {
    const { service, prisma, realtime } = montar({ notaAtual: "antiga" });
    const dto = await service.salvarNota(EU, ALVO, "");
    expect(dto).toEqual({ userId: ALVO, nota: null });
    expect(prisma.userNote.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: EU, targetId: ALVO },
    });
    expect(prisma.userNote.upsert).not.toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(EU, WS_EVENTS.USER_NOTE_UPDATED, dto);
  });

  it("nota sobre mim mesmo dá 400", async () => {
    const { service } = montar();
    await expect(service.salvarNota(EU, EU, "oi")).rejects.toMatchObject({ status: 400 });
  });

  it("alvo inexistente dá 404", async () => {
    const { service } = montar({ alvoExiste: false });
    await expect(service.salvarNota(EU, ALVO, "oi")).rejects.toMatchObject({ status: 404 });
  });
});
