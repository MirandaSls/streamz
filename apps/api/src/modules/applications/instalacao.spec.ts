import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ALL_PERMISSIONS, Permission, WS_EVENTS } from "@streamz/shared";
import { describe, expect, it } from "vitest";

import { InstalacaoService } from "./instalacao.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { RolesService } from "../roles/roles.service";

/**
 * Instalar e remover um aplicativo num servidor.
 *
 * ── j-bots · F4, lote B ──
 *
 * O que estes testes prendem, em ordem de gravidade:
 *
 * 1. **`MANAGE_GUILD` é a primeira linha das três operações.** É a prova 3 da
 *    fase, e um `assert` que more no meio de um método é um `assert` que uma
 *    saída antecipada consegue pular. Aqui a checagem falha e nada mais é
 *    tocado — nem uma leitura.
 * 2. **A trava da escalada de privilégio** (§4 do contrato): quem instala não
 *    concede o que não tem. Sem ela, `MANAGE_GUILD` vira `ADMINISTRATOR` de
 *    graça — instala-se um bot que se controla com um cargo de administrador. E
 *    quem decide é o `RolesService.validarPermissoes`, não uma segunda cópia da
 *    regra aqui dentro.
 * 3. O `member.joined` no **formato exato** de `invites.service.ts`, com o
 *    `joinedAt` relido do banco: é dele que a `PonteDeEventos` tira o
 *    `GUILD_CREATE` do bot, e um formato diferente é um bot que nunca sabe que
 *    entrou.
 * 4. A ordem dos eventos de exclusão: `role.deleted` **antes** de
 *    `member.left`, porque depois do segundo o bot já recebeu `GUILD_DELETE` e
 *    não escuta mais.
 */

const APP = {
  id: "app1",
  snowflake: 987654321098765432n,
  name: "Hydra",
  description: "Toca música",
  iconKey: null,
  permissoesPadrao: 3,
  publico: true,
  ownerId: "u_dono",
  botUserId: "u_bot",
  botUser: {
    id: "u_bot",
    username: "hydra",
    displayName: "Hydra",
    avatarUrl: null,
    status: "ONLINE",
    isBot: true,
  },
  _count: { installs: 2 },
};

const CARGO = {
  id: "r_app",
  guildId: "g1",
  name: "Hydra",
  color: null,
  position: 3,
  permissions: 3,
  hoist: false,
  mentionable: false,
  isDefault: false,
};

interface Opcoes {
  /** permissão que `assertCanModerate` recusa (lança 403). */
  semManageGuild?: boolean;
  /** o que `validarPermissoes` faz: `null` = recusa. */
  minhasPermissoes?: number;
  app?: typeof APP | null;
  jaInstalado?: { id: string; roleId: string | null; installedById: string } | null;
}

