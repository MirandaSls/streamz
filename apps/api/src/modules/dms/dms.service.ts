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
  MAX_DM_GROUP_INVITEES,
  MAX_DM_GROUP_NAME,
  MAX_GROUP_ICON_SIZE,
  WS_EVENTS,
} from "@streamz/shared";
import type {
  DMChannelView,
  DMLeaveResult,
  MessageType,
  PublicUser,
} from "@streamz/shared";
import {
  toChannelDTO,
  toPublicUser,
  type ChannelReadSummary,
  type PublicUserRow,
} from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { ReadStateService } from "../read-state/read-state.service";
import { FriendsService } from "../friends/friends.service";
import { MessagesService } from "../messages/messages.service";
import { StorageService } from "../storage/storage.service";
import { sniffImage } from "../uploads/media";

/**
 * Conversas diretas (DM 1-a-1 e grupos).
 *
 * Desde a ADR-0001 uma conversa é um `Channel` sem servidor (`guildId` null,
 * `type` DM|GROUP) e os participantes são `ChannelMember`. Este service só cuida
 * do que é específico de conversa — abrir, criar grupo, listar, sair. Mensagens,
 * histórico, busca, reação, anexo e thread são os de qualquer canal
 * (`MessagesService`), e a autorização é `GuildsService.assertCanViewChannel`.
 */

type MemberWithUser = { userId: string; user: PublicUserRow };

const WITH_MEMBERS = {
  members: { include: { user: true } },
} as const;

