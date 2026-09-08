import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  ADMIN_ROLE_NAME,
  DEFAULT_PERMISSIONS,
  DM_PERMISSIONS,
  EVERYONE_ROLE_NAME,
  MAX_GUILD_DESCRIPTION,
  MAX_GUILD_ICON_SIZE,
  Permission,
  WS_EVENTS,
  computePermissions,
  hasPermission,
  highestPosition,
  isGuildBannerColor,
  overridesEfetivos,
} from "@streamz/shared";
import type {
  ChannelType,
  Guild,
  GuildMemberView,
  GuildWithChannels,
  MemberRole,
  PermissionMember,
  PermissionOverwrite,
  Role,
} from "@streamz/shared";
import { toChannelDTO, toGuildDTO, toPublicUser, toRoleDTO } from "../../common/dto";
import {
  CANAL_TEXTO_INICIAL,
  CANAL_VOZ_INICIAL,
  arrumarCategoriasPadrao,
} from "./categorias-padrao";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RealtimeService } from "../realtime/realtime.service";
import { ReadStateService } from "../read-state/read-state.service";
import { StorageService } from "../storage/storage.service";
import { sniffImage } from "../uploads/media";
import { motivoDeBloqueio } from "../moderation/timeout";

/** O que `assertCanViewChannel` seleciona do canal — o suficiente para decidir. */
export interface ChannelAccessRow {
  id: string;
  guildId: string | null;
  type: ChannelType;
  private: boolean;
  readOnly: boolean;
}

/**
 * Resultado da autorização por canal. União discriminada de propósito: quem
 * chama é obrigado pelo compilador a decidir o que fazer numa conversa direta
 * (`tipo: "dm"`), onde não existe cargo, override nem somente-leitura.
 *
 * `permissions` é a permissão efetiva **naquele canal** (ADR-0002): quem já
 * autorizou não precisa recalcular para uma segunda checagem.
 */
export type ChannelAccess =
  | {
      tipo: "guild";
      channel: ChannelAccessRow;
      member: { role: MemberRole };
      permissions: number;
    }
  | { tipo: "dm"; channel: ChannelAccessRow; permissions: number };

/** O mínimo de um canal para decidir quem o enxerga. */
type ChannelRow = { id: string; guildId: string | null; private: boolean };

/** Cargos de um servidor mais o dono — o contexto de todo cálculo de permissão. */
interface GuildPermissionContext {
  ownerId: string;
  roles: Role[];
}

