import { describe, expect, it, vi } from "vitest";
import { InboxService } from "./inbox.service";
import type { PrismaService } from "../../prisma/prisma.service";

/** Avisos de moderação: só o dono lê e dispensa, e o DTO sai com data ISO. */
function criar(linhas: unknown[] = []) {
  const findMany = vi.fn().mockResolvedValue(linhas);
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const prisma = { moderationNotice: { findMany, deleteMany } } as unknown as PrismaService;
  const svc = new InboxService(prisma, {} as never, {} as never, {} as never, {} as never);
  return { svc, findMany, deleteMany };
}

describe("avisos de moderação", () => {
  it("lista só os do usuário, recentes primeiro, teto 50, createdAt ISO", async () => {
    const d = new Date("2026-01-02T03:04:05.000Z");
    const { svc, findMany } = criar([
      { id: "n1", userId: "u1", guildId: "g1", guildName: "G", action: "KICK", reason: null, createdAt: d },
    ]);
    const r = await svc.moderationNotices("u1");
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    expect(r[0].createdAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("dispensar filtra por id e usuário e é idempotente", async () => {
    const { svc, deleteMany } = criar();
    expect(await svc.dismissModerationNotice("u1", "n1")).toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "n1", userId: "u1" } });
  });
});
