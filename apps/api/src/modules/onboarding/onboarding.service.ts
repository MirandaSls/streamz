import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Permission, WS_EVENTS, displayNameOf, normalizarApelido } from "@streamz/shared";
import type {
  GuildMembership,
  GuildOnboarding,
  GuildOnboardingUpdate,
  MinhaAssociacaoEditarInput,
} from "@streamz/shared";
import { MAX_WELCOME_CHANNELS } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { diffChanges } from "../audit/changes";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";

/** Colunas do Guild que formam a configuração de entrada/descoberta. */
const CAMPOS = {
  systemChannelId: true,
  rulesChannelId: true,
  welcomeDescription: true,
  welcomeChannelIds: true,
  discoverable: true,
  description: true,
} as const;

type GuildOnboardingRow = { [K in keyof typeof CAMPOS]: GuildOnboarding[K] };

/**
 * Entrada no servidor: mensagem de sistema "X entrou", canal de regras com
 * aceite obrigatório, tela de boas-vindas e a chave que põe o servidor em
 * "Descobrir".
 *
 * Fica num módulo próprio porque é uma decisão de *servidor* que atravessa
 * convites (quem entra), mensagens (quem pode postar antes de aceitar as
 * regras) e descoberta — nenhum desses é dono do assunto.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  /** Configuração atual (qualquer membro pode ler: a UI depende dela). */
  async get(userId: string, guildId: string): Promise<GuildOnboarding> {
    await this.guilds.assertMember(userId, guildId);
    return this.read(guildId);
  }

  /** Configuração + o que vale para *mim* (regras, castigo, boas-vindas). */
  async membership(userId: string, guildId: string): Promise<GuildMembership> {
    const member = await this.guilds.assertMember(userId, guildId);
    const onboarding = await this.read(guildId);
    const welcomeChannels = await this.resolveWelcomeChannels(guildId, onboarding.welcomeChannelIds);
    const temBoasVindas =
      Boolean(onboarding.welcomeDescription?.trim()) || welcomeChannels.length > 0;
    return {
      guildId,
      onboarding,
      welcomeChannels,
      acceptedRulesAt: member.acceptedRulesAt ? member.acceptedRulesAt.toISOString() : null,
      timeoutUntil: member.timeoutUntil ? member.timeoutUntil.toISOString() : null,
      mustAcceptRules: Boolean(onboarding.rulesChannelId) && !member.acceptedRulesAt,
      showWelcome: temBoasVindas && !member.welcomeSeenAt,
      // ── menus de contexto ──
      nickname: member.nickname,
      permitirDmsDoServidor: member.permitirDmsDoServidor,
    };
  }

  /**
   * `PATCH /guilds/:guildId/membership` — apelido e privacidade de DM do
   * próprio membro (menus de contexto, itens 5 e 6). Só o que vier no corpo é
   * escrito; o schema já recusa objeto vazio (400 "Nada para editar").
   */
  async editMembership(
    userId: string,
    guildId: string,
    patch: MinhaAssociacaoEditarInput,
  ): Promise<GuildMembership> {
    const member = await this.guilds.assertMember(userId, guildId);

    const novoNickname =
      patch.nickname !== undefined ? normalizarApelido(patch.nickname) : undefined;
    const nicknameMudou = novoNickname !== undefined && novoNickname !== member.nickname;
    const privacidadeMudou =
      patch.permitirDmsDoServidor !== undefined &&
      patch.permitirDmsDoServidor !== member.permitirDmsDoServidor;

    await this.prisma.guildMember.update({
      where: { userId_guildId: { userId, guildId } },
      data: {
        ...(novoNickname !== undefined ? { nickname: novoNickname } : {}),
        ...(patch.permitirDmsDoServidor !== undefined
          ? { permitirDmsDoServidor: patch.permitirDmsDoServidor }
          : {}),
      },
    });

    // a lista de membros e o autor das mensagens no servidor precisam do
    // apelido novo na hora — evento existente, só ganhou o campo
    if (nicknameMudou) {
      this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_UPDATED, {
        guildId,
        userId,
        role: member.role,
        nickname: novoNickname,
      });
    }
    // a privacidade é só minha: aviso "releia sua associação" (mesmo payload
    // de `avisarMinhasConexoes`), não a sala do servidor inteira
    if (privacidadeMudou) {
      this.avisarMinhasConexoes(userId, guildId);
    }

    return this.membership(userId, guildId);
  }

  /** Salva a configuração (só moderação) e avisa o servidor inteiro. */
  async update(
    actorId: string,
    guildId: string,
    patch: GuildOnboardingUpdate,
  ): Promise<GuildOnboarding> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_GUILD);
    const antes = await this.read(guildId);

    // canal de sistema/regras precisa ser um canal de texto *deste* servidor —
    // sem isso daria para apontar o aviso de entrada para o canal de outro
    for (const campo of ["systemChannelId", "rulesChannelId"] as const) {
      const id = patch[campo];
      if (id) await this.assertCanalDeTexto(guildId, id);
    }
    if (patch.welcomeChannelIds) {
      if (patch.welcomeChannelIds.length > MAX_WELCOME_CHANNELS) {
        throw new BadRequestException(`No máximo ${MAX_WELCOME_CHANNELS} canais em destaque`);
      }
      for (const id of patch.welcomeChannelIds) await this.assertCanalDeTexto(guildId, id);
    }

    const guild = await this.prisma.guild.update({
      where: { id: guildId },
      data: {
        ...(patch.systemChannelId !== undefined ? { systemChannelId: patch.systemChannelId } : {}),
        ...(patch.rulesChannelId !== undefined ? { rulesChannelId: patch.rulesChannelId } : {}),
        ...(patch.welcomeDescription !== undefined
          ? { welcomeDescription: patch.welcomeDescription?.trim() || null }
          : {}),
        ...(patch.welcomeChannelIds !== undefined
          ? { welcomeChannelIds: patch.welcomeChannelIds }
          : {}),
        ...(patch.discoverable !== undefined ? { discoverable: patch.discoverable } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description?.trim() || null }
          : {}),
      },
      select: CAMPOS,
    });

    const depois = this.toDTO(guild);
    const changes = diffChanges(antes, patch, [
      "systemChannelId",
      "rulesChannelId",
      "welcomeDescription",
      "welcomeChannelIds",
      "discoverable",
      "description",
    ]);
    if (changes.length > 0) {
      await this.audit.log({
        guildId,
        actorId,
        action: "GUILD_UPDATE",
        targetId: guildId,
        targetType: "GUILD",
        changes,
      });
    }
    this.realtime.emitToGuild(guildId, WS_EVENTS.GUILD_SETTINGS_UPDATED, {
      guildId,
      onboarding: depois,
    });
    return depois;
  }

  /** Aceita as regras do servidor. Idempotente: aceitar de novo não muda nada. */
  async acceptRules(userId: string, guildId: string): Promise<{ acceptedRulesAt: string }> {
    const member = await this.guilds.assertMember(userId, guildId);
    if (member.acceptedRulesAt) {
      return { acceptedRulesAt: member.acceptedRulesAt.toISOString() };
    }
    const updated = await this.prisma.guildMember.update({
      where: { userId_guildId: { userId, guildId } },
      data: { acceptedRulesAt: new Date() },
    });
    this.avisarMinhasConexoes(userId, guildId);
    return { acceptedRulesAt: updated.acceptedRulesAt!.toISOString() };
  }

  /** Marca a tela de boas-vindas como vista (não volta a aparecer). */
  async markWelcomeSeen(userId: string, guildId: string): Promise<{ ok: true }> {
    await this.guilds.assertMember(userId, guildId);
    await this.prisma.guildMember.updateMany({
      where: { userId, guildId, welcomeSeenAt: null },
      data: { welcomeSeenAt: new Date() },
    });
    this.avisarMinhasConexoes(userId, guildId);
    return { ok: true };
  }

  /**
   * Aceitar as regras e ver as boas-vindas são estados **por membro**: o evento
   * vai só para a sala `user:<id>`, e o cliente relê a sua associação. Sem
   * isso, aceitar as regras no desktop deixava o site preso no mesmo portão.
   * O payload é o mesmo de `guild.settingsUpdated` porque o tratador do
   * cliente já é "releia o que mudou para mim neste servidor" — e reler duas
   * vezes dá o mesmo resultado.
   */
  private avisarMinhasConexoes(userId: string, guildId: string): void {
    this.realtime.emitToUser(userId, WS_EVENTS.GUILD_SETTINGS_UPDATED, { guildId });
  }

  /**
   * Publica "X entrou no servidor" no canal de sistema, se houver um.
   *
   * Não lança: entrar no servidor não pode falhar porque o canal de sistema foi
   * apagado. O conteúdo guarda a frase pronta (para busca e notificação) e o
   * cliente ainda recompõe a linha a partir do autor e do `systemType`.
   */
  async announceJoin(guildId: string, userId: string): Promise<void> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { systemChannelId: true },
    });
    if (!guild?.systemChannelId) return;
    const canal = await this.prisma.channel.findFirst({
      where: { id: guild.systemChannelId, guildId, type: "TEXT" },
      select: { id: true },
    });
    if (!canal) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const message = await this.prisma.message.create({
      data: {
        channelId: canal.id,
        authorId: userId,
        content: `${displayNameOf(user)} entrou no servidor.`,
        type: "SYSTEM_JOIN",
      },
      include: { author: true },
    });
    this.realtime.emitToChannel(canal.id, WS_EVENTS.MESSAGE_NEW, {
      id: message.id,
      channelId: canal.id,
      guildId,
      author: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: user.status,
        customStatusText: null,
        customStatusEmoji: null,
      },
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      editedAt: null,
      reactions: [],
      parentId: null,
      replyCount: 0,
      attachments: [],
      type: "SYSTEM_JOIN",
      sticker: null,
      suppressEmbeds: false,
      replyTo: null,
      replyMention: false,
      thread: null,
      pinned: false,
      poll: null,
    });
  }

  /**
   * Preciso aceitar as regras antes de postar neste canal? O próprio canal de
   * regras fica de fora — senão não haveria como ler para aceitar.
   */
  async blocksPosting(guildId: string, channelId: string, userId: string): Promise<boolean> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { rulesChannelId: true },
    });
    if (!guild?.rulesChannelId || guild.rulesChannelId === channelId) return false;
    const member = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { acceptedRulesAt: true, role: true },
    });
    if (!member) return false;
    // quem administra o servidor não fica preso pelas próprias regras
    if (member.role === "OWNER" || member.role === "ADMIN") return false;
    return !member.acceptedRulesAt;
  }

  private async read(guildId: string): Promise<GuildOnboarding> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: CAMPOS,
    });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    return this.toDTO(guild);
  }

  private toDTO(g: GuildOnboardingRow): GuildOnboarding {
    return {
      systemChannelId: g.systemChannelId,
      rulesChannelId: g.rulesChannelId,
      welcomeDescription: g.welcomeDescription,
      welcomeChannelIds: g.welcomeChannelIds,
      discoverable: g.discoverable,
      description: g.description,
    };
  }

  /** Canais em destaque na ordem escolhida, pulando os que já não existem. */
  private async resolveWelcomeChannels(guildId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.channel.findMany({
      where: { id: { in: ids }, guildId },
      select: { id: true, name: true },
    });
    const porId = new Map(rows.map((c) => [c.id, c]));
    return ids.map((id) => porId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  }

  private async assertCanalDeTexto(guildId: string, channelId: string) {
    const canal = await this.prisma.channel.findFirst({
      where: { id: channelId, guildId, type: "TEXT" },
      select: { id: true },
    });
    if (!canal) throw new BadRequestException("Canal inválido para este servidor");
  }
}
