import { describe, expect, it } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DEFAULT_PERMISSIONS, Permission } from "@streamz/shared";
import { InvitesService } from "./invites.service";
import { GuildsService } from "../guilds/guilds.service";
import type { AuditService } from "../audit/audit.service";
import type { OnboardingService } from "../onboarding/onboarding.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * `CREATE_INVITE` na API, e não só no cliente.
 *
 * Antes, `create()` conferia apenas se quem pedia era membro: o botão de
 * convidar sumia na tela para quem não tinha a permissão, mas um `POST` à mão
 * criava o convite do mesmo jeito. O que estes testes prendem:
 *
 * 1. sem `CREATE_INVITE` no servidor, 403 — e nenhuma linha de convite;
 * 2. com canal escolhido, vale a permissão **do canal** (override deny recusa,
 *    override allow libera);
 * 3. o servidor no padrão continua convidando (o `@everyone` nasce com o bit).
 *
 * O `GuildsService` é o de verdade, sobre um Prisma em memória: o alvo é a
 * ligação com a autorização central, não uma cópia dela num mock.
 */

interface Mundo {
  /** permissões do `@everyone` do servidor g1. */
  everyone: number;
  membros: string[];
  overrides?: { channelId: string; roleId?: string | null; userId?: string | null; allow?: number; deny?: number }[];
}

const DONO = "dono";

function servico(mundo: Mundo) {
  const criados: unknown[] = [];
  const canais = [
    { id: "c1", guildId: "g1", type: "TEXT", categoryId: null, syncedWithCategory: false, private: false, readOnly: false },
  ];
  const cargos = [
    {
      id: "everyone",
      guildId: "g1",
      name: "@everyone",
      color: null,
      position: 0,
      permissions: mundo.everyone,
      hoist: false,
      mentionable: false,
      isDefault: true,
    },
  ];
  const overrides = (mundo.overrides ?? []).map((o, i) => ({
    id: `ov${i}`,
    channelId: o.channelId,
    roleId: o.roleId ?? null,
    userId: o.userId ?? null,
    allow: o.allow ?? 0,
    deny: o.deny ?? 0,
  }));
  const membros = [DONO, ...mundo.membros];

  const prisma = {
    guild: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "g1" ? { id: "g1", ownerId: DONO } : null,
    },
    guildMember: {
      findUnique: async ({ where }: { where: { userId_guildId: { userId: string; guildId: string } } }) =>
        where.userId_guildId.guildId === "g1" && membros.includes(where.userId_guildId.userId)
          ? { userId: where.userId_guildId.userId, guildId: "g1", role: where.userId_guildId.userId === DONO ? "OWNER" : "MEMBER" }
          : null,
    },
    role: {
      findMany: async ({ where }: { where: { guildId: string } }) => cargos.filter((r) => r.guildId === where.guildId),
    },
    guildMemberRole: { findMany: async () => [] },
    channel: {
      findUnique: async ({ where }: { where: { id: string } }) => canais.find((c) => c.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { id: string; guildId: string; type: string } }) =>
        canais.find((c) => c.id === where.id && c.guildId === where.guildId && c.type === where.type) ?? null,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        canais.filter((c) => where.id.in.includes(c.id)),
    },
    channelOverride: {
      findMany: async ({ where }: { where: { channelId: { in: string[] } } }) =>
        overrides.filter((o) => where.channelId.in.includes(o.channelId)),
    },
    categoryOverride: { findMany: async () => [] },
    invite: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        criados.push(data);
        return { ...data, uses: 0 };
      },
    },
  } as unknown as PrismaService;

  const naoUsado = null as never;
  const guilds = new GuildsService(prisma, naoUsado, naoUsado, naoUsado, naoUsado);
  const audit = { async log() {} } as unknown as AuditService;
  const invites = new InvitesService(
    prisma,
    guilds,
    null as unknown as RealtimeService,
    audit,
    null as unknown as OnboardingService,
  );
  return { invites, criados };
}

const SEM_CONVITE = DEFAULT_PERMISSIONS & ~Permission.CREATE_INVITE;

describe("InvitesService.create — CREATE_INVITE", () => {
  it("servidor no padrão: membro comum convida (o @everyone nasce com o bit)", async () => {
    const { invites, criados } = servico({ everyone: DEFAULT_PERMISSIONS, membros: ["ana"] });
    const info = await invites.create("ana", "g1");
    expect(info.guildId).toBe("g1");
    expect(criados).toHaveLength(1);
  });

  it("membro sem CREATE_INVITE no servidor leva 403 e nenhum convite é criado", async () => {
    const { invites, criados } = servico({ everyone: SEM_CONVITE, membros: ["ana"] });
    await expect(invites.create("ana", "g1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(criados).toHaveLength(0);
  });

  it("membro sem CREATE_INVITE também é recusado ao convidar para um canal", async () => {
    const { invites, criados } = servico({ everyone: SEM_CONVITE, membros: ["ana"] });
    await expect(invites.create("ana", "g1", { channelId: "c1" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(criados).toHaveLength(0);
  });

  it("o dono convida mesmo com o @everyone sem a permissão", async () => {
    const { invites, criados } = servico({ everyone: SEM_CONVITE, membros: ["ana"] });
    await invites.create(DONO, "g1", { channelId: "c1" });
    expect(criados).toHaveLength(1);
  });

  it("deny de CREATE_INVITE no canal recusa o convite para aquele canal", async () => {
    const { invites, criados } = servico({
      everyone: DEFAULT_PERMISSIONS,
      membros: ["ana"],
      overrides: [{ channelId: "c1", roleId: "everyone", deny: Permission.CREATE_INVITE }],
    });
    await expect(invites.create("ana", "g1", { channelId: "c1" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // sem canal, vale a permissão do servidor, que continua ligada
    await invites.create("ana", "g1");
    expect(criados).toHaveLength(1);
  });

  it("allow de CREATE_INVITE no canal libera quem não tem a permissão no servidor", async () => {
    const { invites, criados } = servico({
      everyone: SEM_CONVITE,
      membros: ["ana"],
      overrides: [{ channelId: "c1", userId: "ana", allow: Permission.CREATE_INVITE }],
    });
    await invites.create("ana", "g1", { channelId: "c1" });
    expect(criados).toHaveLength(1);
    expect(criados[0]).toMatchObject({ channelId: "c1", creatorId: "ana" });
  });

  it("quem não é membro leva 403 antes de o canal ser validado", async () => {
    const { invites, criados } = servico({ everyone: DEFAULT_PERMISSIONS, membros: [] });
    await expect(invites.create("intruso", "g1", { channelId: "nao-existe" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(criados).toHaveLength(0);
  });

  it("canal de outro servidor continua 400 para quem é membro", async () => {
    const { invites } = servico({ everyone: DEFAULT_PERMISSIONS, membros: ["ana"] });
    await expect(invites.create("ana", "g1", { channelId: "nao-existe" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
