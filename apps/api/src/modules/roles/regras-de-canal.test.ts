import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PERMISSIONS, Permission, hasPermission } from "@streamz/shared";
import { CategoriesService } from "../channels/categories.service";
import { GuildsService } from "../guilds/guilds.service";
import { RolesService } from "./roles.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { ReadStateService } from "../read-state/read-state.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { StorageService } from "../storage/storage.service";

/**
 * Escrita de regra (override) de canal **e de categoria**: quem pode gravar e
 * quem pode apagar.
 *
 * Os testes ao lado cobrem `computePermissions` como função pura. Este cobre o
 * que só existe nos services — a **ordem das checagens** de `setOverride` e
 * `removeOverride` —, e por isso monta um Prisma de mentira em memória e roda o
 * `GuildsService` de verdade em cima dele: o que se quer travar aqui é
 * exatamente a conversa entre os services, e um `guilds` dublê provaria apenas
 * que o dublê recusa.
 *
 * As escaladas que ele fecha:
 *
 * 1. gravar regra num canal que o ator não enxerga. A leitura sempre exigiu
 *    `assertCanViewChannel` e a escrita não: barrado por um deny de
 *    `VIEW_CHANNEL`, quem tinha `MANAGE_ROLES` gravava a própria regra com
 *    `allow: VIEW_CHANNEL` e entrava no canal privado;
 * 2. apagar regra sem hierarquia nem visibilidade — apagar a do @everyone abria
 *    o canal privado para o servidor inteiro (`syncChannelFlags` deriva
 *    `private` do deny), e apagar a de um cargo acima desfazia a restrição de
 *    quem está acima do ator;
 * 3. as duas de novo pela **categoria**, onde valem por todos os canais
 *    sincronizados de uma vez — e onde nem o `PUT` tinha hierarquia.
 */

const G = "g1";
const DONO = "u-dono";
const MOD = "u-mod";
const ALVO = "u-alvo";

type Registro = Record<string, unknown>;

interface Args {
  where?: Registro;
  data?: Registro;
  create?: Registro;
  update?: Registro;
  orderBy?: unknown;
}

/**
 * Casa uma linha com o `where` do Prisma nas formas que o código usa: campo
 * igual, `{ in: [...] }`, `OR: [...]` e chave composta (`channelId_roleId`,
 * cujos campos estão na própria linha).
 */
function combina(linha: Registro, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  for (const [campo, cond] of Object.entries(where as Registro)) {
    if (campo === "OR") {
      if (!(cond as unknown[]).some((c) => combina(linha, c))) return false;
      continue;
    }
    if (cond && typeof cond === "object") {
      if ("in" in (cond as Registro)) {
        if (!(cond as { in: unknown[] }).in.includes(linha[campo])) return false;
        continue;
      }
      if (!combina(linha, cond)) return false;
      continue;
    }
    if (linha[campo] !== cond) return false;
  }
  return true;
}

function ordenar(linhas: Registro[], orderBy: unknown): Registro[] {
  if (!orderBy || typeof orderBy !== "object") return linhas;
  const [campo, direcao] = Object.entries(orderBy as Registro)[0] ?? [];
  if (!campo) return linhas;
  return [...linhas].sort((a, b) => {
    const x = Number(a[campo]);
    const y = Number(b[campo]);
    return direcao === "desc" ? y - x : x - y;
  });
}

/** Uma "tabela": as operações do Prisma que os dois services chamam. */
function tabela(linhas: Registro[], padrao: Registro = {}) {
  const achar = (where?: Registro) => linhas.find((l) => combina(l, where)) ?? null;
  return {
    linhas,
    findMany: async ({ where, orderBy }: Args = {}) =>
      ordenar(
        linhas.filter((l) => combina(l, where)),
        orderBy,
      ),
    findFirst: async ({ where, orderBy }: Args = {}) =>
      ordenar(
        linhas.filter((l) => combina(l, where)),
        orderBy,
      )[0] ?? null,
    findUnique: async ({ where }: Args = {}) => achar(where),
    create: async ({ data }: Args) => {
      const nova = { ...padrao, ...data };
      linhas.push(nova);
      return nova;
    },
    update: async ({ where, data }: Args) => {
      const linha = achar(where);
      if (!linha) throw new Error("linha inexistente no Prisma de mentira");
      Object.assign(linha, data);
      return linha;
    },
    upsert: async ({ where, create, update }: Args) => {
      const linha = achar(where);
      if (linha) {
        Object.assign(linha, update);
        return linha;
      }
      const nova = { ...padrao, ...create };
      linhas.push(nova);
      return nova;
    },
    deleteMany: async ({ where }: Args = {}) => {
      const ficam = linhas.filter((l) => !combina(l, where));
      const count = linhas.length - ficam.length;
      linhas.splice(0, linhas.length, ...ficam);
      return { count };
    },
  };
}