function ambiente(op: Opcoes = {}) {
  const passos: string[] = [];
  const eventos: { guildId: string; evento: string; dado: unknown }[] = [];
  const minhas = op.minhasPermissoes ?? ALL_PERMISSIONS;

  const guilds = {
    async assertCanModerate(actorId: string, guildId: string, permissao: number) {
      passos.push(`assertCanModerate:${actorId}:${guildId}:${permissao}`);
      if (op.semManageGuild) throw new ForbiddenException("Você não tem permissão para isso");
      return {};
    },
    async rank() {
      passos.push("rank");
      return 5;
    },
    async resyncChannelRooms(guildId: string, userId: string) {
      passos.push(`resyncChannelRooms:${guildId}:${userId}`);
    },
  } as unknown as GuildsService;

  const roles = {
    async validarPermissoes(actorId: string, guildId: string, permissions: number) {
      passos.push(`validarPermissoes:${permissions}`);
      // o corpo real, para o teste provar a regra e não o dublê
      const pedidas = permissions & ALL_PERMISSIONS;
      if ((pedidas & ~minhas) !== 0) {
        throw new ForbiddenException("Você não pode conceder uma permissão que não tem");
      }
      return pedidas;
    },
  } as unknown as RolesService;

  const realtime = {
    emitToGuild(guildId: string, evento: string, dado: unknown) {
      eventos.push({ guildId, evento, dado });
    },
    joinGuildRoom(userId: string, guildId: string) {
      passos.push(`joinGuildRoom:${userId}:${guildId}`);
    },
    leaveGuildRoom(userId: string, guildId: string) {
      passos.push(`leaveGuildRoom:${userId}:${guildId}`);
    },
    leaveChannelRooms(userId: string, ids: string[]) {
      passos.push(`leaveChannelRooms:${userId}:${ids.length}`);
    },
  } as unknown as RealtimeService;

  const tx = {
    role: {
      async create({ data }: { data: Record<string, unknown> }) {
        passos.push(`role.create:${data.name}:${data.permissions}:${data.position}`);
        return { ...CARGO, ...data };
      },
      async deleteMany({ where }: { where: { id?: string } }) {
        passos.push(`role.deleteMany:${where.id}`);
        return { count: 1 };
      },
    },
    guildMember: {
      async create({ data }: { data: Record<string, unknown> }) {
        passos.push(`guildMember.create:${data.userId}:${data.role}`);
        return {};
      },
      async deleteMany({ where }: { where: { userId?: string } }) {
        passos.push(`guildMember.deleteMany:${where.userId}`);
        return { count: 1 };
      },
    },
    guildMemberRole: {
      async create({ data }: { data: Record<string, unknown> }) {
        passos.push(`guildMemberRole.create:${data.userId}:${data.roleId}`);
        return {};
      },
      async deleteMany() {
        passos.push("guildMemberRole.deleteMany");
        return { count: 1 };
      },
    },
    guildApplication: {
      async create({ data }: { data: Record<string, unknown> }) {
        passos.push(`guildApplication.create:${data.permissions}:${data.installedById}`);
        return {
          id: "gapp1",
          guildId: "g1",
          applicationId: "app1",
          createdAt: new Date("2026-09-08T15:00:00.000Z"),
          ...data,
        };
      },
      async delete({ where }: { where: { id: string } }) {
        passos.push(`guildApplication.delete:${where.id}`);
        return {};
      },
    },
  };

  const prisma = {
    async $transaction(fn: (t: typeof tx) => Promise<unknown>) {
      passos.push("transacao:inicio");
      const r = await fn(tx);
      passos.push("transacao:fim");
      return r;
    },
    application: {
      async findUnique() {
        passos.push("application.findUnique");
        return op.app === undefined ? APP : op.app;
      },
    },
    guildApplication: {
      async findUnique() {
        passos.push("guildApplication.findUnique");
        const j = op.jaInstalado ?? null;
        return j ? { ...j, guildId: "g1", applicationId: "app1", application: APP } : null;
      },
      async findMany() {
        passos.push("guildApplication.findMany");
        return [];
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        passos.push(`guildApplication.update:${where.id}:${data.permissions}`);
        return {
          id: where.id,
          guildId: "g1",
          applicationId: "app1",
          installedById: op.jaInstalado?.installedById ?? "u_ana",
          createdAt: new Date("2026-09-08T15:00:00.000Z"),
          roleId: null,
          permissions: 0,
          ...data,
        };
      },
    },
    guildMember: {
      async findUnique() {
        passos.push("guildMember.findUnique");
        // relido do banco de propósito: a lista de membros ordena por ele
        return { joinedAt: new Date("2026-09-08T15:00:00.123Z") };
      },
      async upsert() {
        passos.push("guildMember.upsert");
        return {};
      },
    },
    guildMemberRole: {
      async upsert() {
        passos.push("guildMemberRole.upsert");
        return {};
      },
    },
    channel: {
      async findMany() {
        passos.push("channel.findMany");
        return [{ id: "c1" }, { id: "c2" }];
      },
    },
    user: {
      async findUnique() {
        passos.push("user.findUnique");
        return {
          id: "u_ana",
          username: "ana",
          displayName: "Ana",
          avatarUrl: null,
          status: "ONLINE",
          isBot: false,
        };
      },
      async findMany() {
        return [];
      },
    },
    role: {
      async aggregate() {
        passos.push("role.aggregate");
        return { _max: { position: 2 } };
      },
      async findFirst() {
        passos.push("role.findFirst");
        return CARGO;
      },
      async update({ data }: { data: Record<string, unknown> }) {
        passos.push(`role.update:${data.permissions}`);
        return { ...CARGO, ...data };
      },
    },
  } as unknown as PrismaService;

  return {
    servico: new InstalacaoService(prisma, guilds, roles, realtime),
    passos,
    eventos,
  };
}

