import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Permission, WS_EVENTS } from "@streamz/shared";
import { ChannelsService } from "./channels.service";
import type { AuditService } from "../audit/audit.service";
import type { CategoriesService } from "./categories.service";
import type { GuildsService } from "../guilds/guilds.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * ── api-duplicar-canal ── `POST guilds/:guildId/channels/:channelId/duplicate`.
 *
 * O que prende aqui: os `ChannelOverride` do original são copiados 1:1 (nunca
 * reherdados da categoria — o original pode ter regra própria mesmo
 * sincronizado=false) e a cópia entra na posição logo abaixo, empurrando quem
 * vinha depois no mesmo bloco da barra lateral.
 */

const ATOR = "u-ator";
const GUILD = "s1";
const CANAL = "c1";

const ORIGINAL = {
  id: CANAL,
  guildId: GUILD,
  name: "geral",
  type: "TEXT",
  position: 2,
  private: true,
  readOnly: false,
  categoryId: "cat1",
  syncedWithCategory: false,
  topic: "papo do servidor",
  slowmodeSeconds: 10,
  nsfw: false,
};

const OVERRIDES = [
  { id: "o1", channelId: CANAL, roleId: "everyone", userId: null, allow: 0, deny: Permission.VIEW_CHANNEL },
  { id: "o2", channelId: CANAL, roleId: null, userId: "u9", allow: Permission.VIEW_CHANNEL, deny: 0 },
];

function montar() {
  const prisma = {
    channel: {
      findUnique: vi.fn().mockResolvedValue(ORIGINAL),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "c2", ...data }),
      ),
    },
    channelOverride: {
      findMany: vi.fn().mockResolvedValue(OVERRIDES),
      createMany: vi.fn().mockResolvedValue({ count: OVERRIDES.length }),
    },
  } as unknown as PrismaService;

  const guilds = {
    assertCanModerate: vi.fn().mockResolvedValue(undefined),
    viewersOfChannel: vi.fn().mockResolvedValue(["u1", "u2"]),
  } as unknown as GuildsService;

  const realtime = {
    joinChannelRooms: vi.fn(),
    emitToUsers: vi.fn(),
  } as unknown as RealtimeService;

  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;

  const service = new ChannelsService(prisma, guilds, realtime, {} as CategoriesService, audit);
  return { service, prisma, guilds, realtime, audit };
}

describe("duplicar canal", () => {
  it("copia os overwrites e entra logo abaixo do original", async () => {
    const { service, prisma, guilds, realtime } = montar();

    const dto = await service.duplicate(ATOR, GUILD, CANAL);

    expect(guilds.assertCanModerate).toHaveBeenCalledWith(ATOR, GUILD, Permission.MANAGE_CHANNELS);

    // abre espaço na posição 3 empurrando quem vinha depois — sem tocar em
    // canais de outra categoria
    expect(prisma.channel.updateMany).toHaveBeenCalledWith({
      where: { guildId: GUILD, categoryId: "cat1", position: { gt: 2 } },
      data: { position: { increment: 1 } },
    });

    expect(prisma.channel.create).toHaveBeenCalledWith({
      data: {
        guildId: GUILD,
        name: "geral",
        type: "TEXT",
        position: 3,
        private: true,
        readOnly: false,
        categoryId: "cat1",
        syncedWithCategory: false,
        topic: "papo do servidor",
        slowmodeSeconds: 10,
        nsfw: false,
      },
    });

    expect(prisma.channelOverride.createMany).toHaveBeenCalledWith({
      data: [
        { channelId: "c2", roleId: "everyone", userId: null, allow: 0, deny: Permission.VIEW_CHANNEL },
        { channelId: "c2", roleId: null, userId: "u9", allow: Permission.VIEW_CHANNEL, deny: 0 },
      ],
    });

    expect(dto.id).toBe("c2");
    expect(dto.position).toBe(3);
    expect(dto.name).toBe("geral");

    // mesmo evento que a criação normal emite
    expect(realtime.joinChannelRooms).toHaveBeenCalledWith(["u1", "u2"], "c2");
    expect(realtime.emitToUsers).toHaveBeenCalledWith(
      ["u1", "u2"],
      WS_EVENTS.CHANNEL_CREATED,
      expect.objectContaining({ id: "c2" }),
    );
  });

  it("sem permissão de gerenciar canais é recusado (403), e nada é criado", async () => {
    const { service, prisma, guilds } = montar();
    (guilds.assertCanModerate as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ForbiddenException("Você não tem permissão para isso"),
    );

    await expect(service.duplicate(ATOR, GUILD, CANAL)).rejects.toThrow(
      "Você não tem permissão para isso",
    );
    expect(prisma.channel.create).not.toHaveBeenCalled();
  });

  it("canal inexistente dá 404", async () => {
    const { service, prisma } = montar();
    (prisma.channel.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.duplicate(ATOR, GUILD, "nao-existe")).rejects.toThrow(
      "Canal não encontrado",
    );
    expect(prisma.channel.create).not.toHaveBeenCalled();
  });

  it("canal de outro servidor também dá 404 (não vaza que o id existe alhures)", async () => {
    const { service, prisma } = montar();
    (prisma.channel.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...ORIGINAL,
      guildId: "outro-servidor",
    });

    await expect(service.duplicate(ATOR, GUILD, CANAL)).rejects.toThrow("Canal não encontrado");
    expect(prisma.channel.create).not.toHaveBeenCalled();
  });
});
