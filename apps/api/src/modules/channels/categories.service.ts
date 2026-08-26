import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Permission, WS_EVENTS } from "@streamz/shared";
import type { Category } from "@streamz/shared";
import { toCategoryDTO, toChannelDTO } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";

/**
 * Categorias de um servidor — o agrupamento visual da barra lateral.
 *
 * Não autoriza nada: quem decide quem vê o quê continua sendo o
 * `GuildsService`. Por isso os eventos de categoria vão para a sala
 * `guild:<id>` inteira (nome e ordem de categoria não são segredo), enquanto
 * os canais afetados continuam saindo por `viewersOfChannel`.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Categorias do servidor, na ordem da barra lateral. Basta ser membro. */
  async list(userId: string, guildId: string): Promise<Category[]> {
    await this.guilds.assertMember(userId, guildId);
    const rows = await this.prisma.category.findMany({
      where: { guildId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((c) => toCategoryDTO(c));
  }

  async create(actorId: string, guildId: string, name: string): Promise<Category> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    const nome = name.trim();
    if (!nome) throw new BadRequestException("Nome vazio");
    const total = await this.prisma.category.count({ where: { guildId } });
    const row = await this.prisma.category.create({
      data: { guildId, name: nome, position: total },
    });
    const dto = toCategoryDTO(row);
    this.realtime.emitToGuild(guildId, WS_EVENTS.CATEGORY_CREATED, dto);
    return dto;
  }

  async update(
    actorId: string,
    guildId: string,
    categoryId: string,
    patch: { name?: string },
  ): Promise<Category> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertInGuild(categoryId, guildId);
    const nome = patch.name?.trim();
    if (patch.name !== undefined && !nome) throw new BadRequestException("Nome vazio");
    const row = await this.prisma.category.update({
      where: { id: categoryId },
      data: { ...(nome ? { name: nome } : {}) },
    });
    const dto = toCategoryDTO(row);
    this.realtime.emitToGuild(guildId, WS_EVENTS.CATEGORY_UPDATED, dto);
    return dto;
  }

  /**
   * Apaga a categoria. Os canais dela **não** somem: a FK é `SetNull`, então
   * eles voltam a ficar sem categoria (topo da lista) — é o que o Discord faz,
   * e evita apagar conversa por engano ao arrumar a barra lateral.
   */
  async remove(actorId: string, guildId: string, categoryId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertInGuild(categoryId, guildId);
    const afetados = await this.prisma.channel.findMany({
      where: { categoryId },
      select: { id: true },
    });
    await this.prisma.category.delete({ where: { id: categoryId } });
    this.realtime.emitToGuild(guildId, WS_EVENTS.CATEGORY_DELETED, { categoryId, guildId });

    // cada canal solto vira um channel.updated para quem o enxerga
    const canais = await this.prisma.channel.findMany({
      where: { id: { in: afetados.map((c) => c.id) } },
    });
    for (const canal of canais) {
      const dto = toChannelDTO(canal);
      this.realtime.emitToUsers(
        await this.guilds.viewersOfChannel(canal),
        WS_EVENTS.CHANNEL_UPDATED,
        dto,
      );
    }
    return { deleted: categoryId, released: afetados.length };
  }

  /** Ids das categorias deste servidor, para validar reordenação em lote. */
  async idsOfGuild(guildId: string): Promise<Set<string>> {
    const rows = await this.prisma.category.findMany({
      where: { guildId },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** Reposiciona categorias em lote (chamado pela reordenação de canais). */
  async applyPositions(guildId: string, positions: { id: string; position: number }[]) {
    if (positions.length === 0) return [];
    const validos = await this.idsOfGuild(guildId);
    const alvo = positions.filter((p) => validos.has(p.id));
    if (alvo.length === 0) return [];
    await this.prisma.$transaction(
      alvo.map((p) =>
        this.prisma.category.update({ where: { id: p.id }, data: { position: p.position } }),
      ),
    );
    const rows = await this.prisma.category.findMany({
      where: { guildId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    const dtos = rows.map((c) => toCategoryDTO(c));
    for (const dto of dtos) {
      this.realtime.emitToGuild(guildId, WS_EVENTS.CATEGORY_UPDATED, dto);
    }
    return dtos;
  }

  private async assertInGuild(categoryId: string, guildId: string) {
    const row = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { guildId: true },
    });
    if (!row) throw new NotFoundException("Categoria não encontrada");
    if (row.guildId !== guildId) {
      throw new BadRequestException("Categoria não pertence a este servidor");
    }
  }
}