@Injectable()
export class DMsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly readState: ReadStateService,
    private readonly friends: FriendsService,
    private readonly messages: MessagesService,
    private readonly storage: StorageService,
  ) {}

  /** Abre (ou reaproveita) a conversa 1-a-1 entre dois usuários. */
  async openWith(meId: string, otherUserId: string): Promise<DMChannelView> {
    if (meId === otherUserId) {
      throw new BadRequestException("Não é possível abrir DM consigo mesmo");
    }
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException("Usuário não encontrado");
    // bloqueado (nos dois sentidos) não abre conversa — ver FriendsService
    await this.friends.assertNotBlocked(meId, otherUserId);

    // upsert por pairKey → idempotente e à prova de corrida (1 canal por dupla)
    const [a, b] = this.pair(meId, otherUserId);
    const pairKey = `${a}:${b}`;
    const channel = await this.prisma.channel.upsert({
      where: { pairKey },
      create: {
        type: "DM",
        pairKey,
        members: { create: [{ userId: a }, { userId: b }] },
      },
      update: {},
      include: WITH_MEMBERS,
    });
    // quem já está conectado passa a receber a conversa ao vivo na hora
    this.realtime.joinChannelRooms([a, b], channel.id);
    // reabrir manualmente desfaz o "fechar conversa" de quem abriu
    await this.prisma.dMHidden
      .delete({ where: { userId_channelId: { userId: meId, channelId: channel.id } } })
      .catch(() => undefined);
    return this.toView(channel, meId);
  }

  /** Cria um grupo (3+ participantes, contando o criador). */
  async createGroup(meId: string, userIds: string[], name?: string): Promise<DMChannelView> {
    const ids = Array.from(new Set([meId, ...userIds]));
    if (ids.length < 3) {
      throw new BadRequestException("Um grupo precisa de ao menos 3 participantes");
    }
    const found = await this.prisma.user.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new NotFoundException("Algum participante não existe");
    // bloqueio vale no grupo: convidar quem me bloqueou (ou quem eu bloqueei)
    // seria a porta dos fundos do DM barrado
    for (const id of ids) {
      if (id !== meId) await this.friends.assertNotBlocked(meId, id);
    }

    const channel = await this.prisma.channel.create({
      data: {
        type: "GROUP",
        name: name?.trim() || null,
        ownerId: meId,
        members: { create: ids.map((userId) => ({ userId })) },
      },
      include: WITH_MEMBERS,
    });
    this.realtime.joinChannelRooms(ids, channel.id);
    return this.toView(channel, meId);
  }

  /**
   * Sai de um grupo. O último a sair leva o grupo junto (as mensagens vão em
   * cascata) — não faz sentido manter conversa sem ninguém dentro. Se quem sai
   * era o dono, a posse passa a outro participante para o grupo não ficar com
   * `ownerId` apontando para fora.
   */
  async leaveGroup(meId: string, channelId: string): Promise<DMLeaveResult> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { members: { select: { userId: true } } },
    });
    if (!channel || channel.guildId !== null) {
      throw new NotFoundException("Conversa não encontrada");
    }
    if (!channel.members.some((p) => p.userId === meId)) {
      throw new ForbiddenException("Você não participa desta conversa");
    }
    if (channel.type !== "GROUP") {
      throw new BadRequestException("Não é possível sair de uma conversa 1-a-1");
    }

    const restantes = channel.members.filter((p) => p.userId !== meId);
    if (restantes.length === 0) {
      await this.prisma.channel.delete({ where: { id: channelId } });
      return { channelId, deleted: true };
    }

    await this.prisma.$transaction([
      this.prisma.channelMember.delete({
        where: { channelId_userId: { channelId, userId: meId } },
      }),
      ...(channel.ownerId === meId
        ? [
            this.prisma.channel.update({
              where: { id: channelId },
              data: { ownerId: restantes[0].userId },
            }),
          ]
        : []),
    ]);
    // corta a sala ao vivo: sem isso ele seguiria recebendo o grupo
    this.realtime.leaveChannelRooms(meId, [channelId]);
    await this.avisoDeSistema(channelId, meId, "SYSTEM_MEMBER_LEFT", "");
    return { channelId, deleted: false };
  }

  /**
   * Lista as conversas (1-a-1 e grupos) das quais o usuário participa, com o
   * resumo de leitura, ordenadas pela última mensagem (como a coluna do Discord).
   */
  async list(meId: string, username: string): Promise<DMChannelView[]> {
    const channels = await this.prisma.channel.findMany({
      where: { guildId: null, members: { some: { userId: meId } } },
      include: WITH_MEMBERS,
      orderBy: { createdAt: "desc" },
    });
    const [summaries, escondidas] = await Promise.all([
      this.readState.summaries(
        meId,
        username,
        channels.map((c) => c.id),
      ),
      this.prisma.dMHidden.findMany({ where: { userId: meId }, select: { channelId: true, hiddenAt: true } }),
    ]);
    const hiddenAt = new Map(escondidas.map((h) => [h.channelId, h.hiddenAt]));
    return channels
      .map((c) => this.toView(c, meId, summaries.get(c.id)))
      // conversa fechada volta sozinha quando chega mensagem depois do fechamento
      .filter((c) => {
        const at = hiddenAt.get(c.id);
        if (!at) return true;
        return !!c.lastMessageAt && new Date(c.lastMessageAt).getTime() > at.getTime();
      })
      .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  }

  /** Uma conversa específica, na visão de quem pede (404 se não participa). */
  async get(meId: string, channelId: string): Promise<DMChannelView> {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, guildId: null, members: { some: { userId: meId } } },
      include: WITH_MEMBERS,
    });
    if (!channel) throw new NotFoundException("Conversa não encontrada");
    return this.toView(channel, meId);
  }

  /** Canonicaliza o par (ordem estável) para garantir 1 canal por dupla. */
  private pair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private toView(
    channel: Parameters<typeof toChannelDTO>[0] & {
      members: MemberWithUser[];
      ownerId: string | null;
      iconKey: string | null;
    },
    meId: string,
    summary?: ChannelReadSummary,
  ): DMChannelView {
    const others = channel.members
      .filter((p) => p.userId !== meId)
      .map((p) => toPublicUser(p.user));
    return {
      ...toChannelDTO(channel, summary),
      others,
      iconUrl: this.iconUrl(channel.id, channel.iconKey),
      ownerId: channel.ownerId,
    };
  }

  // ── d-social ────────────────────────────────────────────────

  /** Participantes de uma conversa (coluna 4 da DM/grupo). Só quem participa vê. */
  async members(meId: string, channelId: string): Promise<PublicUser[]> {
    const channel = await this.acharConversa(meId, channelId);
    const rows = await this.prisma.channelMember.findMany({
      where: { channelId: channel.id },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    });
    return rows.map((r) => toPublicUser(r.user));
  }

  /**
   * Fecha a conversa: some da minha lista até chegar mensagem nova.
   *
   * Guardamos o instante em vez de apagar a conversa porque o histórico é dos
   * dois lados — e é o instante que faz ela reaparecer sozinha quando o outro
   * escreve, sem ninguém precisar limpar a linha no envio.
   */
  async hide(meId: string, channelId: string): Promise<{ channelId: string }> {
    await this.acharConversa(meId, channelId);
    await this.prisma.dMHidden.upsert({
      where: { userId_channelId: { userId: meId, channelId } },
      create: { userId: meId, channelId },
      update: { hiddenAt: new Date() },
    });
    return { channelId };
  }

  /** Adiciona alguém ao grupo. Qualquer participante pode, como no Discord. */
  async addMember(meId: string, channelId: string, userId: string): Promise<DMChannelView> {
    const channel = await this.acharGrupo(meId, channelId);
    if (channel.members.some((m) => m.userId === userId)) {
      throw new BadRequestException("Esta pessoa já está no grupo");
    }
    if (channel.members.length >= MAX_DM_GROUP_INVITEES + 1) {
      throw new BadRequestException(`Um grupo aceita no máximo ${MAX_DM_GROUP_INVITEES + 1} pessoas`);
    }
    const novo = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!novo) throw new NotFoundException("Usuário não encontrado");
    // bloqueio vale aqui também: pôr alguém num grupo com quem o bloqueou
    // seria uma porta dos fundos para o DM barrado
    await this.friends.assertNotBlocked(meId, userId);

    await this.prisma.channelMember.create({ data: { channelId, userId } });
    this.realtime.joinChannelRooms([userId], channelId);
    await this.avisoDeSistema(channelId, meId, "SYSTEM_MEMBER_ADDED", novo.username);
    return this.publicar(channelId, meId);
  }

  /** Remove alguém do grupo. Só o dono, como no Discord. */
  async removeMember(meId: string, channelId: string, userId: string): Promise<DMChannelView> {
    const channel = await this.acharGrupo(meId, channelId);
    if (channel.ownerId !== meId) {
      throw new ForbiddenException("Só quem criou o grupo remove participantes");
    }
    if (userId === meId) throw new BadRequestException("Para sair do grupo, use “Sair do grupo”");
    const alvo = channel.members.find((m) => m.userId === userId);
    if (!alvo) throw new NotFoundException("Esta pessoa não está no grupo");

    await this.prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId } },
    });
    // sem isto o removido seguiria recebendo as mensagens ao vivo até recarregar
    this.realtime.leaveChannelRooms(userId, [channelId]);
    this.realtime.emitToUser(userId, WS_EVENTS.CHANNEL_DELETED, { channelId, guildId: null });
    await this.avisoDeSistema(channelId, meId, "SYSTEM_MEMBER_REMOVED", alvo.user.username);
    return this.publicar(channelId, meId);
  }

  /** Renomeia o grupo (qualquer participante). Nome vazio volta ao derivado. */
  async rename(meId: string, channelId: string, name: string | null): Promise<DMChannelView> {
    await this.acharGrupo(meId, channelId);
    const novo = name?.trim() || null;
    if (novo && novo.length > MAX_DM_GROUP_NAME) {
      throw new BadRequestException(`Nome acima de ${MAX_DM_GROUP_NAME} caracteres`);
    }
    await this.prisma.channel.update({ where: { id: channelId }, data: { name: novo } });
    await this.avisoDeSistema(channelId, meId, "SYSTEM_GROUP_RENAMED", novo ?? "");
    return this.publicar(channelId, meId);
  }

  /** Ícone do grupo: mesma mecânica do avatar (magic-bytes + storage + proxy). */
  async updateIcon(
    meId: string,
    channelId: string,
    file: { buffer: Buffer; size: number },
  ): Promise<DMChannelView> {
    const channel = await this.acharGrupo(meId, channelId);
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException("Armazenamento (R2) não configurado. Ver PENDENCIAS.md.");
    }
    if (!file?.buffer?.length) throw new BadRequestException("Arquivo vazio");
    if (file.size > MAX_GROUP_ICON_SIZE) {
      throw new PayloadTooLargeException(`Ícone acima de ${MAX_GROUP_ICON_SIZE / 1024 / 1024} MB`);
    }
    const image = sniffImage(file.buffer);
    if (!image) throw new BadRequestException("O ícone precisa ser uma imagem (PNG, JPEG, GIF ou WebP)");

    const key = `dm-icons/${channelId}/${randomUUID()}`;
    await this.storage.put(key, file.buffer, image.mime);
    await this.prisma.channel.update({ where: { id: channelId }, data: { iconKey: key } });
    if (channel.iconKey) await this.storage.delete(channel.iconKey);
    await this.avisoDeSistema(channelId, meId, "SYSTEM_GROUP_ICON", "");
    return this.publicar(channelId, meId);
  }

  /** Corpo + content-type do ícone do grupo para o proxy. */
  async iconStream(channelId: string): Promise<{ body: Readable; contentType: string }> {
    const c = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { iconKey: true },
    });
    if (!c?.iconKey) throw new NotFoundException("Sem ícone");
    return { body: await this.storage.get(c.iconKey), contentType: "image/*" };
  }

  /**
   * Registra o evento do grupo como mensagem de sistema e o entrega ao vivo.
   * Ela entra na timeline como qualquer outra (`message.new`) — é o que faz o
   * "X adicionou Y" aparecer no lugar certo da conversa, sem canal paralelo.
   */
  private async avisoDeSistema(
    channelId: string,
    autorId: string,
    tipo: MessageType,
    conteudo: string,
  ): Promise<void> {
    const msg = await this.prisma.message.create({
      data: { channelId, authorId: autorId, content: conteudo, type: tipo },
      select: { id: true },
    });
    const dto = await this.messages.getDTO(msg.id);
    this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_NEW, dto);
  }

  /**
   * Reemite a conversa alterada para todos os participantes (cada um recebe a
   * *sua* visão: `others` exclui quem recebe) e devolve a de quem pediu.
   */
  private async publicar(channelId: string, meId: string): Promise<DMChannelView> {
    const channel = await this.prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      include: WITH_MEMBERS,
    });
    for (const m of channel.members) {
      this.realtime.emitToUser(m.userId, WS_EVENTS.CHANNEL_UPDATED, this.toView(channel, m.userId));
    }
    return this.toView(channel, meId);
  }

  /** Conversa (DM ou grupo) da qual eu participo — 404 caso contrário. */
  private async acharConversa(meId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, guildId: null, members: { some: { userId: meId } } },
      include: WITH_MEMBERS,
    });
    if (!channel) throw new NotFoundException("Conversa não encontrada");
    return channel;
  }

  /** Idem, exigindo que seja grupo: DM 1-a-1 não tem participantes a gerir. */
  private async acharGrupo(meId: string, channelId: string) {
    const channel = await this.acharConversa(meId, channelId);
    if (channel.type !== "GROUP") {
      throw new BadRequestException("Esta ação só vale para grupos");
    }
    return channel;
  }

  /** URL do ícone do grupo, versionada pela chave (como o avatar). */
  private iconUrl(channelId: string, key: string | null): string | null {
    if (!key) return null;
    const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(/\/+$/, "");
    const v = key.split("/").pop() ?? "";
    return `${api}/api/dms/${channelId}/icon?v=${v}`;
  }
}
