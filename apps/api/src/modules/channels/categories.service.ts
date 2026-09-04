import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ALL_PERMISSIONS, Permission, WS_EVENTS, hasPermission } from "@streamz/shared";
import type { Category, CategoryOverride, ChannelOverrideInput } from "@streamz/shared";
import { toCategoryDTO, toCategoryOverrideDTO, toChannelDTO, toOverrideDTO } from "../../common/dto";
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
    // c-cargos: os canais soltos não herdam mais de ninguém. As regras que eles
    // herdavam já estão copiadas nas linhas deles (é o que a sincronia grava),
    // então o acesso não muda — o que muda é parar de dizer "sincronizado" para
    // um canal cuja categoria não existe mais.
    await this.prisma.channel.updateMany({
      where: { categoryId, syncedWithCategory: true },
      data: { syncedWithCategory: false },
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

  // ── regras (overrides) da categoria ────────────────────────

  /**
   * As regras da categoria. Basta ser membro do servidor: a tela de permissões
   * mostra o mesmo que a coluna já deixa deduzir (quem enxerga o quê), e
   * esconder isso de quem não modera só quebraria a UI sem esconder nada.
   */
  async listOverrides(
    userId: string,
    guildId: string,
    categoryId: string,
  ): Promise<CategoryOverride[]> {
    await this.guilds.assertMember(userId, guildId);
    await this.assertInGuild(categoryId, guildId);
    const rows = await this.prisma.categoryOverride.findMany({ where: { categoryId } });
    return rows.map(toCategoryOverrideDTO);
  }

  /** Todas as regras de todas as categorias do servidor — a carga do cliente. */
  async listGuildOverrides(userId: string, guildId: string): Promise<CategoryOverride[]> {
    await this.guilds.assertMember(userId, guildId);
    const rows = await this.prisma.categoryOverride.findMany({
      where: { category: { guildId } },
    });
    return rows.map(toCategoryOverrideDTO);
  }

  /**
   * Grava a regra de um cargo ou de um usuário numa categoria e **propaga** aos
   * canais sincronizados.
   *
   * As mesmas duas travas do override de canal: exige `MANAGE_ROLES`, e ninguém
   * concede o que não tem — senão `MANAGE_ROLES` viraria `ADMINISTRATOR` por
   * um caminho de duas telas.
   */
  async setOverride(
    actorId: string,
    guildId: string,
    categoryId: string,
    input: ChannelOverrideInput,
  ): Promise<CategoryOverride[]> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    await this.assertInGuild(categoryId, guildId);
    const roleId = input.roleId ?? null;
    const userId = input.userId ?? null;
    if ((roleId === null) === (userId === null)) {
      throw new BadRequestException(
        "A regra vale para um cargo ou para um usuário, não os dois",
      );
    }
    const minhas = await this.guilds.permissionsOf(actorId, guildId);
    const mexidas = (input.allow | input.deny) & ALL_PERMISSIONS;
    if (!hasPermission(minhas, mexidas)) {
      throw new ForbiddenException("Você não pode mexer numa permissão que não tem");
    }
    if (roleId) {
      const cargo = await this.prisma.role.findUnique({ where: { id: roleId } });
      if (!cargo || cargo.guildId !== guildId) {
        throw new BadRequestException("Cargo não pertence a este servidor");
      }
    } else {
      await this.guilds.assertMember(userId as string, guildId);
    }

    const allow = input.allow & ALL_PERMISSIONS;
    const deny = input.deny & ALL_PERMISSIONS & ~allow;
    if (roleId) {
      await this.prisma.categoryOverride.upsert({
        where: { categoryId_roleId: { categoryId, roleId } },
        create: { categoryId, roleId, allow, deny },
        update: { allow, deny },
      });
    } else {
      await this.prisma.categoryOverride.upsert({
        where: { categoryId_userId: { categoryId, userId: userId as string } },
        create: { categoryId, userId: userId as string, allow, deny },
        update: { allow, deny },
      });
    }
    return this.aposMudarOverrides(guildId, categoryId);
  }

  async removeOverride(
    actorId: string,
    guildId: string,
    categoryId: string,
    targetId: string,
  ): Promise<CategoryOverride[]> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    await this.assertInGuild(categoryId, guildId);
    await this.prisma.categoryOverride.deleteMany({
      where: { categoryId, OR: [{ roleId: targetId }, { userId: targetId }] },
    });
    return this.aposMudarOverrides(guildId, categoryId);
  }

  /**
   * Copia as regras da categoria para todo canal sincronizado dela, avisa a
   * quem interessa e devolve o estado novo.
   *
   * A propagação é uma **cópia**, não um ponteiro: é assim que o Discord faz, e
   * é o que permite dessincronizar um canal sem perder o que ele herdava. O
   * cálculo de permissão continua sabendo herdar por conta própria
   * (`GuildsService.regrasPorCanal`) — as duas coisas juntas fazem a cópia ser
   * uma otimização, não a fonte da verdade.
   */
  private async aposMudarOverrides(
    guildId: string,
    categoryId: string,
  ): Promise<CategoryOverride[]> {
    const rows = await this.prisma.categoryOverride.findMany({ where: { categoryId } });
    const overrides = rows.map(toCategoryOverrideDTO);

    const sincronizados = await this.prisma.channel.findMany({
      where: { categoryId, syncedWithCategory: true },
      select: { id: true },
    });
    for (const canal of sincronizados) {
      await this.prisma.$transaction([
        this.prisma.channelOverride.deleteMany({ where: { channelId: canal.id } }),
        ...rows.map((o) =>
          this.prisma.channelOverride.create({
            data: {
              channelId: canal.id,
              roleId: o.roleId,
              userId: o.userId,
              allow: o.allow,
              deny: o.deny,
            },
          }),
        ),
      ]);
      await this.guilds.syncChannelFlags(canal.id);
    }

    // quem passou a ver (ou deixou de ver) um canal precisa entrar/sair da sala
    const membros = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    for (const m of membros) await this.guilds.resyncChannelRooms(guildId, m.userId);

    this.realtime.emitToGuild(guildId, WS_EVENTS.CATEGORY_OVERRIDES, {
      guildId,
      categoryId,
      overrides,
    });
    for (const canal of sincronizados) {
      const linhas = await this.prisma.channelOverride.findMany({
        where: { channelId: canal.id },
      });
      this.realtime.emitToGuild(guildId, WS_EVENTS.CHANNEL_OVERRIDES, {
        guildId,
        channelId: canal.id,
        overrides: linhas.map(toOverrideDTO),
      });
    }
    return overrides;
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