const cargo = (over: Registro): Registro => ({
  guildId: G,
  color: null,
  position: 1,
  permissions: 0,
  hoist: false,
  mentionable: false,
  isDefault: false,
  ...over,
});

const canal = (over: Registro): Registro => ({
  guildId: G,
  type: "TEXT",
  categoryId: null,
  syncedWithCategory: false,
  private: false,
  readOnly: false,
  ...over,
});

const regra = (over: Registro): Registro => ({
  roleId: null,
  userId: null,
  allow: 0,
  deny: 0,
  ...over,
});

/**
 * Um servidor com:
 * - `c-privado`: o @everyone perde `VIEW_CHANNEL` — o moderador não o enxerga;
 * - `c-aberto`: todo mundo vê, e ele tem a regra de um cargo **acima** do
 *   moderador (`r-alto`) e a de um usuário;
 * - `cat-privada`: categoria com o mesmo deny, e `c-sync` **sincronizado** com
 *   ela — é o canal que a regra da categoria abre ou fecha à distância;
 * - `cat-aberta`: categoria que todo mundo enxerga.
 *
 * O moderador tem `MANAGE_ROLES` pelo cargo `r-mod` (posição 3): pode tudo o
 * que a hierarquia e a visibilidade permitirem, e nada além.
 */
function mundo() {
  const prisma = {
    guild: tabela([{ id: G, ownerId: DONO }]),
    role: tabela([
      cargo({
        id: "r-everyone",
        name: "@everyone",
        position: 0,
        permissions: DEFAULT_PERMISSIONS,
        isDefault: true,
      }),
      cargo({ id: "r-baixo", name: "Baixo", position: 1 }),
      cargo({ id: "r-mod", name: "Moderação", position: 3, permissions: Permission.MANAGE_ROLES }),
      cargo({ id: "r-alto", name: "Alto", position: 7 }),
    ]),
    guildMember: tabela([
      { userId: DONO, guildId: G, role: "OWNER", timeoutUntil: null },
      { userId: MOD, guildId: G, role: "MEMBER", timeoutUntil: null },
      { userId: ALVO, guildId: G, role: "MEMBER", timeoutUntil: null },
    ]),
    guildMemberRole: tabela([{ guildId: G, userId: MOD, roleId: "r-mod" }]),
    channel: tabela([
      canal({ id: "c-privado", private: true }),
      canal({ id: "c-aberto" }),
      canal({
        id: "c-sync",
        categoryId: "cat-privada",
        syncedWithCategory: true,
        private: true,
      }),
    ]),
    channelOverride: tabela(
      [
        regra({ channelId: "c-privado", roleId: "r-everyone", deny: Permission.VIEW_CHANNEL }),
        regra({ channelId: "c-aberto", roleId: "r-alto", deny: Permission.SEND_MESSAGES }),
        regra({ channelId: "c-aberto", userId: ALVO, deny: Permission.SEND_MESSAGES }),
        // a cópia que a sincronia mantém; quem manda é a linha da categoria
        regra({ channelId: "c-sync", roleId: "r-everyone", deny: Permission.VIEW_CHANNEL }),
      ],
      { roleId: null, userId: null, allow: 0, deny: 0 },
    ),
    category: tabela([
      { id: "cat-privada", guildId: G, name: "Privada", position: 0 },
      { id: "cat-aberta", guildId: G, name: "Aberta", position: 1 },
    ]),
    categoryOverride: tabela(
      [
        regra({ categoryId: "cat-privada", roleId: "r-everyone", deny: Permission.VIEW_CHANNEL }),
        regra({ categoryId: "cat-aberta", roleId: "r-alto", deny: Permission.SEND_MESSAGES }),
      ],
      { roleId: null, userId: null, allow: 0, deny: 0 },
    ),
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const realtime = {
    emitToGuild: vi.fn(),
    joinChannelRooms: vi.fn(),
    leaveChannelRooms: vi.fn(),
  };
  // nenhum caminho de regra de canal toca em leitura, storage ou auditoria
  const naoUsado = {} as unknown;
  const guilds = new GuildsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
    naoUsado as ReadStateService,
    naoUsado as StorageService,
    naoUsado as AuditService,
  );
  const service = new RolesService(
    prisma as unknown as PrismaService,
    guilds,
    realtime as unknown as RealtimeService,
  );
  const categorias = new CategoriesService(
    prisma as unknown as PrismaService,
    guilds,
    realtime as unknown as RealtimeService,
  );

  return {
    service,
    categorias,
    guilds,
    regrasDe: (channelId: string) =>
      prisma.channelOverride.linhas.filter((o) => o.channelId === channelId),
    regrasDaCategoria: (categoryId: string) =>
      prisma.categoryOverride.linhas.filter((o) => o.categoryId === categoryId),
    canalDe: (id: string) => prisma.channel.linhas.find((c) => c.id === id) as Registro,
    enxerga: async (userId: string, channelId: string) =>
      hasPermission(
        await guilds.permissionsInChannel(userId, G, channelId),
        Permission.VIEW_CHANNEL,
      ),
  };
}

