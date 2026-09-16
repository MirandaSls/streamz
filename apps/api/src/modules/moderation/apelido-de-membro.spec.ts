import { ForbiddenException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import type { MemberRole } from "@streamz/shared";
import { NicknameDto } from "./moderation.controller";
import { ModerationService } from "./moderation.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { AuditService } from "../audit/audit.service";
import type { DMsService } from "../dms/dms.service";

/**
 * `PATCH /guilds/:guildId/members/:userId/nickname` — cartão
 * `api-apelido-de-membro`: apelido de **outro** membro (como no Discord),
 * `MANAGE_NICKNAMES` + hierarquia, e o próprio segue a regra de sempre
 * (`PATCH /guilds/:guildId/membership`, sem permissão nenhuma).
 */

interface Membro {
  userId: string;
  guildId: string;
  role: MemberRole;
  nickname: string | null;
}

interface Evento {
  alvo: string;
  evento: string;
  payload: unknown;
}

/** `rank` de cada membro pela ordem em `ranks` (maior índice = mais alto). */
function servicoCom(membros: Membro[], ranks: Record<string, number>) {
  const porId = new Map(membros.map((m) => [`${m.userId}:${m.guildId}`, { ...m }]));
  const eventos: Evento[] = [];
  const semPermissao = new Set<string>();

  const prisma = {
    guildMember: {
      findUnique: async ({ where }: { where: { userId_guildId: { userId: string; guildId: string } } }) => {
        const { userId, guildId } = where.userId_guildId;
        return porId.get(`${userId}:${guildId}`) ?? null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { userId_guildId: { userId: string; guildId: string } };
        data: Partial<Membro>;
      }) => {
        const key = `${where.userId_guildId.userId}:${where.userId_guildId.guildId}`;
        const atual = porId.get(key)!;
        const atualizado = { ...atual, ...data };
        porId.set(key, atualizado);
        return atualizado;
      },
    },
  };
  const guilds = {
    assertMember: async (userId: string, guildId: string) => {
      const m = porId.get(`${userId}:${guildId}`);
      if (!m) throw new Error("não é membro");
      return m;
    },
    assertCanModerate: async (actorId: string, _guildId: string) => {
      if (semPermissao.has(actorId)) throw new ForbiddenException("Você não tem permissão para isso");
      return porId.get(`${actorId}:${_guildId}`)!;
    },
    rank: async (_guildId: string, userId: string) => ranks[userId] ?? 0,
  };
  const realtime = {
    emitToGuild: (guildId: string, event: string, payload: unknown) => {
      eventos.push({ alvo: `guild:${guildId}`, evento: event, payload });
    },
  };
  const naoUsado = null as never;
  const s = new ModerationService(
    prisma as unknown as PrismaService,
    guilds as unknown as GuildsService,
    realtime as unknown as RealtimeService,
    naoUsado as unknown as AuditService,
    naoUsado as unknown as DMsService,
  );
  return { s, eventos, semPermissao };
}

describe("ModerationService.alterarApelidoDeMembro", () => {
  it("quem tem MANAGE_NICKNAMES e cargo mais alto altera o apelido de outro", async () => {
    const { s, eventos } = servicoCom(
      [
        { userId: "mod", guildId: "g1", role: "ADMIN", nickname: null },
        { userId: "ana", guildId: "g1", role: "MEMBER", nickname: null },
      ],
      { mod: 10, ana: 1 },
    );
    const dto = await s.alterarApelidoDeMembro("mod", "g1", "ana", "Aninha");
    expect(dto).toEqual({ guildId: "g1", userId: "ana", role: "MEMBER", nickname: "Aninha" });
    expect(eventos).toEqual([
      {
        alvo: "guild:g1",
        evento: WS_EVENTS.MEMBER_UPDATED,
        payload: { guildId: "g1", userId: "ana", role: "MEMBER", nickname: "Aninha" },
      },
    ]);
  });

  it("apelido vazio/null apaga", async () => {
    const { s } = servicoCom(
      [
        { userId: "mod", guildId: "g1", role: "ADMIN", nickname: null },
        { userId: "ana", guildId: "g1", role: "MEMBER", nickname: "Velho" },
      ],
      { mod: 10, ana: 1 },
    );
    const dto = await s.alterarApelidoDeMembro("mod", "g1", "ana", null);
    expect(dto.nickname).toBeNull();
  });

  it("para si mesmo, delega à regra existente: sem MANAGE_NICKNAMES nem hierarquia", async () => {
    const { s, semPermissao } = servicoCom(
      [{ userId: "ana", guildId: "g1", role: "MEMBER", nickname: null }],
      { ana: 1 },
    );
    semPermissao.add("ana"); // nem tem a permissão, e mesmo assim funciona
    const dto = await s.alterarApelidoDeMembro("ana", "g1", "ana", "Aninha");
    expect(dto.nickname).toBe("Aninha");
  });

  it("sem MANAGE_NICKNAMES: 403", async () => {
    const { s, semPermissao } = servicoCom(
      [
        { userId: "mod", guildId: "g1", role: "MEMBER", nickname: null },
        { userId: "ana", guildId: "g1", role: "MEMBER", nickname: null },
      ],
      { mod: 10, ana: 1 },
    );
    semPermissao.add("mod");
    await expect(s.alterarApelidoDeMembro("mod", "g1", "ana", "Aninha")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("hierarquia: não altera quem tem cargo igual ou superior (nem o dono)", async () => {
    const { s } = servicoCom(
      [
        { userId: "mod", guildId: "g1", role: "ADMIN", nickname: null },
        { userId: "dono", guildId: "g1", role: "OWNER", nickname: null },
        { userId: "igual", guildId: "g1", role: "ADMIN", nickname: null },
      ],
      { mod: 10, dono: Number.MAX_SAFE_INTEGER, igual: 10 },
    );
    await expect(s.alterarApelidoDeMembro("mod", "g1", "dono", "X")).rejects.toThrow(
      ForbiddenException,
    );
    await expect(s.alterarApelidoDeMembro("mod", "g1", "igual", "X")).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe("NicknameDto — limite de tamanho", () => {
  it("aceita até 32 caracteres", async () => {
    const dto = plainToInstance(NicknameDto, { apelido: "a".repeat(32) });
    expect(await validate(dto)).toHaveLength(0);
  });

  it("recusa acima de 32 (400 na borda HTTP)", async () => {
    const dto = plainToInstance(NicknameDto, { apelido: "a".repeat(33) });
    const erros = await validate(dto);
    expect(erros).not.toHaveLength(0);
    expect(erros[0].constraints).toHaveProperty("maxLength");
  });

  it("aceita null e ausente (apaga o apelido)", async () => {
    expect(await validate(plainToInstance(NicknameDto, { apelido: null }))).toHaveLength(0);
    expect(await validate(plainToInstance(NicknameDto, {}))).toHaveLength(0);
  });
});
