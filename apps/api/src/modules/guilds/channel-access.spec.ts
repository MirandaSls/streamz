import { describe, expect, it } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DM_PERMISSIONS, DEFAULT_PERMISSIONS, Permission } from "@streamz/shared";
import type { ChannelType, MemberRole } from "@streamz/shared";
import { GuildsService } from "./guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * Testes da **autorização por canal** — `assertCanViewChannel` e companhia.
 *
 * O cálculo de permissão em si (união de cargos, ADMINISTRATOR, ordem dos
 * overrides) já é coberto por `roles/permissions.test.ts`, sobre a função pura
 * de `@streamz/shared`. O que falta cobrir, e é o que está aqui, é a **ligação**:
 * quais linhas o service busca, como trata o ramo de conversa direta (onde não
 * existe cargo nem override) e o que exatamente vira 403.
 *
 * É a costura em que um erro não aparece no typecheck e não aparece na tela —
 * aparece como alguém lendo um canal que não devia.
 *
 * O Prisma é substituído por um banco em memória montado a partir de um objeto
 * declarativo (`mundo`), respondendo exatamente às consultas que estes caminhos
 * fazem. Sem container, sem migration: o alvo é a decisão, não o SQL.
 */

interface Mundo {
  guilds?: { id: string; ownerId: string }[];
  channels?: {
    id: string;
    guildId?: string | null;
    type?: ChannelType;
    private?: boolean;
    readOnly?: boolean;
  }[];
  membros?: { userId: string; guildId: string; role?: MemberRole; timeoutUntil?: Date | null }[];
  cargos?: {
    id: string;
    guildId: string;
    permissions: number;
    position?: number;
    isDefault?: boolean;
  }[];
  atribuicoes?: { userId: string; guildId: string; roleId: string }[];
  overrides?: {
    channelId: string;
    roleId?: string | null;
    userId?: string | null;
    allow?: number;
    deny?: number;
  }[];
  participantes?: { channelId: string; userId: string }[];
}

function servicoCom(mundo: Mundo): GuildsService {
  const canais = (mundo.channels ?? []).map((c) => ({
    id: c.id,
    guildId: c.guildId ?? null,
    type: (c.type ?? "TEXT") as ChannelType,
    private: c.private ?? false,
    readOnly: c.readOnly ?? false,
  }));
  const cargos = (mundo.cargos ?? []).map((r) => ({
    id: r.id,
    guildId: r.guildId,
    name: r.isDefault ? "@everyone" : r.id,
    color: null,
    position: r.position ?? (r.isDefault ? 0 : 1),
    permissions: r.permissions,
    hoist: false,
    mentionable: false,
    isDefault: r.isDefault ?? false,
  }));
  const overrides = (mundo.overrides ?? []).map((o, i) => ({
    id: `ov${i}`,
    channelId: o.channelId,
    roleId: o.roleId ?? null,
    userId: o.userId ?? null,
    allow: o.allow ?? 0,
    deny: o.deny ?? 0,
  }));
  const membros = (mundo.membros ?? []).map((m) => ({
    userId: m.userId,
    guildId: m.guildId,
    role: (m.role ?? "MEMBER") as MemberRole,
    timeoutUntil: m.timeoutUntil ?? null,
  }));

  const prisma = {
    channel: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        canais.find((c) => c.id === where.id) ?? null,
    },
    guild: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        (mundo.guilds ?? []).find((g) => g.id === where.id) ?? null,
    },
    guildMember: {
      findUnique: async ({
        where,
      }: {
        where: { userId_guildId: { userId: string; guildId: string } };
      }) =>
        membros.find(
          (m) =>
            m.userId === where.userId_guildId.userId &&
            m.guildId === where.userId_guildId.guildId,
        ) ?? null,
    },
    channelMember: {
      findUnique: async ({
        where,
      }: {
        where: { channelId_userId: { channelId: string; userId: string } };
      }) => {
        const p = (mundo.participantes ?? []).find(
          (x) =>
            x.channelId === where.channelId_userId.channelId &&
            x.userId === where.channelId_userId.userId,
        );
        return p ? { id: `${p.channelId}:${p.userId}` } : null;
      },
    },
    role: {
      findMany: async ({ where }: { where: { guildId: string } }) =>
        cargos.filter((r) => r.guildId === where.guildId).sort((a, b) => a.position - b.position),
    },
    guildMemberRole: {
      findMany: async ({ where }: { where: { guildId: string; userId: string } }) =>
        (mundo.atribuicoes ?? [])
          .filter((a) => a.guildId === where.guildId && a.userId === where.userId)
          .map((a) => ({ roleId: a.roleId })),
    },
    channelOverride: {
      findMany: async ({ where }: { where: { channelId: string } }) =>
        overrides.filter((o) => o.channelId === where.channelId),
    },
  };

  // os outros cinco colaboradores não são tocados por nenhum destes caminhos
  const naoUsado = null as never;
  return new GuildsService(
    prisma as unknown as PrismaService,
    naoUsado,
    naoUsado,
    naoUsado,
    naoUsado,
  );
}