describe("InstalacaoService — MANAGE_GUILD é a primeira linha", () => {
  it("instalar sem MANAGE_GUILD é 403, e nada mais é tocado", async () => {
    const a = ambiente({ semManageGuild: true });

    await expect(a.servico.instalar("u_ana", "g1", "app1", 3)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // a checagem, e só ela: nem a `Application` chegou a ser lida
    expect(a.passos).toEqual([`assertCanModerate:u_ana:g1:${Permission.MANAGE_GUILD}`]);
    expect(a.eventos).toEqual([]);
  });

  it("listar sem MANAGE_GUILD é 403", async () => {
    const a = ambiente({ semManageGuild: true });
    await expect(a.servico.listar("u_ana", "g1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(a.passos).toEqual([`assertCanModerate:u_ana:g1:${Permission.MANAGE_GUILD}`]);
  });

  it("remover sem MANAGE_GUILD é 403", async () => {
    const a = ambiente({ semManageGuild: true });
    await expect(a.servico.remover("u_ana", "g1", "app1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(a.passos).toEqual([`assertCanModerate:u_ana:g1:${Permission.MANAGE_GUILD}`]);
  });

  it("a permissão pedida é MANAGE_GUILD, e não outra qualquer", async () => {
    const a = ambiente();
    await a.servico.instalar("u_ana", "g1", "app1", 3);
    expect(a.passos[0]).toBe(`assertCanModerate:u_ana:g1:${Permission.MANAGE_GUILD}`);
  });
});

describe("InstalacaoService — a trava da escalada de privilégio (§4)", () => {
  it("não se concede ADMINISTRATOR quando não se tem: 403", async () => {
    const a = ambiente({
      // um moderador com MANAGE_GUILD e mais nada
      minhasPermissoes: Permission.MANAGE_GUILD | Permission.VIEW_CHANNEL,
    });

    await expect(
      a.servico.instalar("u_ana", "g1", "app1", Permission.ADMINISTRATOR),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // e o cargo NÃO foi criado: sem esta linha o teste passaria com o 403
    // sendo lançado depois da escrita
    expect(a.passos.some((p) => p.startsWith("role.create"))).toBe(false);
    expect(a.eventos).toEqual([]);
  });

  it("quem tem tudo concede tudo (dono e ADMINISTRATOR)", async () => {
    const a = ambiente({ minhasPermissoes: ALL_PERMISSIONS });
    await expect(
      a.servico.instalar("u_dona", "g1", "app1", ALL_PERMISSIONS),
    ).resolves.toMatchObject({ permissions: ALL_PERMISSIONS });
  });

  it("quem decide é o RolesService, e o cargo grava o RETORNO dele", async () => {
    const a = ambiente();
    // bits fora de `ALL_PERMISSIONS` são mascarados pelo `validarPermissoes`;
    // gravar a **entrada** deixaria uma permissão fantasma no cargo
    await a.servico.instalar("u_ana", "g1", "app1", 3);
    expect(a.passos).toContain("validarPermissoes:3");
    expect(a.passos.some((p) => p.startsWith("role.create:Hydra:3:"))).toBe(true);
  });

  it("a trava vem ANTES de qualquer escrita", async () => {
    const a = ambiente();
    await a.servico.instalar("u_ana", "g1", "app1", 3);
    expect(a.passos.indexOf("validarPermissoes:3")).toBeLessThan(
      a.passos.indexOf("transacao:inicio"),
    );
  });
});

describe("InstalacaoService.instalar — o app", () => {
  it("app privado de outra pessoa é 404, e não 403", async () => {
    const a = ambiente({ app: { ...APP, publico: false, ownerId: "u_outro" } });
    await expect(a.servico.instalar("u_ana", "g1", "app1", 3)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("o dono instala o próprio app antes de publicá-lo", async () => {
    const a = ambiente({ app: { ...APP, publico: false, ownerId: "u_ana" } });
    await expect(a.servico.instalar("u_ana", "g1", "app1", 3)).resolves.toMatchObject({
      applicationId: "app1",
    });
  });

  it("app que não existe é 404", async () => {
    const a = ambiente({ app: null });
    await expect(a.servico.instalar("u_ana", "g1", "app1", 3)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("InstalacaoService.instalar — os oito passos, em ordem", () => {
  it("cargo → membro → atribuição → autorização, tudo numa transação", async () => {
    const a = ambiente();
    await a.servico.instalar("u_ana", "g1", "app1", 3);

    const dentro = a.passos.slice(
      a.passos.indexOf("transacao:inicio") + 1,
      a.passos.indexOf("transacao:fim"),
    );
    expect(dentro).toEqual([
      "role.create:Hydra:3:3",
      "guildMember.create:u_bot:MEMBER",
      "guildMemberRole.create:u_bot:r_app",
      "guildApplication.create:3:u_ana",
    ]);
  });

  it("a posição do cargo nunca passa do cargo mais alto de quem instala", async () => {
    // `rank` devolve 5 e o maior cargo do servidor está em 2 →
    // `Math.min(2 + 1, Math.max(5, 1))` = 3
    const a = ambiente();
    await a.servico.instalar("u_ana", "g1", "app1", 3);
    expect(a.passos).toContain("role.create:Hydra:3:3");
  });

  it("role.created sai ANTES de member.joined", async () => {
    const a = ambiente();
    await a.servico.instalar("u_ana", "g1", "app1", 3);
    // quem receber o membro já consegue resolver o `roleIds` dele
    expect(a.eventos.map((e) => e.evento)).toEqual([
      WS_EVENTS.ROLE_CREATED,
      WS_EVENTS.MEMBER_JOINED,
    ]);
  });

  it("member.joined tem o formato EXATO de invites.service.ts", async () => {
    const a = ambiente();
    await a.servico.instalar("u_ana", "g1", "app1", 3);

    const entrou = a.eventos.find((e) => e.evento === WS_EVENTS.MEMBER_JOINED);
    expect(entrou?.dado).toEqual({
      guildId: "g1",
      member: {
        role: "MEMBER",
        user: expect.objectContaining({ id: "u_bot", bot: true }),
        // o bot nasce COM o cargo do app — é o que o diferencia de quem entra
        // por convite, que só tem o @everyone
        roleIds: ["r_app"],
        // relido do banco, e não `new Date()`: a lista de membros ordena por
        // ele, e o relógio do processo não é o da transação
        joinedAt: "2026-09-08T15:00:00.123Z",
      },
    });
  });

  it("o bot entra nas salas, como um membro novo qualquer", async () => {
    const a = ambiente();
    await a.servico.instalar("u_ana", "g1", "app1", 3);
    expect(a.passos).toContain("joinGuildRoom:u_bot:g1");
    expect(a.passos).toContain("resyncChannelRooms:g1:u_bot");
  });

  it("os eventos saem DEPOIS do commit, nunca de dentro da transação", async () => {
    const a = ambiente();
    await a.servico.instalar("u_ana", "g1", "app1", 3);
    // avisar o navegador de dentro de uma transação que ainda pode desfazer é
    // como a tela passa a mostrar um membro que não existe
    expect(a.eventos).toHaveLength(2);
    expect(a.passos.indexOf("transacao:fim")).toBeLessThan(a.passos.indexOf("guildMember.findUnique"));
  });
});

describe("InstalacaoService.instalar — instalar de novo é EDITAR", () => {
  it("não cria uma segunda linha: atualiza o cargo", async () => {
    const a = ambiente({
      jaInstalado: { id: "gapp1", roleId: "r_app", installedById: "u_ana" },
    });

    await a.servico.instalar("u_ana", "g1", "app1", 7);

    expect(a.passos).toContain("role.update:7");
    expect(a.passos.some((p) => p.startsWith("role.create"))).toBe(false);
    expect(a.passos.some((p) => p.startsWith("guildApplication.create"))).toBe(false);
  });

  it("reautorizar não faz o bot sair e voltar (nada de ROLE_CREATED)", async () => {
    const a = ambiente({
      jaInstalado: { id: "gapp1", roleId: "r_app", installedById: "u_ana" },
    });

    await a.servico.instalar("u_ana", "g1", "app1", 7);

    // um `GUILD_DELETE` + `GUILD_CREATE` por uma caixinha marcada seria o
    // preço de recriar o cargo. Aqui é só um `GUILD_ROLE_UPDATE`.
    expect(a.eventos.map((e) => e.evento)).toEqual([
      WS_EVENTS.ROLE_UPDATED,
      WS_EVENTS.MEMBER_JOINED,
    ]);
  });

  it("a trava da escalada vale também na reautorização", async () => {
    const a = ambiente({
      jaInstalado: { id: "gapp1", roleId: "r_app", installedById: "u_ana" },
      minhasPermissoes: Permission.MANAGE_GUILD,
    });
    await expect(
      a.servico.instalar("u_ana", "g1", "app1", Permission.ADMINISTRATOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("InstalacaoService.remover", () => {
  it("app que não está instalado é 404", async () => {
    const a = ambiente({ jaInstalado: null });
    await expect(a.servico.remover("u_ana", "g1", "app1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("desfaz na ordem inversa, numa transação", async () => {
    const a = ambiente({
      jaInstalado: { id: "gapp1", roleId: "r_app", installedById: "u_ana" },
    });

    await a.servico.remover("u_ana", "g1", "app1");

    const dentro = a.passos.slice(
      a.passos.indexOf("transacao:inicio") + 1,
      a.passos.indexOf("transacao:fim"),
    );
    expect(dentro).toEqual([
      "guildApplication.delete:gapp1",
      "guildMemberRole.deleteMany",
      "guildMember.deleteMany:u_bot",
      "role.deleteMany:r_app",
    ]);
  });

  it("role.deleted sai ANTES de member.left", async () => {
    const a = ambiente({
      jaInstalado: { id: "gapp1", roleId: "r_app", installedById: "u_ana" },
    });

    await a.servico.remover("u_ana", "g1", "app1");

    // depois do `member.left` o bot já recebeu `GUILD_DELETE` e não escuta
    // mais: o `role.deleted` invertido cairia no vazio
    expect(a.eventos.map((e) => e.evento)).toEqual([
      WS_EVENTS.ROLE_DELETED,
      WS_EVENTS.MEMBER_LEFT,
    ]);
    expect(a.eventos[1]?.dado).toEqual({ guildId: "g1", userId: "u_bot" });
  });

  it("o bot sai das salas", async () => {
    const a = ambiente({
      jaInstalado: { id: "gapp1", roleId: "r_app", installedById: "u_ana" },
    });
    await a.servico.remover("u_ana", "g1", "app1");
    expect(a.passos).toContain("leaveChannelRooms:u_bot:2");
    expect(a.passos).toContain("leaveGuildRoom:u_bot:g1");
  });

  it("instalação sem cargo (permissão nenhuma) não emite role.deleted", async () => {
    const a = ambiente({
      jaInstalado: { id: "gapp1", roleId: null, installedById: "u_ana" },
    });
    await a.servico.remover("u_ana", "g1", "app1");
    expect(a.eventos.map((e) => e.evento)).toEqual([WS_EVENTS.MEMBER_LEFT]);
  });
});