describe("gravar regra num canal que o ator não enxerga", () => {
  it("o moderador barrado do canal privado não se readmite gravando a própria regra", async () => {
    const { service, regrasDe, enxerga } = mundo();
    expect(await enxerga(MOD, "c-privado")).toBe(false);

    // a escalada: `VIEW_CHANNEL` está no DEFAULT_PERMISSIONS, então a máscara de
    // "não se concede o que não se tem" deixava esta chamada passar
    await expect(
      service.setOverride(MOD, G, "c-privado", {
        userId: MOD,
        allow: Permission.VIEW_CHANNEL,
        deny: 0,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(regrasDe("c-privado")).toHaveLength(1);
    expect(await enxerga(MOD, "c-privado")).toBe(false);
  });

  it("nem devolvendo VIEW_CHANNEL ao @everyone — o que abriria o canal para todos", async () => {
    const { service, regrasDe, canalDe, enxerga } = mundo();

    // o @everyone está na posição 0, abaixo dele na hierarquia, e a máscara
    // deixava passar: só a visibilidade segura esta
    await expect(
      service.setOverride(MOD, G, "c-privado", {
        roleId: "r-everyone",
        allow: Permission.VIEW_CHANNEL,
        deny: 0,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(regrasDe("c-privado")).toHaveLength(1);
    expect(canalDe("c-privado").private).toBe(true);
    expect(await enxerga(MOD, "c-privado")).toBe(false);
  });
});

describe("apagar regra de canal", () => {
  it("o moderador barrado não apaga a regra do @everyone para abrir o canal", async () => {
    const { service, regrasDe, canalDe, enxerga } = mundo();

    // era uma chamada só: sem o deny, `syncChannelFlags` tiraria o `private` e o
    // canal apareceria para o servidor inteiro
    await expect(service.removeOverride(MOD, G, "c-privado", "r-everyone")).rejects.toThrow(
      ForbiddenException,
    );

    expect(regrasDe("c-privado")).toHaveLength(1);
    expect(canalDe("c-privado").private).toBe(true);
    expect(await enxerga(MOD, "c-privado")).toBe(false);
  });

  it("apagar a regra de um cargo acima do ator é recusado, como já era ao gravar", async () => {
    const { service, regrasDe } = mundo();

    await expect(service.removeOverride(MOD, G, "c-aberto", "r-alto")).rejects.toThrow(
      /acima do seu/,
    );
    // o `PUT` no mesmo cargo sempre foi recusado — é a simetria que faltava
    await expect(
      service.setOverride(MOD, G, "c-aberto", { roleId: "r-alto", allow: 0, deny: 0 }),
    ).rejects.toThrow(/acima do seu/);

    expect(regrasDe("c-aberto")).toHaveLength(2);
  });
});

describe("o caminho legítimo continua aberto", () => {
  it("o dono grava e apaga regra no canal privado — nada o tranca para fora", async () => {
    const { service, regrasDe, canalDe, enxerga } = mundo();

    const depoisDoPut = await service.setOverride(DONO, G, "c-privado", {
      userId: MOD,
      allow: Permission.VIEW_CHANNEL,
      deny: 0,
    });
    expect(depoisDoPut).toHaveLength(2);
    expect(await enxerga(MOD, "c-privado")).toBe(true);

    const depoisDoDelete = await service.removeOverride(DONO, G, "c-privado", "r-everyone");
    expect(depoisDoDelete.some((o) => o.roleId === "r-everyone")).toBe(false);
    // o espelho acompanha: o canal deixou de ser privado
    expect(canalDe("c-privado").private).toBe(false);
    expect(regrasDe("c-privado")).toHaveLength(1);
  });

  it("o moderador gerencia o canal que enxerga, num cargo abaixo do seu", async () => {
    const { service, regrasDe } = mundo();

    await service.setOverride(MOD, G, "c-aberto", {
      roleId: "r-baixo",
      allow: 0,
      deny: Permission.SEND_MESSAGES,
    });
    expect(regrasDe("c-aberto")).toHaveLength(3);

    await service.removeOverride(MOD, G, "c-aberto", "r-baixo");
    expect(regrasDe("c-aberto").some((o) => o.roleId === "r-baixo")).toBe(false);
  });

  it("apagar a regra de um usuário não pede hierarquia — usuário não tem posição", async () => {
    const { service, regrasDe } = mundo();
    await service.removeOverride(MOD, G, "c-aberto", ALVO);
    expect(regrasDe("c-aberto").some((o) => o.userId === ALVO)).toBe(false);
  });

  it("readmitido no canal, o moderador volta a gerenciá-lo (canal)", async () => {
    const { service, enxerga } = mundo();
    await service.setOverride(DONO, G, "c-privado", {
      userId: MOD,
      allow: Permission.VIEW_CHANNEL,
      deny: 0,
    });
    expect(await enxerga(MOD, "c-privado")).toBe(true);

    // a checagem nova não é uma proibição geral: ela só amarra a escrita ao que
    // o ator enxerga
    await service.setOverride(MOD, G, "c-privado", {
      roleId: "r-baixo",
      allow: 0,
      deny: Permission.SEND_MESSAGES,
    });
    await service.removeOverride(MOD, G, "c-privado", "r-baixo");
  });
});

/**
 * A categoria é a mesma escalada com o alcance multiplicado: `aposMudarOverrides`
 * copia a regra dela para **todo** canal sincronizado, então uma chamada só
 * abre ou fecha vários canais.
 */
describe("regras de categoria — a mesma porta, com alcance de vários canais", () => {
  it("o moderador barrado não se readmite pela categoria, e o canal sincronizado segue fechado", async () => {
    const { categorias, regrasDaCategoria, enxerga } = mundo();
    expect(await enxerga(MOD, "c-sync")).toBe(false);

    await expect(
      categorias.setOverride(MOD, G, "cat-privada", {
        roleId: null,
        userId: MOD,
        allow: Permission.VIEW_CHANNEL,
        deny: 0,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(regrasDaCategoria("cat-privada")).toHaveLength(1);
    expect(await enxerga(MOD, "c-sync")).toBe(false);
  });

  it("nem apagando a regra do @everyone da categoria — que abriria todos os canais dela", async () => {
    const { categorias, regrasDaCategoria, canalDe, enxerga } = mundo();

    await expect(categorias.removeOverride(MOD, G, "cat-privada", "r-everyone")).rejects.toThrow(
      ForbiddenException,
    );

    expect(regrasDaCategoria("cat-privada")).toHaveLength(1);
    expect(canalDe("c-sync").private).toBe(true);
    expect(await enxerga(MOD, "c-sync")).toBe(false);
  });

  it("a hierarquia vale nos dois verbos — no `PUT` da categoria ela não existia", async () => {
    const { categorias, regrasDaCategoria } = mundo();

    await expect(
      categorias.setOverride(MOD, G, "cat-aberta", {
        roleId: "r-alto",
        userId: null,
        allow: 0,
        deny: Permission.SEND_MESSAGES,
      }),
    ).rejects.toThrow(/acima do seu/);
    await expect(categorias.removeOverride(MOD, G, "cat-aberta", "r-alto")).rejects.toThrow(
      /acima do seu/,
    );

    expect(regrasDaCategoria("cat-aberta")).toHaveLength(1);
  });

  it("o dono abre a categoria e o canal sincronizado acompanha", async () => {
    const { categorias, canalDe, enxerga } = mundo();

    await categorias.removeOverride(DONO, G, "cat-privada", "r-everyone");

    // a propagação é o ponto: apagar UMA regra de categoria mexe no canal
    expect(await enxerga(MOD, "c-sync")).toBe(true);
    expect(canalDe("c-sync").private).toBe(false);
  });

  it("o dono readmite alguém pela categoria, e o moderador que enxerga gerencia cargo abaixo do seu", async () => {
    const { categorias, regrasDaCategoria, enxerga } = mundo();

    await categorias.setOverride(DONO, G, "cat-privada", {
      roleId: null,
      userId: MOD,
      allow: Permission.VIEW_CHANNEL,
      deny: 0,
    });
    expect(await enxerga(MOD, "c-sync")).toBe(true);

    // com a categoria à vista, ele volta a gerenciá-la — a checagem nova não é
    // uma proibição geral
    await categorias.setOverride(MOD, G, "cat-privada", {
      roleId: "r-baixo",
      userId: null,
      allow: 0,
      deny: Permission.SEND_MESSAGES,
    });
    expect(regrasDaCategoria("cat-privada")).toHaveLength(3);

    await categorias.removeOverride(MOD, G, "cat-privada", "r-baixo");
    expect(regrasDaCategoria("cat-privada").some((o) => o.roleId === "r-baixo")).toBe(false);
  });
});
