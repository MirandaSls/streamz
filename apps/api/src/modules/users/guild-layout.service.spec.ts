import { describe, expect, it, vi } from "vitest";
import { WS_EVENTS } from "@streamz/shared";
import type { GuildLayout } from "@streamz/shared";
import { GuildLayoutService } from "./guild-layout.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

const EU = "ana";

function montar(opts: { meusServidores?: string[]; salvo?: unknown } = {}) {
  const { meusServidores = ["g1", "g2", "g3"], salvo = null } = opts;
  const prisma = {
    guildMember: {
      findMany: vi.fn().mockResolvedValue(meusServidores.map((guildId) => ({ guildId }))),
    },
    userGuildLayout: {
      findUnique: vi.fn().mockResolvedValue(salvo === null ? null : { userId: EU, layout: salvo }),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
  const realtime = { emitToUser: vi.fn() };
  const service = new GuildLayoutService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return { service, prisma, realtime };
}

const solto = (guildId: string) => ({ kind: "guild" as const, guildId });

describe("PUT /users/me/guild-layout", () => {
  it("recusa (400) guildId de que o usuário não é membro, sem gravar nem emitir", async () => {
    const { service, prisma, realtime } = montar();
    const corpo: GuildLayout = { items: [solto("g1"), solto("alheio")] };
    await expect(service.salvar(EU, corpo)).rejects.toMatchObject({ status: 400 });
    expect(prisma.userGuildLayout.upsert).not.toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it("recusa guildId alheio dentro de pasta", async () => {
    const { service } = montar();
    const corpo: GuildLayout = {
      items: [{ kind: "folder", folder: { id: "f1", name: null, color: null, guildIds: ["g1", "alheio"] } }],
    };
    await expect(service.salvar(EU, corpo)).rejects.toMatchObject({ status: 400 });
  });

  it("grava (upsert) o layout resolvido, emite para user:<eu> e devolve", async () => {
    const { service, prisma, realtime } = montar();
    // g3 esquecido: volta solto no fim
    const corpo: GuildLayout = { items: [solto("g2"), solto("g1")] };
    const dto = await service.salvar(EU, corpo);
    const esperado = { items: [solto("g2"), solto("g1"), solto("g3")] };
    expect(dto).toEqual(esperado);
    expect(prisma.userGuildLayout.upsert).toHaveBeenCalledWith({
      where: { userId: EU },
      create: { userId: EU, layout: esperado },
      update: { layout: esperado },
    });
    expect(realtime.emitToUser).toHaveBeenCalledWith(EU, WS_EVENTS.GUILD_LAYOUT_UPDATE, esperado);
  });
});

describe("GET /users/me/guild-layout", () => {
  it("sem layout salvo, tudo solto na ordem atual", async () => {
    const { service } = montar();
    await expect(service.obter(EU)).resolves.toEqual({
      items: [solto("g1"), solto("g2"), solto("g3")],
    });
  });

  it("reconcilia: servidor que saiu some, servidor novo aparece solto", async () => {
    const { service } = montar({
      meusServidores: ["g1", "g3"],
      salvo: { items: [solto("g2"), solto("g1")] },
    });
    await expect(service.obter(EU)).resolves.toEqual({ items: [solto("g1"), solto("g3")] });
  });

  it("documento salvo corrompido não derruba: vira tudo solto", async () => {
    const { service } = montar({ salvo: { lixo: true } });
    await expect(service.obter(EU)).resolves.toEqual({
      items: [solto("g1"), solto("g2"), solto("g3")],
    });
  });
});