/** Um servidor com dono, um membro comum e um canal — a base de quase todo caso. */
function servidorSimples(extra: Partial<Mundo> = {}): Mundo {
  return {
    guilds: [{ id: "g1", ownerId: "dono" }],
    channels: [{ id: "c1", guildId: "g1" }],
    membros: [
      { userId: "dono", guildId: "g1", role: "OWNER" },
      { userId: "ana", guildId: "g1" },
    ],
    cargos: [{ id: "everyone", guildId: "g1", permissions: DEFAULT_PERMISSIONS, isDefault: true }],
    ...extra,
  };
}

describe("assertCanViewChannel — canal de servidor", () => {
  it("canal inexistente é 404, não 403", async () => {
    const s = servicoCom(servidorSimples());
    await expect(s.assertCanViewChannel("ana", "sumiu")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("membro com o padrão do @everyone entra e recebe a permissão do canal", async () => {
    const s = servicoCom(servidorSimples());
    const acesso = await s.assertCanViewChannel("ana", "c1");
    expect(acesso.tipo).toBe("guild");
    expect(acesso.permissions).toBe(DEFAULT_PERMISSIONS);
  });

  it("quem não é membro do servidor é recusado, mesmo tendo cargo atribuído", async () => {
    // atribuição órfã: a linha de GuildMember é que manda
    const mundo = servidorSimples({
      cargos: [
        { id: "everyone", guildId: "g1", permissions: DEFAULT_PERMISSIONS, isDefault: true },
        { id: "staff", guildId: "g1", permissions: Permission.VIEW_CHANNEL },
      ],
      atribuicoes: [{ userId: "intruso", guildId: "g1", roleId: "staff" }],
    });
    await expect(servicoCom(mundo).assertCanViewChannel("intruso", "c1")).rejects.toThrow(
      /não é membro/i,
    );
  });

  it("deny de VIEW_CHANNEL no @everyone tranca o canal (é o que 'privado' significa)", async () => {
    const mundo = servidorSimples({
      channels: [{ id: "c1", guildId: "g1", private: true }],
      overrides: [{ channelId: "c1", roleId: "everyone", deny: Permission.VIEW_CHANNEL }],
    });
    await expect(servicoCom(mundo).assertCanViewChannel("ana", "c1")).rejects.toThrow(
      /canal privado/i,
    );
  });

  it("o dono entra no canal privado — override não vale para ele", async () => {
    const mundo = servidorSimples({
      channels: [{ id: "c1", guildId: "g1", private: true }],
      overrides: [{ channelId: "c1", roleId: "everyone", deny: Permission.VIEW_CHANNEL }],
    });
    const acesso = await servicoCom(mundo).assertCanViewChannel("dono", "c1");
    expect(acesso.tipo).toBe("guild");
  });

  it("allow por usuário reabre o canal trancado no @everyone", async () => {
    const mundo = servidorSimples({
      channels: [{ id: "c1", guildId: "g1", private: true }],
      overrides: [
        { channelId: "c1", roleId: "everyone", deny: Permission.VIEW_CHANNEL },
        { channelId: "c1", userId: "ana", allow: Permission.VIEW_CHANNEL },
      ],
    });
    await expect(servicoCom(mundo).assertCanViewChannel("ana", "c1")).resolves.toMatchObject({
      tipo: "guild",
    });
  });

  it("o override de OUTRO usuário não vaza para quem está pedindo acesso", async () => {
    // regressão: `permissionsInChannel` filtra os overrides por usuário antes de
    // calcular; sem esse filtro, o allow da ana liberaria o canal para o bruno,
    // porque computePermissions aplica o primeiro override de usuário que achar.
    const mundo = servidorSimples({
      channels: [{ id: "c1", guildId: "g1", private: true }],
      membros: [
        { userId: "dono", guildId: "g1", role: "OWNER" },
        { userId: "ana", guildId: "g1" },
        { userId: "bruno", guildId: "g1" },
      ],
      overrides: [
        { channelId: "c1", roleId: "everyone", deny: Permission.VIEW_CHANNEL },
        { channelId: "c1", userId: "ana", allow: Permission.VIEW_CHANNEL },
      ],
    });
    const s = servicoCom(mundo);
    await expect(s.assertCanViewChannel("ana", "c1")).resolves.toBeTruthy();
    await expect(s.assertCanViewChannel("bruno", "c1")).rejects.toThrow(/canal privado/i);
  });

  it("canal apontando para servidor que não existe é 404 do servidor", async () => {
    const mundo = servidorSimples({ guilds: [] });
    await expect(servicoCom(mundo).assertCanViewChannel("ana", "c1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("assertCanViewChannel — conversa direta", () => {
  const dm: Mundo = {
    channels: [{ id: "d1", guildId: null, type: "DM" }],
    participantes: [
      { channelId: "d1", userId: "ana" },
      { channelId: "d1", userId: "bruno" },
    ],
  };

  it("participante entra e recebe DM_PERMISSIONS", async () => {
    const acesso = await servicoCom(dm).assertCanViewChannel("ana", "d1");
    expect(acesso.tipo).toBe("dm");
    expect(acesso.permissions).toBe(DM_PERMISSIONS);
  });

  it("quem não participa é recusado", async () => {
    await expect(servicoCom(dm).assertCanViewChannel("carla", "d1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("cargo e override não têm efeito nenhum numa DM", async () => {
    // um deny de VIEW_CHANNEL pendurado no canal de DM não pode trancar ninguém:
    // o ramo de DM decide por participação e nem olha override.
    const mundo: Mundo = {
      ...dm,
      overrides: [{ channelId: "d1", roleId: "everyone", deny: Permission.VIEW_CHANNEL }],
    };
    await expect(servicoCom(mundo).assertCanViewChannel("ana", "d1")).resolves.toMatchObject({
      tipo: "dm",
    });
  });
});

describe("assertCanPostChannel", () => {
  it("ver sem poder falar é 'somente-leitura', não 'privado'", async () => {
    const mundo = servidorSimples({
      channels: [{ id: "c1", guildId: "g1", readOnly: true }],
      overrides: [{ channelId: "c1", roleId: "everyone", deny: Permission.SEND_MESSAGES }],
    });
    const s = servicoCom(mundo);
    await expect(s.assertCanViewChannel("ana", "c1")).resolves.toBeTruthy();
    await expect(s.assertCanPostChannel("ana", "c1")).rejects.toThrow(/somente-leitura/i);
  });

  it("quem não vê o canal também não posta — e o erro é o de ver", async () => {
    const mundo = servidorSimples({
      overrides: [{ channelId: "c1", roleId: "everyone", deny: Permission.VIEW_CHANNEL }],
    });
    await expect(servicoCom(mundo).assertCanPostChannel("ana", "c1")).rejects.toThrow(
      /canal privado/i,
    );
  });

  it("em DM, participar basta para postar", async () => {
    const mundo: Mundo = {
      channels: [{ id: "d1", guildId: null, type: "DM" }],
      participantes: [{ channelId: "d1", userId: "ana" }],
    };
    await expect(servicoCom(mundo).assertCanPostChannel("ana", "d1")).resolves.toMatchObject({
      tipo: "dm",
    });
  });
});

describe("canModerateChannel", () => {
  it("é false em DM — não há moderação de conversa direta", async () => {
    const mundo: Mundo = {
      channels: [{ id: "d1", guildId: null, type: "DM" }],
      participantes: [{ channelId: "d1", userId: "ana" }],
    };
    expect(await servicoCom(mundo).canModerateChannel("ana", "d1")).toBe(false);
  });

  it("é true para quem tem MANAGE_MESSAGES por cargo", async () => {
    const mundo = servidorSimples({
      cargos: [
        { id: "everyone", guildId: "g1", permissions: DEFAULT_PERMISSIONS, isDefault: true },
        { id: "mod", guildId: "g1", permissions: Permission.MANAGE_MESSAGES },
      ],
      atribuicoes: [{ userId: "ana", guildId: "g1", roleId: "mod" }],
    });
    expect(await servicoCom(mundo).canModerateChannel("ana", "c1")).toBe(true);
  });

  it("é false para o membro comum", async () => {
    expect(await servicoCom(servidorSimples()).canModerateChannel("ana", "c1")).toBe(false);
  });
});

describe("assertCanModerate — exige o bit, não o papel", () => {
  it("recusa quem não tem a permissão pedida", async () => {
    await expect(
      servicoCom(servidorSimples()).assertCanModerate("ana", "g1", Permission.KICK_MEMBERS),
    ).rejects.toThrow(/não tem permissão/i);
  });

  it("aceita MEMBER com o bit por cargo — papel não decide capacidade (ADR-0002)", async () => {
    const mundo = servidorSimples({
      cargos: [
        { id: "everyone", guildId: "g1", permissions: DEFAULT_PERMISSIONS, isDefault: true },
        { id: "mod", guildId: "g1", permissions: Permission.KICK_MEMBERS },
      ],
      atribuicoes: [{ userId: "ana", guildId: "g1", roleId: "mod" }],
    });
    const membro = await servicoCom(mundo).assertCanModerate("ana", "g1", Permission.KICK_MEMBERS);
    expect(membro.role).toBe("MEMBER");
  });

  it("o dono passa em qualquer permissão", async () => {
    await expect(
      servicoCom(servidorSimples()).assertCanModerate("dono", "g1", Permission.BAN_MEMBERS),
    ).resolves.toBeTruthy();
  });

  it("quem não é membro é recusado antes de calcular permissão", async () => {
    await expect(
      servicoCom(servidorSimples()).assertCanModerate("estranho", "g1", Permission.KICK_MEMBERS),
    ).rejects.toThrow(/não é membro/i);
  });
});

describe("assertNotTimedOut", () => {
  const daqui = (ms: number) => new Date(Date.now() + ms);

  it("castigo em vigor bloqueia a escrita", async () => {
    const mundo = servidorSimples({
      membros: [{ userId: "ana", guildId: "g1", timeoutUntil: daqui(60_000) }],
    });
    await expect(servicoCom(mundo).assertNotTimedOut("g1", "ana")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("castigo vencido não bloqueia", async () => {
    const mundo = servidorSimples({
      membros: [{ userId: "ana", guildId: "g1", timeoutUntil: daqui(-60_000) }],
    });
    await expect(servicoCom(mundo).assertNotTimedOut("g1", "ana")).resolves.toBeUndefined();
  });

  it("sem castigo, passa", async () => {
    await expect(
      servicoCom(servidorSimples()).assertNotTimedOut("g1", "ana"),
    ).resolves.toBeUndefined();
  });
});