@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly readState: ReadStateService,
    private readonly storage: StorageService,
    // h-moderacao: kick/ban/unban/papel entram no registro de auditoria
    private readonly audit: AuditService,
  ) {}

  /**
   * Cria o servidor com o dono como membro OWNER, o par de canais iniciais
   * (#geral de texto e Geral de voz) dentro das duas categorias padrão, e os
   * dois cargos que todo servidor tem: `@everyone` (o padrão de quem não tem
   * cargo) e `Administrador` (o destino do atalho `GuildMember.role = ADMIN`).
   *
   * O canal de sistema (onde entra "X entrou no servidor") já nasce apontando
   * para o #geral, como no Discord.
   *
   * Os canais nascem soltos e quem os recolhe é `arrumarCategoriasPadrao` — a
   * **mesma** rotina que conserta servidor antigo. Duas implementações do que é
   * "um servidor recém-criado" acabariam divergindo; uma só, testada uma vez,
   * não tem como.
   */
  async create(ownerId: string, name: string): Promise<GuildWithChannels> {
    const guild = await this.prisma.guild.create({
      data: {
        name,
        ownerId,
        members: { create: { userId: ownerId, role: "OWNER" } },
        channels: {
          create: [
            { name: CANAL_TEXTO_INICIAL, type: "TEXT", position: 0 },
            { name: CANAL_VOZ_INICIAL, type: "VOICE", position: 1 },
          ],
        },
        roles: {
          create: [
            {
              name: EVERYONE_ROLE_NAME,
              position: 0,
              permissions: DEFAULT_PERMISSIONS,
              isDefault: true,
            },
            {
              name: ADMIN_ROLE_NAME,
              position: 1,
              permissions: Permission.ADMINISTRATOR,
              hoist: true,
            },
          ],
        },
      },
    });
    await arrumarCategoriasPadrao(this.prisma, guild.id);
    // relê depois da arrumação: os canais devolvidos ao cliente já saem com o
    // `categoryId` certo, senão a coluna desenharia os dois no bloco do topo
    // até o primeiro refresh
    const channels = await this.prisma.channel.findMany({
      where: { guildId: guild.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    // Canal de sistema: o #geral que acabou de nascer, como no Discord. Sem
    // isto `OnboardingService.announceJoin` sai calado (ele volta cedo quando
    // `systemChannelId` é null) e servidor novo nunca anuncia "X entrou no
    // servidor" — só depois de o dono escolher o canal à mão em Configurações →
    // Visão geral. Continua desligável do mesmo lugar: limpar o campo apaga o
    // anúncio de novo.
    const canalDeSistema = channels.find((c) => c.type === "TEXT");
    if (canalDeSistema) {
      await this.prisma.guild.update({
        where: { id: guild.id },
        data: { systemChannelId: canalDeSistema.id },
      });
    }
    this.realtime.joinGuildRoom(ownerId, guild.id);
    for (const c of channels) this.realtime.joinChannelRooms([ownerId], c.id);
    // as outras sessões da conta (o desktop enquanto o site cria) põem o
    // servidor no rail na hora — `emitToUser` é a sala `user:<id>`
    this.realtime.emitToUser(ownerId, WS_EVENTS.GUILD_JOINED, {
      guild: toGuildDTO(guild),
      reason: "created",
    });
    return { ...toGuildDTO(guild), channels: channels.map((c) => toChannelDTO(c)) };
  }

  /** Servidores em que o usuário é membro, com "há novidade?" e menções. */
  async listForUser(userId: string, username: string): Promise<Guild[]> {
    const guilds = await this.prisma.guild.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
    });
    const visible = await this.visibleChannelsForUser(userId);
    const summaries = await this.readState.summaries(
      userId,
      username,
      visible.map((c) => c.id),
    );
    return guilds.map((g) => {
      const mine = visible
        .filter((c) => c.guildId === g.id)
        .map((c) => summaries.get(c.id))
        .filter((s): s is NonNullable<typeof s> => !!s);
      return toGuildDTO(g, ReadStateService.aggregate(mine));
    });
  }

  async getWithChannels(
    userId: string,
    guildId: string,
    username: string,
  ): Promise<GuildWithChannels> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: { channels: { orderBy: { position: "asc" } } },
    });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    await this.assertMember(userId, guildId);
    const channels = await this.filterVisible(userId, guildId, guild.channels);
    const summaries = await this.readState.summaries(
      userId,
      username,
      channels.map((c) => c.id),
    );
    const dtos = channels.map((c) => toChannelDTO(c, summaries.get(c.id)));
    return {
      ...toGuildDTO(guild, ReadStateService.aggregate(summaries.values())),
      channels: dtos,
    };
  }

  async listMembers(userId: string, guildId: string): Promise<GuildMemberView[]> {
    await this.assertMember(userId, guildId);
    const [members, atribuicoes] = await Promise.all([
      this.prisma.guildMember.findMany({
        where: { guildId },
        include: { user: true },
        orderBy: { joinedAt: "asc" },
      }),
      this.prisma.guildMemberRole.findMany({
        where: { guildId },
        select: { userId: true, roleId: true },
      }),
    ]);
    return members.map((m) => ({
      role: m.role,
      user: toPublicUser(m.user),
      roleIds: atribuicoes.filter((a) => a.userId === m.userId).map((a) => a.roleId),
      // a tabela de membros ordena e mostra "Membro desde" por este campo
      joinedAt: m.joinedAt.toISOString(),
      timeoutUntil: m.timeoutUntil?.toISOString() ?? null,
    }));
  }

  async assertMember(userId: string, guildId: string) {
    const member = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
    });
    if (!member) throw new ForbiddenException("Você não é membro deste servidor");
    return member;
  }

  // ── permissões ─────────────────────────────────────────────

  /** Cargos do servidor, do mais baixo para o mais alto. */
  async listRoles(guildId: string): Promise<Role[]> {
    const roles = await this.prisma.role.findMany({
      where: { guildId },
      orderBy: { position: "asc" },
    });
    return roles.map(toRoleDTO);
  }

  /** Ids dos cargos atribuídos a um membro (sem o @everyone, que é implícito). */
  async roleIdsOf(guildId: string, userId: string): Promise<string[]> {
    const rows = await this.prisma.guildMemberRole.findMany({
      where: { guildId, userId },
      select: { roleId: true },
    });
    return rows.map((r) => r.roleId);
  }

  /** Dono + cargos do servidor: o contexto que todo cálculo de permissão usa. */
  private async permissionContext(guildId: string): Promise<GuildPermissionContext> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { ownerId: true },
    });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    return { ownerId: guild.ownerId, roles: await this.listRoles(guildId) };
  }

  /** Permissão efetiva de um membro no servidor (fora de canal). */
  async permissionsOf(userId: string, guildId: string): Promise<number> {
    const [ctx, roleIds] = await Promise.all([
      this.permissionContext(guildId),
      this.roleIdsOf(guildId, userId),
    ]);
    return computePermissions({ isOwner: ctx.ownerId === userId, roleIds }, ctx.roles);
  }

  /** Permissão efetiva de um membro **dentro de um canal** (aplica os overrides). */
  async permissionsInChannel(
    userId: string,
    guildId: string,
    channelId: string,
  ): Promise<number> {
    const [ctx, roleIds, overrides] = await Promise.all([
      this.permissionContext(guildId),
      this.roleIdsOf(guildId, userId),
      this.regrasDoCanal(channelId),
    ]);
    const member: PermissionMember = { isOwner: ctx.ownerId === userId, roleIds };
    // só o override do próprio usuário interessa; os dos outros são ruído
    const meus = overrides.filter((o) => o.userId === null || o.userId === userId);
    return computePermissions(member, ctx.roles, meus);
  }

  /**
   * O ator precisa ter a permissão pedida no servidor. Substitui o antigo
   * "é OWNER ou ADMIN?" — cada chamador declara **qual** permissão exige.
   */
  async assertCanModerate(actorId: string, guildId: string, permission: number) {
    const actor = await this.assertMember(actorId, guildId);
    const bits = await this.permissionsOf(actorId, guildId);
    if (!hasPermission(bits, permission)) {
      throw new ForbiddenException("Você não tem permissão para isso");
    }
    return actor;
  }

  // ── herança categoria → canal ──────────────────────────────

  /**
   * As regras que valem para cada canal da lista.
   *
   * Um canal **sincronizado** com a categoria (`syncedWithCategory`) não tem
   * regra própria que conte: quem manda é a categoria. A API também copia as
   * regras da categoria para as linhas do canal quando sincroniza, então na
   * prática as duas leituras batem — esta função é a que decide, e existe para
   * que uma cópia atrasada (evento perdido, escrita concorrente) nunca vire
   * "a tela promete uma coisa e a API faz outra".
   *
   * Uma consulta a mais por checagem, de propósito: o `categoryId` e o
   * `syncedWithCategory` não estão em todos os chamadores, e passá-los à mão
   * por seis assinaturas seria seis lugares para esquecer.
   */
  private async regrasPorCanal(
    channelIds: readonly string[],
  ): Promise<Map<string, PermissionOverwrite[]>> {
    const out = new Map<string, PermissionOverwrite[]>();
    if (channelIds.length === 0) return out;
    const canais = await this.prisma.channel.findMany({
      where: { id: { in: [...channelIds] } },
      select: { id: true, categoryId: true, syncedWithCategory: true },
    });
    const herdeiros = canais.filter((c) => c.syncedWithCategory && c.categoryId);
    const proprios = canais.filter((c) => !(c.syncedWithCategory && c.categoryId));
    const categorias = [...new Set(herdeiros.map((c) => c.categoryId as string))];
    const [doCanal, daCategoria] = await Promise.all([
      proprios.length > 0
        ? this.prisma.channelOverride.findMany({
            where: { channelId: { in: proprios.map((c) => c.id) } },
          })
        : Promise.resolve([]),
      categorias.length > 0
        ? this.prisma.categoryOverride.findMany({ where: { categoryId: { in: categorias } } })
        : Promise.resolve([]),
    ]);
    for (const c of canais) {
      out.set(
        c.id,
        overridesEfetivos<PermissionOverwrite>(
          Boolean(c.syncedWithCategory && c.categoryId),
          doCanal.filter((o) => o.channelId === c.id),
          daCategoria.filter((o) => o.categoryId === c.categoryId),
        ) as PermissionOverwrite[],
      );
    }
    return out;
  }

  /** As regras de um canal só (atalho de `regrasPorCanal`). */
  async regrasDoCanal(channelId: string): Promise<PermissionOverwrite[]> {
    return (await this.regrasPorCanal([channelId])).get(channelId) ?? [];
  }

  // ── visibilidade de canais ─────────────────────────────────

  /** Dos canais de um servidor, os que este membro enxerga (VIEW_CHANNEL). */
  private async filterVisible<T extends ChannelRow>(
    userId: string,
    guildId: string,
    channels: T[],
  ): Promise<T[]> {
    if (channels.length === 0) return channels;
    const [ctx, roleIds, regras] = await Promise.all([
      this.permissionContext(guildId),
      this.roleIdsOf(guildId, userId),
      this.regrasPorCanal(channels.map((c) => c.id)),
    ]);
    const member: PermissionMember = { isOwner: ctx.ownerId === userId, roleIds };
    return channels.filter((c) => {
      const meus = (regras.get(c.id) ?? []).filter(
        (o) => o.userId === null || o.userId === userId,
      );
      return hasPermission(
        computePermissions(member, ctx.roles, meus),
        Permission.VIEW_CHANNEL,
      );
    });
  }

  /**
   * Todos os canais que o usuário pode ver, em todos os servidores dele, mais
   * as conversas diretas. É o que o gateway usa para pôr o socket nas salas no
   * connect — e o que alimenta o "não lido" do rail.
   */
  async visibleChannelsForUser(userId: string): Promise<ChannelRow[]> {
    const memberships = await this.prisma.guildMember.findMany({
      where: { userId },
      select: {
        guildId: true,
        guild: { select: { channels: { select: { id: true, guildId: true, private: true } } } },
      },
    });
    const out: ChannelRow[] = [];
    for (const m of memberships) {
      out.push(...(await this.filterVisible(userId, m.guildId, m.guild.channels)));
    }
    const dms = await this.prisma.channel.findMany({
      where: { guildId: null, members: { some: { userId } } },
      select: { id: true, guildId: true, private: true },
    });
    return [...out, ...dms];
  }

  /** Ids dos usuários que enxergam um canal (para emitir eventos de estrutura). */
  async viewersOfChannel(channel: ChannelRow): Promise<string[]> {
    if (!channel.guildId) {
      const members = await this.prisma.channelMember.findMany({
        where: { channelId: channel.id },
        select: { userId: true },
      });
      return members.map((m) => m.userId);
    }
    const guildId = channel.guildId;
    const [ctx, members, atribuicoes, overrides] = await Promise.all([
      this.permissionContext(guildId),
      this.prisma.guildMember.findMany({ where: { guildId }, select: { userId: true } }),
      this.prisma.guildMemberRole.findMany({
        where: { guildId },
        select: { userId: true, roleId: true },
      }),
      this.regrasDoCanal(channel.id),
    ]);
    return members
      .filter((m) => {
        const member: PermissionMember = {
          isOwner: ctx.ownerId === m.userId,
          roleIds: atribuicoes.filter((a) => a.userId === m.userId).map((a) => a.roleId),
        };
        const meus = overrides.filter((o) => o.userId === null || o.userId === m.userId);
        return hasPermission(
          computePermissions(member, ctx.roles, meus),
          Permission.VIEW_CHANNEL,
        );
      })
      .map((m) => m.userId);
  }

  // ── autorização por canal ──────────────────────────────────

  /**
   * Pode ver/entrar no canal. Ponto único de autorização por canal, para
   * servidor e para conversa direta:
   * - canal de servidor: membro do servidor **e** com `VIEW_CHANNEL` na
   *   permissão efetiva daquele canal (cargos + overrides — ADR-0002);
   * - DM/grupo (`guildId` null): ser participante (`ChannelMember`), e ponto —
   *   não há cargo nem override.
   */
  async assertCanViewChannel(userId: string, channelId: string): Promise<ChannelAccess> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, guildId: true, type: true, private: true, readOnly: true },
    });
    if (!channel) throw new NotFoundException("Canal não encontrado");

    if (channel.guildId === null) {
      const participante = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { id: true },
      });
      if (!participante) throw new ForbiddenException("Você não participa desta conversa");
      return { tipo: "dm", channel, permissions: DM_PERMISSIONS };
    }

    const member = await this.assertMember(userId, channel.guildId);
    const permissions = await this.permissionsInChannel(userId, channel.guildId, channelId);
    if (!hasPermission(permissions, Permission.VIEW_CHANNEL)) {
      throw new ForbiddenException("Canal privado");
    }
    return { tipo: "guild", channel, member: { role: member.role }, permissions };
  }

  /**
   * Pode ver a categoria: membro do servidor **e** com `VIEW_CHANNEL` na
   * permissão efetiva calculada sobre as regras **da categoria**.
   *
   * Categoria não é `Channel` — é modelo à parte, sem linha em
   * `ChannelOverride` —, então `assertCanViewChannel` não serve aqui. O sentido
   * é o mesmo, e o alcance é maior: o deny de `VIEW_CHANNEL` na categoria é o
   * que esconde **todos** os canais sincronizados com ela.
   *
   * Não confundir com `listOverrides` da categoria, que é aberto a qualquer
   * membro de propósito (as regras não são segredo — a coluna já as deixa
   * deduzir). Aqui se decide **escrita**, não leitura.
   */
  async assertCanViewCategory(
    actorId: string,
    guildId: string,
    categoryId: string,
  ): Promise<number> {
    await this.assertMember(actorId, guildId);
    const [ctx, roleIds, regras] = await Promise.all([
      this.permissionContext(guildId),
      this.roleIdsOf(guildId, actorId),
      this.prisma.categoryOverride.findMany({ where: { categoryId } }),
    ]);
    const member: PermissionMember = { isOwner: ctx.ownerId === actorId, roleIds };
    // só o override do próprio usuário interessa; os dos outros são ruído
    const meus = regras.filter((o) => o.userId === null || o.userId === actorId);
    const permissions = computePermissions(member, ctx.roles, meus);
    if (!hasPermission(permissions, Permission.VIEW_CHANNEL)) {
      throw new ForbiddenException("Categoria privada");
    }
    return permissions;
  }

  /**
   * Hierarquia: o ator só mexe em cargo **estritamente abaixo** do seu mais
   * alto. Sem isso, `MANAGE_ROLES` seria equivalente a `ADMINISTRATOR` — bastava
   * criar um cargo com tudo ligado e vesti-lo (ADR-0002).
   *
   * Mora aqui, e não no `RolesService`, porque a regra passou a ter dois
   * clientes: cargo/regra de canal (`RolesService`) e regra de categoria
   * (`CategoriesService`). Duas cópias de uma checagem de autorização divergem —
   * é exatamente assim que nasceu a assimetria que este arquivo já corrige entre
   * ler e escrever regra de canal.
   */
  async assertPodeMexerNoCargo(actorId: string, guildId: string, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.guildId !== guildId) throw new NotFoundException("Cargo não encontrado");
    const teto = await this.rank(guildId, actorId);
    if (role.position >= teto) {
      throw new ForbiddenException("Você não pode mexer num cargo igual ou acima do seu");
    }
    return role;
  }

  /**
   * Pode postar: view + `SEND_MESSAGES` na permissão efetiva do canal (é o que
   * "somente-leitura" virou: deny SEND_MESSAGES no @everyone). Em conversa
   * direta basta participar.
   */
  async assertCanPostChannel(userId: string, channelId: string): Promise<ChannelAccess> {
    const access = await this.assertCanViewChannel(userId, channelId);
    if (!hasPermission(access.permissions, Permission.SEND_MESSAGES)) {
      throw new ForbiddenException("Canal somente-leitura");
    }
    return access;
  }

  /**
   * Recusa a escrita de quem está de castigo (h-moderacao). Mora aqui, e não
   * no ModerationService, porque é regra de autorização — e porque
   * Messages → Moderation → DMs → Messages fechava um ciclo de módulos que
   * impedia o Nest de subir.
   */
  async assertNotTimedOut(guildId: string, userId: string): Promise<void> {
    const member = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { timeoutUntil: true },
    });
    const motivo = motivoDeBloqueio(member?.timeoutUntil ?? null);
    if (motivo) throw new ForbiddenException(motivo);
  }

  /** Pode moderar mensagens do canal (apagar as dos outros)? Em DM, ninguém. */
  async canModerateChannel(userId: string, channelId: string): Promise<boolean> {
    const access = await this.assertCanViewChannel(userId, channelId);
    return hasPermission(access.permissions, Permission.MANAGE_MESSAGES);
  }

  // ── sincronia com a categoria ──────────────────────────────

  /**
   * Tira o canal da sincronia com a categoria, **copiando antes** as regras
   * dela para o próprio canal.
   *
   * É o que o Discord faz na primeira edição feita dentro do canal: ele passa a
   * andar sozinho a partir do que herdava, não do vazio — senão editar uma
   * permissão qualquer apagaria em silêncio o "canal privado" que vinha da
   * categoria. Idempotente: canal já dessincronizado, ou sem categoria, sai
   * daqui sem escrever nada.
   *
   * Todo caminho que grava `ChannelOverride` chama isto primeiro. Se algum
   * esquecer, a escrita vira fantasma: a linha existe e o cálculo ignora,
   * porque `regrasPorCanal` continua devolvendo as da categoria.
   */
  async dessincronizarDaCategoria(channelId: string): Promise<void> {
    const canal = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { categoryId: true, syncedWithCategory: true },
    });
    if (!canal?.syncedWithCategory) return;
    if (canal.categoryId) {
      const daCategoria = await this.prisma.categoryOverride.findMany({
        where: { categoryId: canal.categoryId },
      });
      await this.prisma.$transaction([
        this.prisma.channelOverride.deleteMany({ where: { channelId } }),
        ...daCategoria.map((o) =>
          this.prisma.channelOverride.create({
            data: { channelId, roleId: o.roleId, userId: o.userId, allow: o.allow, deny: o.deny },
          }),
        ),
      ]);
    }
    await this.prisma.channel.update({
      where: { id: channelId },
      data: { syncedWithCategory: false },
    });
    await this.syncChannelFlags(channelId);
  }

  /**
   * Põe o canal de volta na sincronia: as regras dele passam a ser, linha por
   * linha, as da categoria. Descarta o que ele tinha de próprio — é o sentido
   * do botão "Sincronizar com a categoria", e o aviso está na tela.
   */
  async sincronizarComACategoria(channelId: string): Promise<void> {
    const canal = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { categoryId: true },
    });
    if (!canal?.categoryId) {
      throw new BadRequestException("Este canal não está em nenhuma categoria");
    }
    const daCategoria = await this.prisma.categoryOverride.findMany({
      where: { categoryId: canal.categoryId },
    });
    await this.prisma.$transaction([
      this.prisma.channelOverride.deleteMany({ where: { channelId } }),
      ...daCategoria.map((o) =>
        this.prisma.channelOverride.create({
          data: { channelId, roleId: o.roleId, userId: o.userId, allow: o.allow, deny: o.deny },
        }),
      ),
      this.prisma.channel.update({
        where: { id: channelId },
        data: { syncedWithCategory: true },
      }),
    ]);
    await this.syncChannelFlags(channelId);
  }

  // ── espelho de private/readOnly ────────────────────────────

  /**
   * `Channel.private` e `Channel.readOnly` são **espelho** do override do
   * @everyone (ADR-0002): a lista de canais desenha cadeado e megafone a partir
   * delas, mas quem autoriza é o override. Uma direção só — override → colunas —
   * senão as duas representações divergem em silêncio.
   */
  async syncChannelFlags(channelId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true },
    });
    if (!channel?.guildId) return;
    const everyone = await this.everyoneRole(channel.guildId);
    const o = await this.prisma.channelOverride.findUnique({
      where: { channelId_roleId: { channelId, roleId: everyone.id } },
    });
    const deny = o?.deny ?? 0;
    await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        private: hasPermission(deny, Permission.VIEW_CHANNEL),
        readOnly: hasPermission(deny, Permission.SEND_MESSAGES),
      },
    });
  }

  /**
   * Caminho inverso, usado só por quem cria/edita canal com os booleanos
   * (`ChannelsService`): traduz `private`/`readOnly` para o override do
   * @everyone, que é a fonte da verdade.
   */
  async applyChannelFlags(
    guildId: string,
    channelId: string,
    flags: { private?: boolean; readOnly?: boolean },
  ): Promise<void> {
    // marcar o canal como privado é editar a permissão dele: sai da sincronia
    await this.dessincronizarDaCategoria(channelId);
    const everyone = await this.everyoneRole(guildId);
    const atual = await this.prisma.channelOverride.findUnique({
      where: { channelId_roleId: { channelId, roleId: everyone.id } },
    });
    let deny = atual?.deny ?? 0;
    if (flags.private !== undefined) {
      deny = flags.private
        ? deny | Permission.VIEW_CHANNEL
        : deny & ~Permission.VIEW_CHANNEL;
    }
    if (flags.readOnly !== undefined) {
      deny = flags.readOnly
        ? deny | Permission.SEND_MESSAGES
        : deny & ~Permission.SEND_MESSAGES;
    }
    await this.prisma.channelOverride.upsert({
      where: { channelId_roleId: { channelId, roleId: everyone.id } },
      create: { channelId, roleId: everyone.id, allow: 0, deny },
      update: { deny },
    });
    await this.syncChannelFlags(channelId);
  }

  /**
   * A allowlist de canal privado, espelhada como override de usuário. Liga o
   * `allow` de VIEW_CHANNEL e desliga o `deny` correspondente, preservando o
   * resto do override — ele pode carregar outras regras daquele canal.
   */
  async grantChannelView(channelId: string, userId: string): Promise<void> {
    await this.dessincronizarDaCategoria(channelId);
    const atual = await this.prisma.channelOverride.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    const allow = (atual?.allow ?? 0) | Permission.VIEW_CHANNEL;
    const deny = (atual?.deny ?? 0) & ~Permission.VIEW_CHANNEL;
    await this.prisma.channelOverride.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, allow, deny },
      update: { allow, deny },
    });
  }

  async revokeChannelView(channelId: string, userId: string): Promise<void> {
    await this.dessincronizarDaCategoria(channelId);
    await this.prisma.channelOverride
      .delete({ where: { channelId_userId: { channelId, userId } } })
      .catch(() => undefined); // idempotente
  }

  /** O @everyone do servidor. Todo servidor tem um — a migração garantiu. */
  async everyoneRole(guildId: string) {
    const role = await this.prisma.role.findFirst({ where: { guildId, isDefault: true } });
    if (!role) throw new NotFoundException("Servidor sem cargo @everyone");
    return role;
  }

  // ── ciclo de vida do servidor ──────────────────────────────

  /** Edita nome, descrição e cor da faixa (MANAGE_GUILD). */
  async update(
    actorId: string,
    guildId: string,
    patch: { name?: string; description?: string | null; bannerColor?: string | null },
  ): Promise<Guild> {
    await this.assertCanModerate(actorId, guildId, Permission.MANAGE_GUILD);
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) throw new BadRequestException("Nome vazio");
    const description =
      patch.description === undefined ? undefined : patch.description?.trim() || null;
    if (description && description.length > MAX_GUILD_DESCRIPTION) {
      throw new BadRequestException(`Descrição acima de ${MAX_GUILD_DESCRIPTION} caracteres`);
    }
    // string vazia = apagar a faixa; qualquer outra coisa tem que ser #rrggbb,
    // porque o valor vai direto para `style` no cliente
    const bannerColor =
      patch.bannerColor === undefined
        ? undefined
        : ((patch.bannerColor ?? "").trim().toLowerCase() || null);
    if (bannerColor && !isGuildBannerColor(bannerColor)) {
      throw new BadRequestException("Cor da faixa inválida (use #rrggbb)");
    }
    const guild = await this.prisma.guild.update({
      where: { id: guildId },
      data: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(bannerColor !== undefined ? { bannerColor } : {}),
      },
    });
    const dto = toGuildDTO(guild);
    this.realtime.emitToGuild(guildId, WS_EVENTS.GUILD_UPDATED, dto);
    return dto;
  }

  /** Ícone do servidor: imagem validada por bytes, guardada no storage. */
  async updateIcon(
    actorId: string,
    guildId: string,
    file: { buffer: Buffer; size: number },
  ): Promise<Guild> {
    await this.assertCanModerate(actorId, guildId, Permission.MANAGE_GUILD);
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        "Armazenamento (R2) não configurado. Ver PENDENCIAS.md.",
      );
    }
    if (!file?.buffer?.length) throw new BadRequestException("Arquivo vazio");
    if (file.size > MAX_GUILD_ICON_SIZE) {
      throw new PayloadTooLargeException(
        `Ícone acima de ${MAX_GUILD_ICON_SIZE / 1024 / 1024} MB`,
      );
    }
    const image = sniffImage(file.buffer);
    if (!image) {
      throw new BadRequestException("O ícone precisa ser uma imagem (PNG, JPEG, GIF ou WebP)");
    }

    const key = `guild-icons/${guildId}/${randomUUID()}`;
    await this.storage.put(key, file.buffer, image.mime);
    const antes = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { iconKey: true },
    });
    const guild = await this.prisma.guild.update({
      where: { id: guildId },
      data: { iconKey: key, iconUrl: this.iconUrl(guildId, key) },
    });
    if (antes?.iconKey) await this.storage.delete(antes.iconKey);

    const dto = toGuildDTO(guild);
    this.realtime.emitToGuild(guildId, WS_EVENTS.GUILD_UPDATED, dto);
    return dto;
  }

  /**
   * Remove o ícone (o rail volta para a sigla). MANAGE_GUILD, como a troca.
   *
   * A URL zera junto com a chave: ela é derivada da chave, e deixá-la faria o
   * `<img>` de todo mundo apontar para um proxy que agora responde 404. O
   * arquivo sai do storage depois de o banco já não o referenciar, na mesma
   * ordem da troca — se apagar falhar, sobra um objeto órfão, não um ícone
   * quebrado.
   */
  async removeIcon(actorId: string, guildId: string): Promise<Guild> {
    await this.assertCanModerate(actorId, guildId, Permission.MANAGE_GUILD);
    const antes = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { iconKey: true },
    });
    const guild = await this.prisma.guild.update({
      where: { id: guildId },
      data: { iconKey: null, iconUrl: null },
    });
    if (antes?.iconKey) await this.storage.delete(antes.iconKey);

    const dto = toGuildDTO(guild);
    this.realtime.emitToGuild(guildId, WS_EVENTS.GUILD_UPDATED, dto);
    return dto;
  }

  /** Corpo + content-type do ícone para o proxy público (GET /guilds/:id/icon). */
  async iconStream(guildId: string): Promise<{ body: Readable; contentType: string }> {
    const g = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { iconKey: true },
    });
    if (!g?.iconKey) throw new NotFoundException("Sem ícone");
    // o content-type real foi validado no upload; o proxy sempre serve imagem
    return { body: await this.storage.get(g.iconKey), contentType: "image/*" };
  }

  /**
   * O ícone é público (como o avatar): `<img src>` não manda token. A versão na
   * query faz o cache do browser trocar quando o ícone muda.
   */
  private iconUrl(guildId: string, key: string): string {
    const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(/\/+$/, "");
    const v = key.split("/").pop() ?? "";
    return `${api}/api/guilds/${guildId}/icon?v=${v}`;
  }

  /**
   * Passa a posse a outro membro. Só o dono; o antigo dono vira ADMIN (e ganha
   * o cargo Administrador) para não perder o servidor que acabou de entregar.
   */
  async transferOwnership(actorId: string, guildId: string, targetUserId: string) {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    if (guild.ownerId !== actorId) throw new ForbiddenException("Só o dono transfere a posse");
    if (targetUserId === actorId) {
      throw new BadRequestException("Você já é o dono deste servidor");
    }
    const target = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: targetUserId, guildId } },
    });
    if (!target) throw new NotFoundException("Membro não encontrado");

    const admin = await this.adminRole(guildId);
    await this.prisma.$transaction([
      this.prisma.guild.update({ where: { id: guildId }, data: { ownerId: targetUserId } }),
      this.prisma.guildMember.update({
        where: { userId_guildId: { userId: targetUserId, guildId } },
        data: { role: "OWNER" },
      }),
      this.prisma.guildMember.update({
        where: { userId_guildId: { userId: actorId, guildId } },
        data: { role: "ADMIN" },
      }),
      this.prisma.guildMemberRole.upsert({
        where: { userId_roleId: { userId: actorId, roleId: admin.id } },
        create: { guildId, userId: actorId, roleId: admin.id },
        update: {},
      }),
    ]);

    this.realtime.emitToGuild(guildId, WS_EVENTS.GUILD_OWNER_CHANGED, {
      guildId,
      ownerId: targetUserId,
      previousOwnerId: actorId,
    });
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_UPDATED, {
      guildId,
      userId: targetUserId,
      role: "OWNER" satisfies MemberRole,
      roleIds: await this.roleIdsOf(guildId, targetUserId),
    });
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_UPDATED, {
      guildId,
      userId: actorId,
      role: "ADMIN" satisfies MemberRole,
      roleIds: await this.roleIdsOf(guildId, actorId),
    });
    return { guildId, ownerId: targetUserId };
  }

  /** Sai do servidor. O dono não sai: transfere a posse antes, ou apaga. */
  async leave(userId: string, guildId: string) {
    const member = await this.assertMember(userId, guildId);
    if (member.role === "OWNER") {
      throw new BadRequestException(
        "O dono não pode sair — transfira a posse ou apague o servidor",
      );
    }
    await this.prisma.guildMember.delete({ where: { userId_guildId: { userId, guildId } } });
    await this.prisma.guildMemberRole.deleteMany({ where: { guildId, userId } });
    await this.detachFromGuildRooms(guildId, userId);
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_LEFT, { guildId, userId });
    // outras abas do próprio usuário também precisam ver o servidor sumir
    this.realtime.emitToUser(userId, WS_EVENTS.GUILD_REMOVED, { guildId, reason: "left" });
    return { left: guildId };
  }

  /** Apaga o servidor (só o dono). Canais, mensagens e convites vão em cascata. */
  async remove(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    if (guild.ownerId !== userId) throw new ForbiddenException("Só o dono apaga o servidor");
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    await this.prisma.guild.delete({ where: { id: guildId } });
    if (guild.iconKey) await this.storage.delete(guild.iconKey);
    const ids = members.map((m) => m.userId);
    this.realtime.emitToUsers(ids, WS_EVENTS.GUILD_REMOVED, { guildId, reason: "deleted" });
    for (const id of ids) this.realtime.leaveGuildRoom(id, guildId);
    return { deleted: guildId };
  }

  /**
   * Promove a ADMIN ou rebaixa a MEMBER. Só o dono; o dono não muda de papel.
   *
   * O papel é atalho para o **cargo** Administrador (ADR-0002): as duas
   * representações são escritas juntas, aqui e em lugar nenhum mais.
   */
  async setRole(actorId: string, guildId: string, targetUserId: string, role: MemberRole) {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    if (guild.ownerId !== actorId) throw new ForbiddenException("Só o dono altera papéis");
    if (role === "OWNER" || targetUserId === actorId) {
      throw new BadRequestException("Use a transferência de posse para trocar o dono");
    }
    const target = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: targetUserId, guildId } },
    });
    if (!target) throw new NotFoundException("Membro não encontrado");

    const admin = await this.adminRole(guildId);
    await this.prisma.guildMember.update({
      where: { userId_guildId: { userId: targetUserId, guildId } },
      data: { role },
    });
    if (role === "ADMIN") {
      await this.prisma.guildMemberRole.upsert({
        where: { userId_roleId: { userId: targetUserId, roleId: admin.id } },
        create: { guildId, userId: targetUserId, roleId: admin.id },
        update: {},
      });
    } else {
      await this.prisma.guildMemberRole.deleteMany({
        where: { guildId, userId: targetUserId, roleId: admin.id },
      });
    }

    await this.audit.log({
      guildId,
      actorId,
      action: "MEMBER_ROLE_UPDATE",
      targetId: targetUserId,
      targetType: "USER",
      targetName: await this.usernameOf(targetUserId),
      changes: [{ field: "role", before: target.role, after: role }],
    });

    const roleIds = await this.roleIdsOf(guildId, targetUserId);
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_UPDATED, {
      guildId,
      userId: targetUserId,
      role,
      roleIds,
    });
    await this.resyncChannelRooms(guildId, targetUserId);
    return { userId: targetUserId, role };
  }

  /**
   * Reavalia em quais salas de canal o usuário deve estar neste servidor.
   * Chamado sempre que a permissão dele muda (cargo, override, papel): sem
   * isso, quem perdeu VIEW_CHANNEL seguiria recebendo mensagens ao vivo, e
   * quem ganhou só veria o canal depois de recarregar a página.
   */
  async resyncChannelRooms(guildId: string, userId: string): Promise<void> {
    const todos = await this.prisma.channel.findMany({
      where: { guildId },
      select: { id: true, guildId: true, private: true },
    });
    const visiveis = await this.filterVisible(userId, guildId, todos);
    const visiveisSet = new Set(visiveis.map((c) => c.id));
    for (const c of visiveis) this.realtime.joinChannelRooms([userId], c.id);
    this.realtime.leaveChannelRooms(
      userId,
      todos.filter((c) => !visiveisSet.has(c.id)).map((c) => c.id),
    );
  }

  /** O cargo "Administrador" do servidor — o destino do papel ADMIN. */
  private async adminRole(guildId: string) {
    const existente = await this.prisma.role.findFirst({
      where: { guildId, name: ADMIN_ROLE_NAME, isDefault: false },
      orderBy: { position: "desc" },
    });
    if (existente) return existente;
    // servidor antigo sem o cargo (ou alguém o apagou): recria em cima da pilha
    const maior = await this.prisma.role.aggregate({
      where: { guildId },
      _max: { position: true },
    });
    return this.prisma.role.create({
      data: {
        guildId,
        name: ADMIN_ROLE_NAME,
        position: (maior._max.position ?? 0) + 1,
        permissions: Permission.ADMINISTRATOR,
        hoist: true,
      },
    });
  }

  // ── moderação ──────────────────────────────────────────────
  async isBanned(guildId: string, userId: string): Promise<boolean> {
    const ban = await this.prisma.ban.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    return !!ban;
  }

  /** Expulsa um membro (pode voltar por convite). */
  async kick(actorId: string, guildId: string, targetUserId: string, reason?: string) {
    await this.assertCanActOn(actorId, guildId, targetUserId, Permission.KICK_MEMBERS);
    await this.prisma.guildMember.delete({
      where: { userId_guildId: { userId: targetUserId, guildId } },
    });
    await this.prisma.guildMemberRole.deleteMany({ where: { guildId, userId: targetUserId } });
    await this.audit.log({
      guildId,
      actorId,
      action: "MEMBER_KICK",
      targetId: targetUserId,
      targetType: "USER",
      targetName: await this.usernameOf(targetUserId),
      reason,
    });
    await this.detachFromGuildRooms(guildId, targetUserId);
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_LEFT, { guildId, userId: targetUserId });
    this.realtime.emitToUser(targetUserId, WS_EVENTS.GUILD_REMOVED, {
      guildId,
      reason: "kicked",
    });
    return { kicked: targetUserId };
  }

  /** Bane um membro: remove e bloqueia reentrada. */
  async ban(actorId: string, guildId: string, targetUserId: string, reason?: string) {
    await this.assertCanActOn(actorId, guildId, targetUserId, Permission.BAN_MEMBERS);
    await this.prisma.$transaction([
      this.prisma.guildMemberRole.deleteMany({ where: { guildId, userId: targetUserId } }),
      this.prisma.guildMember.deleteMany({
        where: { userId: targetUserId, guildId },
      }),
      this.prisma.ban.upsert({
        where: { guildId_userId: { guildId, userId: targetUserId } },
        create: { guildId, userId: targetUserId, bannedById: actorId, reason },
        update: { reason, bannedById: actorId },
      }),
    ]);
    await this.audit.log({
      guildId,
      actorId,
      action: "MEMBER_BAN",
      targetId: targetUserId,
      targetType: "USER",
      targetName: await this.usernameOf(targetUserId),
      reason,
    });
    await this.detachFromGuildRooms(guildId, targetUserId);
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_LEFT, { guildId, userId: targetUserId });
    this.realtime.emitToUser(targetUserId, WS_EVENTS.GUILD_REMOVED, {
      guildId,
      reason: "banned",
    });
    return { banned: targetUserId };
  }

  async unban(actorId: string, guildId: string, targetUserId: string) {
    await this.assertCanModerate(actorId, guildId, Permission.BAN_MEMBERS);
    await this.prisma.ban
      .delete({ where: { guildId_userId: { guildId, userId: targetUserId } } })
      .catch(() => undefined);
    await this.audit.log({
      guildId,
      actorId,
      action: "MEMBER_UNBAN",
      targetId: targetUserId,
      targetType: "USER",
      targetName: await this.usernameOf(targetUserId),
    });
    return { unbanned: targetUserId };
  }

  /** Nome de usuário para o registro de auditoria (o alvo pode sumir depois). */
  private async usernameOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    return u?.username ?? null;
  }

  async listBans(actorId: string, guildId: string) {
    await this.assertCanModerate(actorId, guildId, Permission.BAN_MEMBERS);
    const bans = await this.prisma.ban.findMany({
      where: { guildId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
    return bans.map((b) => ({
      reason: b.reason,
      createdAt: b.createdAt.toISOString(),
      user: toPublicUser(b.user),
    }));
  }

  /** Tira os sockets do ex-membro das salas do servidor e de todos os canais dele. */
  private async detachFromGuildRooms(guildId: string, userId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { guildId },
      select: { id: true },
    });
    this.realtime.leaveChannelRooms(userId, channels.map((c) => c.id));
    this.realtime.leaveGuildRoom(userId, guildId);
  }

  /**
   * Valida a permissão **e** a hierarquia: o ator só age sobre quem está
   * estritamente abaixo dele. Sem a segunda metade, `KICK_MEMBERS` deixaria um
   * moderador expulsar outro moderador — ou o dono.
   */
  private async assertCanActOn(
    actorId: string,
    guildId: string,
    targetUserId: string,
    permission: number,
  ) {
    if (actorId === targetUserId) {
      throw new ForbiddenException("Você não pode moderar a si mesmo");
    }
    const actor = await this.assertCanModerate(actorId, guildId, permission);
    const target = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: targetUserId, guildId } },
    });
    if (!target) throw new NotFoundException("Membro não encontrado");
    if ((await this.rank(guildId, actorId)) <= (await this.rank(guildId, targetUserId))) {
      throw new ForbiddenException("Você não pode moderar alguém de cargo igual ou superior");
    }
    return { actor, target };
  }

  /**
   * Altura de um membro na hierarquia: o dono acima de todos, senão a posição
   * do seu cargo mais alto. É o que compara "quem pode mexer em quem".
   */
  async rank(guildId: string, userId: string): Promise<number> {
    const ctx = await this.permissionContext(guildId);
    const roleIds = await this.roleIdsOf(guildId, userId);
    return highestPosition({ isOwner: ctx.ownerId === userId, roleIds }, ctx.roles);
  }
}
