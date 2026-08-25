import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ALL_PERMISSIONS,
  MAX_ROLE_NAME,
  Permission,
  WS_EVENTS,
  hasPermission,
  isRoleColor,
} from "@newdisc/shared";
import type {
  ChannelOverride,
  MemberPermissions,
  Role,
  RoleInput,
} from "@newdisc/shared";
import { toOverrideDTO, toRoleDTO } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";

/**
 * Cargos, atribuição de cargo a membro e regras (overrides) por canal.
 *
 * A autorização mora em `GuildsService` (ponto único do projeto); aqui só se
 * escreve o dado. O que este service adiciona por conta própria é a
 * **hierarquia**: `MANAGE_ROLES` sem teto seria equivalente a `ADMINISTRATOR`,
 * porque bastaria criar um cargo com tudo ligado e vesti-lo. Por isso todo
 * caminho de escrita passa por `assertPodeMexerNoCargo` (ADR-0002).
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(userId: string, guildId: string): Promise<Role[]> {
    await this.guilds.assertMember(userId, guildId);
    return this.guilds.listRoles(guildId);
  }

  async create(actorId: string, guildId: string, input: RoleInput): Promise<Role> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const name = this.validarNome(input.name ?? "Novo cargo");
    const permissions = await this.validarPermissoes(actorId, guildId, input.permissions ?? 0);

    // nasce logo abaixo do cargo mais alto do criador — nunca acima dele
    const teto = await this.guilds.rank(guildId, actorId);
    const maior = await this.prisma.role.aggregate({
      where: { guildId },
      _max: { position: true },
    });
    const position = Math.min((maior._max.position ?? 0) + 1, Math.max(teto, 1));

    const role = await this.prisma.role.create({
      data: {
        guildId,
        name,
        color: this.validarCor(input.color),
        position,
        permissions,
        hoist: input.hoist ?? false,
        mentionable: input.mentionable ?? false,
      },
    });
    const dto = toRoleDTO(role);
    this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_CREATED, dto);
    return dto;
  }

  async update(
    actorId: string,
    guildId: string,
    roleId: string,
    input: RoleInput,
  ): Promise<Role> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const alvo = await this.assertPodeMexerNoCargo(actorId, guildId, roleId);

    // o @everyone só existe como padrão do servidor: nome, cor e hierarquia
    // dele não são editáveis — só o conjunto de permissões
    const data: Record<string, unknown> = {};
    if (input.permissions !== undefined) {
      data.permissions = await this.validarPermissoes(actorId, guildId, input.permissions);
    }
    if (!alvo.isDefault) {
      if (input.name !== undefined) data.name = this.validarNome(input.name);
      if (input.color !== undefined) data.color = this.validarCor(input.color);
      if (input.hoist !== undefined) data.hoist = input.hoist;
      if (input.mentionable !== undefined) data.mentionable = input.mentionable;
    }

    const role = await this.prisma.role.update({ where: { id: roleId }, data });
    const dto = toRoleDTO(role);
    this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_UPDATED, dto);
    await this.resyncMembrosDoCargo(guildId, roleId);
    return dto;
  }

  async remove(actorId: string, guildId: string, roleId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const alvo = await this.assertPodeMexerNoCargo(actorId, guildId, roleId);
    if (alvo.isDefault) throw new BadRequestException("O @everyone não pode ser apagado");

    const membros = await this.prisma.guildMemberRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    // as atribuições e os overrides deste cargo somem em cascata (schema)
    await this.prisma.role.delete({ where: { id: roleId } });
    this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_DELETED, { guildId, roleId });
    for (const m of membros) await this.guilds.resyncChannelRooms(guildId, m.userId);
    return { deleted: roleId };
  }

  /**
   * Reordena a hierarquia. Recebe os ids do mais baixo para o mais alto; o
   * @everyone fica sempre em 0, e nenhum cargo pode passar do teto do ator.
   */
  async reorder(actorId: string, guildId: string, orderedIds: string[]): Promise<Role[]> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const teto = await this.guilds.rank(guildId, actorId);
    const roles = await this.prisma.role.findMany({ where: { guildId } });
    const editaveis = roles.filter((r) => !r.isDefault);
    const ids = orderedIds.filter((id) => editaveis.some((r) => r.id === id));
    if (ids.length !== editaveis.length) {
      throw new BadRequestException("A ordem precisa conter todos os cargos do servidor");
    }
    // mexer num cargo acima do seu (na ordem velha ou na nova) é escalada
    for (const [i, id] of ids.entries()) {
      const atual = editaveis.find((r) => r.id === id)!;
      const nova = i + 1;
      if (atual.position !== nova && (atual.position >= teto || nova >= teto)) {
        throw new ForbiddenException("Você não pode reordenar cargos acima do seu");
      }
    }
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.role.update({ where: { id }, data: { position: i + 1 } }),
      ),
    );
    const atualizados = await this.guilds.listRoles(guildId);
    for (const r of atualizados) {
      this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_UPDATED, r);
    }
    return atualizados;
  }

  // ── atribuição de cargo a membro ───────────────────────────

  async assign(actorId: string, guildId: string, userId: string, roleId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const alvo = await this.assertPodeMexerNoCargo(actorId, guildId, roleId);
    if (alvo.isDefault) {
      throw new BadRequestException("O @everyone vale para todo membro — não se atribui");
    }
    await this.guilds.assertMember(userId, guildId);
    await this.prisma.guildMemberRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { guildId, userId, roleId },
      update: {},
    });
    return this.aposMudarCargosDoMembro(guildId, userId);
  }

  async unassign(actorId: string, guildId: string, userId: string, roleId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    await this.assertPodeMexerNoCargo(actorId, guildId, roleId);
    await this.prisma.guildMemberRole.deleteMany({ where: { guildId, userId, roleId } });
    return this.aposMudarCargosDoMembro(guildId, userId);
  }

  /** Permissão efetiva de um membro no servidor (para a UI e para depuração). */
  async memberPermissions(
    actorId: string,
    guildId: string,
    userId: string,
  ): Promise<MemberPermissions> {
    await this.guilds.assertMember(actorId, guildId);
    await this.guilds.assertMember(userId, guildId);
    const [permissions, roleIds] = await Promise.all([
      this.guilds.permissionsOf(userId, guildId),
      this.guilds.roleIdsOf(guildId, userId),
    ]);
    return { userId, guildId, permissions, roleIds };
  }

  // ── overrides por canal ────────────────────────────────────

  /** Regras de um canal. Exige poder ver o canal e gerenciar cargos. */
  async listOverrides(
    actorId: string,
    guildId: string,
    channelId: string,
  ): Promise<ChannelOverride[]> {
    await this.assertCanalDoServidor(guildId, channelId);
    await this.guilds.assertCanViewChannel(actorId, channelId);
    const rows = await this.prisma.channelOverride.findMany({ where: { channelId } });
    return rows.map(toOverrideDTO);
  }

  /** Todas as regras dos canais **visíveis** do servidor — a carga do cliente. */
  async listGuildOverrides(actorId: string, guildId: string): Promise<ChannelOverride[]> {
    await this.guilds.assertMember(actorId, guildId);
    const visiveis = await this.guilds.visibleChannelsForUser(actorId);
    const ids = visiveis.filter((c) => c.guildId === guildId).map((c) => c.id);
    if (ids.length === 0) return [];
    const rows = await this.prisma.channelOverride.findMany({
      where: { channelId: { in: ids } },
    });
    return rows.map(toOverrideDTO);
  }

  /**
   * Grava a regra de um cargo ou de um usuário num canal. `allow`/`deny` com o
   * mesmo bit é resolvido pelo cálculo (allow vence) — não recusamos aqui.
   */
  async setOverride(
    actorId: string,
    guildId: string,
    channelId: string,
    input: { roleId?: string | null; userId?: string | null; allow: number; deny: number },
  ): Promise<ChannelOverride[]> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    await this.assertCanalDoServidor(guildId, channelId);
    const roleId = input.roleId ?? null;
    const userId = input.userId ?? null;
    if ((roleId === null) === (userId === null)) {
      throw new BadRequestException("A regra vale para um cargo ou para um usuário, não os dois");
    }
    // não se concede o que não se tem: senão MANAGE_ROLES viraria ADMINISTRATOR
    const minhas = await this.guilds.permissionsOf(actorId, guildId);
    const mexidas = (input.allow | input.deny) & ALL_PERMISSIONS;
    if (!hasPermission(minhas, mexidas)) {
      throw new ForbiddenException("Você não pode mexer numa permissão que não tem");
    }
    if (roleId) await this.assertPodeMexerNoCargo(actorId, guildId, roleId);
    else await this.guilds.assertMember(userId!, guildId);

    const allow = input.allow & ALL_PERMISSIONS;
    const deny = input.deny & ALL_PERMISSIONS & ~allow;
    if (roleId) {
      await this.prisma.channelOverride.upsert({
        where: { channelId_roleId: { channelId, roleId } },
        create: { channelId, roleId, allow, deny },
        update: { allow, deny },
      });
    } else {
      await this.prisma.channelOverride.upsert({
        where: { channelId_userId: { channelId, userId: userId! } },
        create: { channelId, userId: userId!, allow, deny },
        update: { allow, deny },
      });
    }
    return this.aposMudarOverrides(guildId, channelId);
  }

  async removeOverride(
    actorId: string,
    guildId: string,
    channelId: string,
    targetId: string,
  ): Promise<ChannelOverride[]> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    await this.assertCanalDoServidor(guildId, channelId);
    await this.prisma.channelOverride.deleteMany({
      where: { channelId, OR: [{ roleId: targetId }, { userId: targetId }] },
    });
    return this.aposMudarOverrides(guildId, channelId);
  }

  // ── internas ───────────────────────────────────────────────

  /**
   * Depois de qualquer escrita de override: espelha `private`/`readOnly`,
   * recoloca cada membro nas salas certas e avisa quem enxerga o canal.
   */
  private async aposMudarOverrides(
    guildId: string,
    channelId: string,
  ): Promise<ChannelOverride[]> {
    await this.guilds.syncChannelFlags(channelId);
    const rows = await this.prisma.channelOverride.findMany({ where: { channelId } });
    const overrides = rows.map(toOverrideDTO);
    const membros = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    for (const m of membros) await this.guilds.resyncChannelRooms(guildId, m.userId);
    this.realtime.emitToGuild(guildId, WS_EVENTS.CHANNEL_OVERRIDES, {
      guildId,
      channelId,
      overrides,
    });
    return overrides;
  }

  /** Depois de atribuir/remover cargo: avisa o servidor e reavalia as salas. */
  private async aposMudarCargosDoMembro(guildId: string, userId: string) {
    const roleIds = await this.guilds.roleIdsOf(guildId, userId);
    const member = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { role: true },
    });
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_UPDATED, {
      guildId,
      userId,
      role: member?.role ?? "MEMBER",
      roleIds,
    });
    await this.guilds.resyncChannelRooms(guildId, userId);
    return { userId, roleIds };
  }

  /** Cargo mudou de permissão: quem o tem pode ter ganhado/perdido canais. */
  private async resyncMembrosDoCargo(guildId: string, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return;
    // mexer no @everyone afeta todo mundo; num cargo comum, só quem o tem
    const membros = role.isDefault
      ? await this.prisma.guildMember.findMany({ where: { guildId }, select: { userId: true } })
      : await this.prisma.guildMemberRole.findMany({
          where: { guildId, roleId },
          select: { userId: true },
        });
    for (const m of membros) await this.guilds.resyncChannelRooms(guildId, m.userId);
  }

  /**
   * Hierarquia: o ator só mexe em cargo **estritamente abaixo** do seu mais
   * alto. Sem isso, `MANAGE_ROLES` daria a qualquer um o servidor inteiro.
   */
  private async assertPodeMexerNoCargo(actorId: string, guildId: string, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.guildId !== guildId) throw new NotFoundException("Cargo não encontrado");
    const teto = await this.guilds.rank(guildId, actorId);
    if (role.position >= teto) {
      throw new ForbiddenException("Você não pode mexer num cargo igual ou acima do seu");
    }
    return role;
  }

  /** Não se edita a regra de um canal de outro servidor (nem de uma conversa). */
  private async assertCanalDoServidor(guildId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true },
    });
    if (!channel) throw new NotFoundException("Canal não encontrado");
    if (channel.guildId !== guildId) {
      throw new ForbiddenException("Canal não pertence a este servidor");
    }
  }

  private validarNome(name: string): string {
    const nome = name.trim();
    if (!nome) throw new BadRequestException("Nome do cargo vazio");
    if (nome.length > MAX_ROLE_NAME) {
      throw new BadRequestException(`Nome acima de ${MAX_ROLE_NAME} caracteres`);
    }
    return nome;
  }

  private validarCor(color: string | null | undefined): string | null {
    if (color === undefined || color === null || color === "") return null;
    if (!isRoleColor(color)) throw new BadRequestException("Cor inválida (use #rrggbb)");
    return color.toLowerCase();
  }

  /**
   * Não se concede o que não se tem. Sem isto, quem tem só `MANAGE_ROLES`
   * criaria um cargo com `ADMINISTRATOR` e o vestiria no passo seguinte.
   */
  private async validarPermissoes(
    actorId: string,
    guildId: string,
    permissions: number,
  ): Promise<number> {
    const pedidas = permissions & ALL_PERMISSIONS;
    const minhas = await this.guilds.permissionsOf(actorId, guildId);
    if (!hasPermission(minhas, pedidas)) {
      throw new ForbiddenException("Você não pode conceder uma permissão que não tem");
    }
    return pedidas;
  }
}
