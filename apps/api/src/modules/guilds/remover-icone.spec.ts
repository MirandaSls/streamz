import { describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { DEFAULT_PERMISSIONS, Permission, WS_EVENTS } from "@streamz/shared";
import type { MemberRole } from "@streamz/shared";
import { GuildsService } from "./guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";
import type { StorageService } from "../storage/storage.service";

/**
 * `DELETE /guilds/:id/icon` — a **costura** entre permissão, banco, storage e
 * difusão. O que se quer garantir aqui não aparece no typecheck: quem sem
 * MANAGE_GUILD tenta é 403; a chave e a URL zeram juntas (URL órfã seria um
 * `<img>` quebrado em todo rail); o arquivo sai do storage só depois de o
 * banco parar de referenciá-lo; e `guild.updated` chega à sala do servidor
 * com o ícone já nulo — o mesmo evento que a troca difunde.
 */

interface Mundo {
  guild: { id: string; ownerId: string; iconKey: string | null };
  membros: { userId: string; role?: MemberRole }[];
  /** permissões do @everyone (por padrão, as de membro comum: sem MANAGE_GUILD). */
  everyone?: number;
}

interface Gravado {
  update: { iconKey: unknown; iconUrl: unknown } | null;
  apagados: string[];
  eventos: { guildId: string; event: string; payload: unknown }[];
  /** ordem em que banco e storage foram tocados. */
  ordem: string[];
}

function servicoCom(mundo: Mundo): { s: GuildsService; gravado: Gravado } {
  const gravado: Gravado = { update: null, apagados: [], eventos: [], ordem: [] };
  const linha = () => ({
    id: mundo.guild.id,
    name: "Servidor",
    ownerId: mundo.guild.ownerId,
    description: null,
    iconKey: mundo.guild.iconKey,
    iconUrl: mundo.guild.iconKey ? `http://api/api/guilds/${mundo.guild.id}/icon?v=x` : null,
  });

  const prisma = {
    guild: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === mundo.guild.id ? linha() : null,
      update: async ({ data }: { data: { iconKey: null; iconUrl: null } }) => {
        gravado.update = data;
        gravado.ordem.push("banco");
        return { ...linha(), ...data };
      },
    },
    guildMember: {
      findUnique: async ({
        where,
      }: {
        where: { userId_guildId: { userId: string; guildId: string } };
      }) => {
        const m = mundo.membros.find((x) => x.userId === where.userId_guildId.userId);
        return m && where.userId_guildId.guildId === mundo.guild.id
          ? { userId: m.userId, guildId: mundo.guild.id, role: m.role ?? "MEMBER" }
          : null;
      },
    },
    role: {
      findMany: async () => [
        {
          id: "everyone",
          guildId: mundo.guild.id,
          name: "@everyone",
          color: null,
          position: 0,
          permissions: mundo.everyone ?? DEFAULT_PERMISSIONS,
          hoist: false,
          mentionable: false,
          isDefault: true,
        },
      ],
    },
    guildMemberRole: { findMany: async () => [] },
  };
  const realtime = {
    emitToGuild: (guildId: string, event: string, payload: unknown) => {
      gravado.eventos.push({ guildId, event, payload });
    },
  };
  const storage = {
    delete: async (key: string) => {
      gravado.apagados.push(key);
      gravado.ordem.push("storage");
    },
  };
  const naoUsado = null as never;
  const s = new GuildsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
    naoUsado,
    storage as unknown as StorageService,
    naoUsado,
  );
  return { s, gravado };
}

const comIcone = (): Mundo => ({
  guild: { id: "g1", ownerId: "dono", iconKey: "guild-icons/g1/abc" },
  membros: [{ userId: "dono", role: "OWNER" }, { userId: "ana" }],
});

describe("removeIcon", () => {
  it("quem não é membro é 403", async () => {
    const { s, gravado } = servicoCom(comIcone());
    await expect(s.removeIcon("intruso", "g1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(gravado.update).toBeNull();
    expect(gravado.apagados).toEqual([]);
  });

  it("membro sem MANAGE_GUILD é 403 e nada muda", async () => {
    const { s, gravado } = servicoCom(comIcone());
    await expect(s.removeIcon("ana", "g1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(gravado.update).toBeNull();
    expect(gravado.apagados).toEqual([]);
    expect(gravado.eventos).toEqual([]);
  });

  it("dono remove: chave e URL zeram juntas, o arquivo sai do storage e a sala recebe guild.updated", async () => {
    const { s, gravado } = servicoCom(comIcone());
    const dto = await s.removeIcon("dono", "g1");
    expect(dto.iconUrl).toBeNull();
    expect(gravado.update).toEqual({ iconKey: null, iconUrl: null });
    expect(gravado.apagados).toEqual(["guild-icons/g1/abc"]);
    expect(gravado.eventos).toEqual([
      { guildId: "g1", event: WS_EVENTS.GUILD_UPDATED, payload: dto },
    ]);
  });

  it("o banco deixa de referenciar o arquivo antes de ele ser apagado", async () => {
    const { s, gravado } = servicoCom(comIcone());
    await s.removeIcon("dono", "g1");
    expect(gravado.ordem).toEqual(["banco", "storage"]);
  });

  it("membro com MANAGE_GUILD pelo @everyone também pode", async () => {
    const { s, gravado } = servicoCom({
      ...comIcone(),
      everyone: DEFAULT_PERMISSIONS | Permission.MANAGE_GUILD,
    });
    await s.removeIcon("ana", "g1");
    expect(gravado.update).toEqual({ iconKey: null, iconUrl: null });
  });

  it("sem ícone: zera mesmo assim, não toca o storage e ainda difunde", async () => {
    const { s, gravado } = servicoCom({
      guild: { id: "g1", ownerId: "dono", iconKey: null },
      membros: [{ userId: "dono", role: "OWNER" }],
    });
    const dto = await s.removeIcon("dono", "g1");
    expect(dto.iconUrl).toBeNull();
    expect(gravado.apagados).toEqual([]);
    expect(gravado.eventos).toHaveLength(1);
  });
});
