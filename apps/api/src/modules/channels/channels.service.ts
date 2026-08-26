import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MAX_SLOWMODE_SECONDS, Permission, WS_EVENTS, slowmodeRemaining } from "@newdisc/shared";
import type {
  Category,
  Channel,
  ChannelPosition,
  GuildChannelType,
  MemberRole,
  ReorderPayload,
} from "@newdisc/shared";
import { toChannelDTO, toPublicUser } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CategoriesService } from "./categories.service";

interface CreateChannelOpts {
  isPrivate?: boolean;
  readOnly?: boolean;
  /** membros (papel MEMBER) liberados de início num canal privado. */
  memberIds?: string[];
  /** categoria em que o canal nasce (null/ausente = sem categoria). */
  categoryId?: string | null;
}

/** Campos editáveis de um canal pelo modal de configurações. */
export interface UpdateChannelPatch {
  name?: string;
  readOnly?: boolean;
  topic?: string | null;
  slowmodeSeconds?: number;
  nsfw?: boolean;
  isPrivate?: boolean;
  categoryId?: string | null;
}

/** O mínimo de um canal para recalcular quem o enxerga. */
type ViewerRow = { id: string; guildId: string | null; private: boolean };

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
    private readonly categories: CategoriesService,
  ) {}

  async create(
    userId: string,
    guildId: string,
    name: string,
    type: GuildChannelType,
    opts: CreateChannelOpts = {},
  ): Promise<Channel> {
    const isPrivate = !!opts.isPrivate;
    const readOnly = !!opts.readOnly;

    // criar canal privado/somente-leitura exige moderação; canal comum, só ser membro
    if (isPrivate || readOnly || type === "ANNOUNCEMENT") {
      await this.guilds.assertCanModerate(userId, guildId, Permission.MANAGE_CHANNELS);
    } else {
      await this.guilds.assertMember(userId, guildId);
    }

    // canal de anúncios é canal de texto em que só a moderação posta
    const somenteLeitura = readOnly || type === "ANNOUNCEMENT";
    const categoryId = await this.resolveCategory(guildId, opts.categoryId);
    // a posição é relativa à categoria: cada bloco da barra lateral tem a sua
    const count = await this.prisma.channel.count({ where: { guildId, categoryId } });
    const channel = await this.prisma.channel.create({
      data: {
        guildId,
        name,
        type,
        position: count,
        private: isPrivate,
        readOnly: somenteLeitura,
        categoryId,
      },
    });

    // `private`/`readOnly` são espelho: quem autoriza é o override do @everyone
    if (isPrivate || readOnly) {
      await this.guilds.applyChannelFlags(guildId, channel.id, { private: isPrivate, readOnly });
    }
    if (isPrivate && opts.memberIds?.length) {
      await this.grantAccess(guildId, channel.id, opts.memberIds);
    }
    const dto = toChannelDTO(channel);
    // quem enxerga o canal entra na sala agora e vê o canal aparecer na lista
    const viewers = await this.guilds.viewersOfChannel(channel);
    this.realtime.joinChannelRooms(viewers, channel.id);
    this.realtime.emitToUsers(viewers, WS_EVENTS.CHANNEL_CREATED, dto);
    return dto;
  }

  async listForGuild(userId: string, guildId: string): Promise<Channel[]> {
    await this.guilds.assertMember(userId, guildId);
    const channels = await this.prisma.channel.findMany({
      where: { guildId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    // quem enxerga o quê é `VIEW_CHANNEL` na permissão do canal (ADR-0002)
    const visiveis = await this.guilds.visibleChannelsForUser(userId);
    const podeVer = new Set(visiveis.map((c) => c.id));
    return channels.filter((c) => podeVer.has(c.id)).map((c) => toChannelDTO(c));
  }

  /**
   * Configurações do canal: nome, tópico, modo lento, NSFW, somente-leitura,
   * privacidade e categoria. Só moderação.
   *
   * Mudar `private` muda *quem enxerga* o canal, então o resultado não é um
   * `channel.updated` para todos: quem perdeu acesso recebe `channel.deleted` e
   * sai da sala; quem ganhou recebe `channel.created` e entra (ver
   * `emitChannelChange`).
   */
  async update(
    actorId: string,
    guildId: string,
    channelId: string,
    patch: UpdateChannelPatch,
  ): Promise<Channel> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    const antes = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!antes) throw new NotFoundException("Canal não encontrado");

    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) throw new BadRequestException("Nome vazio");
    if (patch.slowmodeSeconds !== undefined) {
      const segundos = patch.slowmodeSeconds;
      if (!Number.isInteger(segundos) || segundos < 0 || segundos > MAX_SLOWMODE_SECONDS) {
        throw new BadRequestException(`Modo lento deve ficar entre 0 e ${MAX_SLOWMODE_SECONDS}s`);
      }
    }
    const topic = patch.topic === undefined ? undefined : patch.topic?.trim() || null;
    const categoryId =
      patch.categoryId === undefined
        ? undefined
        : await this.resolveCategory(guildId, patch.categoryId);

    const channel = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(name ? { name } : {}),
        ...(patch.readOnly !== undefined ? { readOnly: patch.readOnly } : {}),
        ...(topic !== undefined ? { topic } : {}),
        ...(patch.slowmodeSeconds !== undefined
          ? { slowmodeSeconds: patch.slowmodeSeconds }
          : {}),
        ...(patch.nsfw !== undefined ? { nsfw: patch.nsfw } : {}),
        ...(patch.isPrivate !== undefined ? { private: patch.isPrivate } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
      },
    });
    // somente-leitura é deny SEND_MESSAGES no @everyone; o booleano é espelho
    if (patch.readOnly !== undefined) {
      await this.guilds.applyChannelFlags(guildId, channelId, { readOnly: patch.readOnly });
    }
    const dto = toChannelDTO(channel);
    await this.emitChannelChange(antes, channel, dto);
    return dto;
  }

  /**
   * Reordena canais (entre e dentro de categorias) e categorias, em lote.
   *
   * Um arrastar-e-soltar mexe em vários itens de uma vez; mandar um PATCH por
   * canal deixaria a barra lateral em ordem inconsistente no meio do caminho.
   */
  async reorder(
    actorId: string,
    guildId: string,
    payload: ReorderPayload,
  ): Promise<{ channels: Channel[]; categories: Category[] }> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    const pedidos = payload.channels ?? [];

    const doServidor = await this.prisma.channel.findMany({
      where: { guildId, id: { in: pedidos.map((p) => p.id) } },
      select: { id: true },
    });
    const conhecidos = new Set(doServidor.map((c) => c.id));
    const categorias = await this.categories.idsOfGuild(guildId);
    // ignora id de outro servidor em vez de derrubar o lote inteiro: a lista
    // vem da tela, que pode estar um pouco atrás do servidor
    const alvo: ChannelPosition[] = pedidos.filter(
      (p) => conhecidos.has(p.id) && (p.categoryId === null || categorias.has(p.categoryId)),
    );

    if (alvo.length > 0) {
      await this.prisma.$transaction(
        alvo.map((p) =>
          this.prisma.channel.update({
            where: { id: p.id },
            data: { position: p.position, categoryId: p.categoryId },
          }),
        ),
      );
    }

    const atualizados = await this.prisma.channel.findMany({
      where: { id: { in: alvo.map((p) => p.id) } },
    });
    const dtos: Channel[] = [];
    for (const canal of atualizados) {
      const dto = toChannelDTO(canal);
      dtos.push(dto);
      this.realtime.emitToUsers(
        await this.guilds.viewersOfChannel(canal),
        WS_EVENTS.CHANNEL_UPDATED,
        dto,
      );
    }
    const cats = await this.categories.applyPositions(guildId, payload.categories ?? []);
    return { channels: dtos, categories: cats };
  }

  /**
   * Modo lento: recusa a mensagem enquanto a última do mesmo autor no canal for
   * mais nova que o intervalo. Moderação é isenta, como no Discord.
   *
   * Mora aqui (e não no `MessagesService`) porque a regra é do canal — quem
   * envia só precisa chamar antes de gravar.
   */
  async assertSlowmode(channelId: string, authorId: string, role: MemberRole): Promise<void> {
    if (role === "OWNER" || role === "ADMIN") return;
    const canal = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { slowmodeSeconds: true },
    });
    const intervalo = canal?.slowmodeSeconds ?? 0;
    if (intervalo <= 0) return;
    const ultima = await this.prisma.message.findFirst({
      where: { channelId, authorId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const restante = slowmodeRemaining(intervalo, ultima?.createdAt ?? null);
    if (restante > 0) {
      throw new HttpException(
        { message: `Modo lento: aguarde ${restante}s`, retryAfter: restante },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Apaga o canal e suas mensagens. Só moderação; o último canal de texto fica. */
  async remove(actorId: string, guildId: string, channelId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException("Canal não encontrado");
    if (channel.type === "TEXT" || channel.type === "ANNOUNCEMENT") {
      const restantes = await this.prisma.channel.count({
        where: { guildId, type: { in: ["TEXT", "ANNOUNCEMENT"] } },
      });
      if (restantes <= 1) throw new BadRequestException("O servidor precisa de ao menos um canal de texto");
    }
    const viewers = await this.guilds.viewersOfChannel(channel);
    await this.prisma.channel.delete({ where: { id: channelId } });
    this.realtime.emitToUsers(viewers, WS_EVENTS.CHANNEL_DELETED, { channelId, guildId });
    this.realtime.closeChannelRoom(channelId);
    return { deleted: channelId };
  }

  // ── allowlist de canal privado (só moderação) ──────────────────

  async listMembers(actorId: string, guildId: string, channelId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    const rows = await this.prisma.channelMember.findMany({
      where: { channelId },
      include: { user: true },
    });
    return rows.map((r) => ({ user: toPublicUser(r.user) }));
  }

  async addMember(actorId: string, guildId: string, channelId: string, targetUserId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    await this.grantAccess(guildId, channelId, [targetUserId]);
    return { added: targetUserId };
  }

  async removeMember(actorId: string, guildId: string, channelId: string, targetUserId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_CHANNELS);
    await this.assertChannelInGuild(channelId, guildId);
    await this.prisma.channelMember
      .delete({ where: { channelId_userId: { channelId, userId: targetUserId } } })
      .catch(() => undefined); // idempotente
    // a allowlist é espelhada em override de usuário — as duas saem juntas
    await this.guilds.revokeChannelView(channelId, targetUserId);
    // corta a sala ao vivo: sem isso ele seguiria recebendo o canal privado
    this.realtime.leaveChannelRooms(targetUserId, [channelId]);
    this.realtime.emitToUser(targetUserId, WS_EVENTS.CHANNEL_DELETED, { channelId, guildId });
    return { removed: targetUserId };
  }

  /** Libera acesso apenas a quem é membro do servidor (ignora ids inválidos). */
  private async grantAccess(guildId: string, channelId: string, userIds: string[]) {
    const ids = Array.from(new Set(userIds));
    const members = await this.prisma.guildMember.findMany({
      where: { guildId, userId: { in: ids } },
      select: { userId: true },
    });
    await this.prisma.$transaction(
      members.map((m) =>
        this.prisma.channelMember.upsert({
          where: { channelId_userId: { channelId, userId: m.userId } },
          create: { channelId, userId: m.userId },
          update: {},
        }),
      ),
    );
    // a allowlist é espelhada em override de usuário (allow VIEW_CHANNEL)
    for (const m of members) await this.guilds.grantChannelView(channelId, m.userId);
    // quem acabou de ganhar acesso passa a ver o canal e a receber ao vivo
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (channel) {
      const ids2 = members.map((m) => m.userId);
      this.realtime.joinChannelRooms(ids2, channelId);
      this.realtime.emitToUsers(ids2, WS_EVENTS.CHANNEL_CREATED, toChannelDTO(channel));
    }
  }

  /** Valida que a categoria (quando informada) é deste servidor. */
  private async resolveCategory(
    guildId: string,
    categoryId: string | null | undefined,
  ): Promise<string | null> {
    if (!categoryId) return null;
    const ids = await this.categories.idsOfGuild(guildId);
    if (!ids.has(categoryId)) {
      throw new BadRequestException("Categoria não pertence a este servidor");
    }
    return categoryId;
  }

  /**
   * Emite a mudança de um canal respeitando quem passou a (ou deixou de)
   * enxergá-lo. Sem isto, tornar um canal privado deixaria os sockets antigos
   * na sala `channel:<id>` recebendo mensagens até recarregar a página.
   */
  private async emitChannelChange(antes: ViewerRow, depois: ViewerRow, dto: Channel) {
    const [antigos, novos] = await Promise.all([
      this.guilds.viewersOfChannel(antes),
      this.guilds.viewersOfChannel(depois),
    ]);
    const novoSet = new Set(novos);
    const antigoSet = new Set(antigos);
    const perderam = antigos.filter((id) => !novoSet.has(id));
    const ganharam = novos.filter((id) => !antigoSet.has(id));
    const mantiveram = novos.filter((id) => antigoSet.has(id));

    if (mantiveram.length) this.realtime.emitToUsers(mantiveram, WS_EVENTS.CHANNEL_UPDATED, dto);
    if (ganharam.length) {
      this.realtime.joinChannelRooms(ganharam, dto.id);
      this.realtime.emitToUsers(ganharam, WS_EVENTS.CHANNEL_CREATED, dto);
    }
    for (const id of perderam) {
      this.realtime.leaveChannelRooms(id, [dto.id]);
      this.realtime.emitToUser(id, WS_EVENTS.CHANNEL_DELETED, {
        channelId: dto.id,
        guildId: dto.guildId,
      });
    }
  }

  private async assertChannelInGuild(channelId: string, guildId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true },
    });
    if (!channel) throw new NotFoundException("Canal não encontrado");
    if (channel.guildId !== guildId) {
      throw new ForbiddenException("Canal não pertence a este servidor");
    }
  }
}
