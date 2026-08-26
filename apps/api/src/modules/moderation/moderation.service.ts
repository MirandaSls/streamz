import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Permission, WS_EVENTS, MAX_BULK_DELETE, MAX_MODERATION_REASON } from "@streamz/shared";
import type { MessagesBulkDeletedEvent, ReportReason, ReportView } from "@streamz/shared";
import { toPublicUser, type PublicUserRow } from "../../common/dto";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { DMsService } from "../dms/dms.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { calcularFim } from "./timeout";

/** Opções da expulsão/banimento vindas dos modais. */
export interface KickOptions {
  reason?: string;
}
export interface BanOptions extends KickOptions {
  /** apaga as mensagens do banido nas últimas N horas (0 = não apagar). */
  deleteMessageHours?: number;
}

/**
 * Ações de moderação que vão além de tirar alguém do servidor: castigo,
 * expulsão/banimento **com motivo, limpeza de mensagens e aviso na DM**, e a
 * remoção de mensagens em lote.
 *
 * A remoção do membro em si continua sendo do `GuildsService` — é lá que mora a
 * hierarquia de cargos, o corte das salas ao vivo e o registro de auditoria.
 * Este serviço orquestra o que acontece em volta.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly dms: DMsService,
  ) {}

  // ── castigo ────────────────────────────────────────────────

  /** Põe um membro de castigo: ele continua vendo tudo, mas não escreve. */
  async timeout(
    actorId: string,
    guildId: string,
    targetUserId: string,
    input: { minutes?: number; until?: string; reason?: string },
  ) {
    await this.assertPodeAgirSobre(actorId, guildId, targetUserId);
    const fim = calcularFim(input);
    if (!fim.ok) throw new BadRequestException(fim.message);

    const anterior = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: targetUserId, guildId } },
      select: { timeoutUntil: true },
    });
    await this.prisma.guildMember.update({
      where: { userId_guildId: { userId: targetUserId, guildId } },
      data: { timeoutUntil: fim.until },
    });
    await this.audit.log({
      guildId,
      actorId,
      action: "MEMBER_TIMEOUT",
      targetId: targetUserId,
      targetType: "USER",
      targetName: await this.usernameOf(targetUserId),
      changes: [
        {
          field: "timeoutUntil",
          before: anterior?.timeoutUntil?.toISOString() ?? null,
          after: fim.until.toISOString(),
        },
      ],
      reason: input.reason,
    });
    this.emitMemberUpdated(guildId, targetUserId, fim.until);
    return { userId: targetUserId, timeoutUntil: fim.until.toISOString() };
  }

  /** Tira o castigo antes da hora. */
  async removeTimeout(actorId: string, guildId: string, targetUserId: string, reason?: string) {
    await this.assertPodeAgirSobre(actorId, guildId, targetUserId);
    const anterior = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: targetUserId, guildId } },
      select: { timeoutUntil: true },
    });
    await this.prisma.guildMember.update({
      where: { userId_guildId: { userId: targetUserId, guildId } },
      data: { timeoutUntil: null },
    });
    await this.audit.log({
      guildId,
      actorId,
      action: "MEMBER_TIMEOUT_REMOVE",
      targetId: targetUserId,
      targetType: "USER",
      targetName: await this.usernameOf(targetUserId),
      changes: [
        {
          field: "timeoutUntil",
          before: anterior?.timeoutUntil?.toISOString() ?? null,
          after: null,
        },
      ],
      reason,
    });
    this.emitMemberUpdated(guildId, targetUserId, null);
    return { userId: targetUserId, timeoutUntil: null };
  }

  // ── expulsão e banimento com contexto ──────────────────────

  /** Expulsa com motivo e avisa o expulso na DM. */
  async kick(actorId: string, guildId: string, targetUserId: string, opts: KickOptions = {}) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { name: true },
    });
    const result = await this.guilds.kick(actorId, guildId, targetUserId, opts.reason);
    await this.avisarNaDM(actorId, targetUserId, guild?.name ?? "um servidor", "expulso", opts.reason);
    return result;
  }

  /**
   * Bane com motivo, opcionalmente apagando as mensagens recentes do banido, e
   * avisa na DM.
   *
   * A limpeza vem **antes** do banimento: depois de banido o alvo já saiu das
   * salas dos canais, e quem ficou precisa ver as mensagens sumirem ao vivo.
   */
  async ban(actorId: string, guildId: string, targetUserId: string, opts: BanOptions = {}) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { name: true },
    });
    // valida antes de apagar qualquer coisa: sem permissão, nada acontece
    await this.assertPodeAgirSobre(actorId, guildId, targetUserId);

    const horas = opts.deleteMessageHours ?? 0;
    if (horas > 0) await this.purgarMensagens(guildId, targetUserId, horas, actorId);

    const result = await this.guilds.ban(actorId, guildId, targetUserId, opts.reason);
    await this.avisarNaDM(actorId, targetUserId, guild?.name ?? "um servidor", "banido", opts.reason);
    return result;
  }

  // ── remoção de mensagens em lote ───────────────────────────

  /**
   * Apaga várias mensagens de um canal de uma vez. Só quem modera o canal
   * (OWNER/ADMIN do servidor) — em conversa direta não existe moderação, então
   * `canModerateChannel` já responde `false`.
   */
  async bulkDelete(userId: string, channelId: string, messageIds: string[]) {
    const ids = Array.from(new Set(messageIds)).slice(0, MAX_BULK_DELETE);
    if (ids.length === 0) throw new BadRequestException("Nenhuma mensagem selecionada");
    if (messageIds.length > MAX_BULK_DELETE) {
      throw new BadRequestException(`No máximo ${MAX_BULK_DELETE} mensagens por vez`);
    }
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    if (!(await this.guilds.canModerateChannel(userId, channelId))) {
      throw new ForbiddenException("Sem permissão para apagar mensagens deste canal");
    }

    // só apaga o que é mesmo deste canal — ids de outro canal seriam um jeito
    // de apagar mensagem onde o ator não modera
    const alvo = await this.prisma.message.findMany({
      where: { id: { in: ids }, channelId },
      select: { id: true },
    });
    if (alvo.length === 0) throw new NotFoundException("Nenhuma mensagem encontrada");
    const apagados = alvo.map((m) => m.id);
    await this.prisma.message.deleteMany({ where: { id: { in: apagados } } });

    this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGES_BULK_DELETED, {
      channelId,
      messageIds: apagados,
    } satisfies MessagesBulkDeletedEvent);
    if (access.tipo === "guild" && access.channel.guildId) {
      await this.audit.log({
        guildId: access.channel.guildId,
        actorId: userId,
        action: "MESSAGE_BULK_DELETE",
        targetId: channelId,
        targetType: "CHANNEL",
        targetName: await this.channelNameOf(channelId),
        changes: [{ field: "count", before: null, after: apagados.length }],
      });
    }
    return { deleted: apagados };
  }

  /**
   * "Apagar mensagens depois desta": tudo o que veio *depois* da mensagem
   * apontada, no mesmo canal, até o teto do lote.
   */
  async deleteAfter(userId: string, channelId: string, messageId: string) {
    const ancora = await this.prisma.message.findFirst({
      where: { id: messageId, channelId },
      select: { createdAt: true },
    });
    if (!ancora) throw new NotFoundException("Mensagem não encontrada");
    const posteriores = await this.prisma.message.findMany({
      where: { channelId, createdAt: { gt: ancora.createdAt } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: MAX_BULK_DELETE,
    });
    if (posteriores.length === 0) throw new NotFoundException("Não há mensagens depois desta");
    return this.bulkDelete(userId, channelId, posteriores.map((m) => m.id));
  }

  // ── denúncias ──────────────────────────────────────────────

  /** Qualquer um que enxerga o canal pode denunciar uma mensagem dele. */
  async report(
    reporterId: string,
    messageId: string,
    reason: ReportReason,
    details?: string,
  ): Promise<ReportView> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, content: true, authorId: true },
    });
    if (!message) throw new NotFoundException("Mensagem não encontrada");
    const access = await this.guilds.assertCanViewChannel(reporterId, message.channelId);
    if (access.tipo !== "guild" || !access.channel.guildId) {
      throw new BadRequestException("Denúncia só vale em canal de servidor");
    }
    if (message.authorId === reporterId) {
      throw new BadRequestException("Não dá para denunciar a própria mensagem");
    }
    const guildId = access.channel.guildId;

    try {
      const report = await this.prisma.report.create({
        data: {
          guildId,
          channelId: message.channelId,
          messageId: message.id,
          // cópia do texto: a mensagem pode ser apagada por causa da denúncia
          messageContent: message.content,
          reporterId,
          targetId: message.authorId,
          reason,
          details: details?.slice(0, 500) || null,
        },
        include: REPORT_INCLUDE,
      });
      const dto = await this.toReportDTO(report);
      // a moderação vê a denúncia chegar sem recarregar a aba
      for (const mod of await this.moderadores(guildId)) {
        this.realtime.emitToUser(mod, WS_EVENTS.REPORT_CREATED, dto);
      }
      return dto;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new BadRequestException("Você já denunciou esta mensagem");
      }
      throw e;
    }
  }

  /** Denúncias do servidor (só moderação); por padrão só as pendentes. */
  async listReports(userId: string, guildId: string, resolved = false): Promise<ReportView[]> {
    await this.guilds.assertCanModerate(userId, guildId, Permission.MANAGE_MESSAGES);
    const rows = await this.prisma.report.findMany({
      where: { guildId, resolved },
      include: REPORT_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Promise.all(rows.map((r) => this.toReportDTO(r)));
  }

  /** Marca (ou desmarca) uma denúncia como resolvida. */
  async resolveReport(
    userId: string,
    guildId: string,
    reportId: string,
    resolved: boolean,
  ): Promise<ReportView> {
    await this.guilds.assertCanModerate(userId, guildId, Permission.MANAGE_MESSAGES);
    const existe = await this.prisma.report.findFirst({
      where: { id: reportId, guildId },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException("Denúncia não encontrada");
    const row = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        resolved,
        resolvedById: resolved ? userId : null,
        resolvedAt: resolved ? new Date() : null,
      },
      include: REPORT_INCLUDE,
    });
    return this.toReportDTO(row);
  }

  // ── internos ───────────────────────────────────────────────

  /**
   * Apaga as mensagens do alvo nas últimas `horas`, canal a canal, avisando
   * cada canal em separado — o cliente remove por canal, e uma lista única não
   * diria de onde cada mensagem saiu.
   */
  private async purgarMensagens(
    guildId: string,
    targetUserId: string,
    horas: number,
    actorId: string,
  ) {
    const desde = new Date(Date.now() - horas * 3600 * 1000);
    const mensagens = await this.prisma.message.findMany({
      where: { authorId: targetUserId, createdAt: { gte: desde }, channel: { guildId } },
      select: { id: true, channelId: true },
    });
    if (mensagens.length === 0) return;

    await this.prisma.message.deleteMany({ where: { id: { in: mensagens.map((m) => m.id) } } });

    const porCanal = new Map<string, string[]>();
    for (const m of mensagens) {
      porCanal.set(m.channelId, [...(porCanal.get(m.channelId) ?? []), m.id]);
    }
    for (const [channelId, messageIds] of porCanal) {
      this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGES_BULK_DELETED, {
        channelId,
        messageIds,
      } satisfies MessagesBulkDeletedEvent);
    }
    await this.audit.log({
      guildId,
      actorId,
      action: "MESSAGE_BULK_DELETE",
      targetId: targetUserId,
      targetType: "USER",
      targetName: await this.usernameOf(targetUserId),
      changes: [
        { field: "count", before: null, after: mensagens.length },
        { field: "hours", before: null, after: horas },
      ],
    });
  }

  /**
   * Manda o aviso na conversa direta com o moderador ("Você foi banido de X").
   *
   * Nunca lança: se a DM falhar, o banimento já aconteceu e desfazê-lo seria
   * pior do que ficar sem o aviso.
   */
  private async avisarNaDM(
    actorId: string,
    targetUserId: string,
    guildName: string,
    acao: "expulso" | "banido",
    reason?: string,
  ) {
    try {
      const dm = await this.dms.openWith(actorId, targetUserId);
      const motivo = reason?.trim() ? ` Motivo: ${reason.trim()}` : "";
      const content = `Você foi ${acao} de ${guildName}.${motivo}`;
      const message = await this.prisma.message.create({
        data: {
          channelId: dm.id,
          authorId: actorId,
          content,
          type: "SYSTEM_MOD_NOTICE",
        },
        include: { author: true },
      });
      this.realtime.emitToChannel(dm.id, WS_EVENTS.MESSAGE_NEW, {
        id: message.id,
        channelId: dm.id,
        guildId: null,
        author: toPublicUser(message.author),
        content,
        createdAt: message.createdAt.toISOString(),
        editedAt: null,
        reactions: [],
        parentId: null,
        replyCount: 0,
        attachments: [],
        type: "SYSTEM_MOD_NOTICE",
        sticker: null,
        suppressEmbeds: false,
        replyTo: null,
        replyMention: false,
        thread: null,
        pinned: false,
        poll: null,
      });
    } catch {
      // aviso é cortesia; a ação de moderação já está feita
    }
  }

  /** Hierarquia + permissão, com a mesma regra do kick/ban. */
  private async assertPodeAgirSobre(actorId: string, guildId: string, targetUserId: string) {
    if (actorId === targetUserId) {
      throw new ForbiddenException("Você não pode moderar a si mesmo");
    }
    const actor = await this.guilds.assertCanModerate(actorId, guildId, Permission.MODERATE_MEMBERS);
    const target = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: targetUserId, guildId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException("Membro não encontrado");
    if (rank(actor.role) <= rank(target.role)) {
      throw new ForbiddenException("Você não pode moderar alguém de cargo igual ou superior");
    }
  }

  private emitMemberUpdated(guildId: string, userId: string, timeoutUntil: Date | null) {
    void this.prisma.guildMember
      .findUnique({
        where: { userId_guildId: { userId, guildId } },
        select: { role: true },
      })
      .then((m) => {
        this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_UPDATED, {
          guildId,
          userId,
          role: m?.role ?? "MEMBER",
          timeoutUntil: timeoutUntil ? timeoutUntil.toISOString() : null,
        });
      });
  }

  private async moderadores(guildId: string): Promise<string[]> {
    const rows = await this.prisma.guildMember.findMany({
      where: { guildId, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  private async usernameOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    return u?.username ?? null;
  }

  private async channelNameOf(channelId: string): Promise<string | null> {
    const c = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { name: true },
    });
    return c?.name ?? null;
  }

  private async toReportDTO(row: ReportRow): Promise<ReportView> {
    const target = row.targetId
      ? await this.prisma.user.findUnique({ where: { id: row.targetId } })
      : null;
    return {
      id: row.id,
      guildId: row.guildId,
      channelId: row.channelId,
      channelName: row.channel?.name ?? null,
      messageId: row.messageId,
      messageContent: row.messageContent,
      reporter: row.reporter ? toPublicUser(row.reporter) : null,
      target: target ? toPublicUser(target) : null,
      reason: row.reason,
      details: row.details,
      resolved: row.resolved,
      resolvedBy: row.resolvedBy ? toPublicUser(row.resolvedBy) : null,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

const REPORT_INCLUDE = {
  reporter: true,
  resolvedBy: true,
  channel: { select: { name: true } },
} as const;

interface ReportRow {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  messageContent: string | null;
  targetId: string | null;
  reason: ReportReason;
  details: string | null;
  resolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
  reporter: PublicUserRow | null;
  resolvedBy: PublicUserRow | null;
  channel: { name: string | null } | null;
}

function rank(role: "OWNER" | "ADMIN" | "MEMBER"): number {
  return role === "OWNER" ? 3 : role === "ADMIN" ? 2 : 1;
}

/** Reexportado para o controller validar o tamanho do motivo. */
export { MAX_MODERATION_REASON };
