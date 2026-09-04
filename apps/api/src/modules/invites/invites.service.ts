import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { GuildsService } from "../guilds/guilds.service";
import { OnboardingService } from "../onboarding/onboarding.service";
import { RealtimeService } from "../realtime/realtime.service";
import { isUniqueViolation } from "../../common/prisma-errors";
import { Permission, WS_EVENTS } from "@streamz/shared";
import type {
  InviteDetail,
  InviteFullPreview,
  InviteInfo,
  InviteOptions,
  InvitePreview,
} from "@streamz/shared";
import { toGuildDTO, toPublicUser, type PublicUserRow } from "../../common/dto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Sem escolha explícita, o convite dura 7 dias — o padrão do Discord. */
const DEFAULT_EXPIRY_MINUTES = 7 * 24 * 60;

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
    // h-moderacao: convite criado/revogado vai para o registro de auditoria
    private readonly audit: AuditService,
    private readonly onboarding: OnboardingService,
  ) {}

  /**
   * Cria um convite. Só membros do servidor podem convidar.
   *
   * Nas opções, `0` significa "sem limite"/"nunca" — é o que os seletores da UI
   * mandam para a última opção da lista; `undefined` cai no padrão (7 dias, sem
   * limite de usos), como no Discord.
   */
  async create(userId: string, guildId: string, opts?: InviteOptions): Promise<InviteInfo> {
    await this.guilds.assertMember(userId, guildId);

    const minutos = opts?.expiresInMinutes ?? DEFAULT_EXPIRY_MINUTES;
    const expiresAt = minutos > 0 ? new Date(Date.now() + minutos * 60_000) : null;
    const maxUses = opts?.maxUses && opts.maxUses > 0 ? opts.maxUses : null;
    const temporary = !!opts?.temporary;
    const channelId = opts?.channelId ? await this.channelDoServidor(guildId, opts.channelId) : null;

    // Tenta criar direto; em caso de colisão no code (@unique → P2002) gera
    // outro. Evita o findUnique-then-create, que tem corrida entre a checagem
    // e a inserção.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invite = await this.prisma.invite.create({
          data: {
            code: this.genCode(),
            guildId,
            creatorId: userId,
            maxUses,
            expiresAt,
            temporary,
            channelId,
          },
        });
        await this.audit.log({
          guildId,
          actorId: userId,
          action: "INVITE_CREATE",
          targetId: invite.code,
          targetType: "INVITE",
          targetName: invite.code,
          changes: [
            { field: "maxUses", before: null, after: maxUses },
            { field: "expiresAt", before: null, after: expiresAt?.toISOString() ?? null },
            ...(temporary ? [{ field: "temporary", before: false, after: true }] : []),
          ],
        });
        return this.toInfo(invite);
      } catch (e) {
        if (isUniqueViolation(e)) continue;
        throw e;
      }
    }
    throw new BadRequestException("Não foi possível gerar um código de convite");
  }

  /** Convites do servidor (só moderação vê a lista inteira). */
  async list(userId: string, guildId: string): Promise<InviteDetail[]> {
    await this.guilds.assertCanModerate(userId, guildId, Permission.MANAGE_GUILD);
    const rows = await this.prisma.invite.findMany({
      where: { guildId },
      include: { creator: true, channel: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((i) => ({
      ...this.toInfo(i),
      creator: i.creator ? toPublicUser(i.creator as PublicUserRow) : null,
      temporary: i.temporary,
      channelId: i.channelId,
      channelName: i.channel?.name ?? null,
      createdAt: i.createdAt.toISOString(),
    }));
  }

  /** Revoga um convite: quem criou, ou a moderação. */
  async revoke(userId: string, guildId: string, code: string) {
    const invite = await this.prisma.invite.findUnique({ where: { code } });
    if (!invite || invite.guildId !== guildId) throw new NotFoundException("Convite não encontrado");
    if (invite.creatorId !== userId) {
      await this.guilds.assertCanModerate(userId, guildId, Permission.MANAGE_GUILD);
    }
    await this.prisma.invite.delete({ where: { code } });
    await this.audit.log({
      guildId,
      actorId: userId,
      action: "INVITE_REVOKE",
      targetId: code,
      targetType: "INVITE",
      targetName: code,
    });
    return { revoked: code };
  }

  /**
   * Prévia pública do convite — é a página `/invite/:code`, que abre sem login.
   *
   * `viewerId` só aparece quando quem abriu já está autenticado; serve para o
   * botão dizer "Abrir" em vez de "Aceitar convite" para quem já é membro.
   */
  async preview(code: string, viewerId?: string): Promise<InviteFullPreview> {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: {
        guild: { select: { id: true, name: true, iconUrl: true, description: true } },
        creator: true,
        channel: { select: { name: true } },
      },
    });
    if (!invite) throw new NotFoundException("Convite inválido");

    const { valid, reason } = this.checkValidity(invite);
    const [memberCount, onlineCount, member] = await Promise.all([
      this.prisma.guildMember.count({ where: { guildId: invite.guildId } }),
      this.prisma.guildMember.count({
        where: { guildId: invite.guildId, user: { status: { not: "OFFLINE" } } },
      }),
      viewerId
        ? this.prisma.guildMember.findUnique({
            where: { userId_guildId: { userId: viewerId, guildId: invite.guildId } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      code: invite.code,
      guild: {
        id: invite.guild.id,
        name: invite.guild.name,
        iconUrl: invite.guild.iconUrl,
      },
      valid,
      reason,
      memberCount,
      onlineCount,
      description: invite.guild.description,
      channelName: invite.channel?.name ?? null,
      inviter: invite.creator ? toPublicUser(invite.creator as PublicUserRow) : null,
      member: !!member,
    };
  }

  /** Resgata o convite: adiciona o usuário como membro e conta o uso. */
  async redeem(userId: string, code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { guild: true },
    });
    if (!invite) throw new NotFoundException("Convite inválido");

    // rejeição rápida (expirado / limite já atingido); o limite ainda é
    // reforçado atomicamente na transação abaixo, à prova de corrida
    const { valid, reason } = this.checkValidity(invite);
    if (!valid) throw new BadRequestException(reason ?? "Convite inválido");

    if (await this.guilds.isBanned(invite.guildId, userId)) {
      throw new ForbiddenException("Você foi banido deste servidor");
    }

    // Idempotência: quem já é membro não consome outro uso.
    const already = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId: invite.guildId } },
    });
    if (already) return invite.guild;

    await this.prisma.$transaction(async (tx) => {
      // 1. cria a associação. Se dois pedidos do mesmo usuário correm juntos, o
      //    segundo bate no unique (userId_guildId) e sai sem consumir uso.
      try {
        await tx.guildMember.create({
          data: { userId, guildId: invite.guildId, role: "MEMBER" },
        });
      } catch (e) {
        if (isUniqueViolation(e)) return; // já virou membro numa corrida
        throw e;
      }

      // 2. consome um uso de forma atômica, respeitando maxUses. O where com
      //    `uses < maxUses` fecha a corrida TOCTOU: se o limite já foi atingido,
      //    count === 0 e o throw desfaz o guildMember.create acima (rollback).
      if (invite.maxUses !== null) {
        const res = await tx.invite.updateMany({
          where: { id: invite.id, uses: { lt: invite.maxUses } },
          data: { uses: { increment: 1 } },
        });
        if (res.count === 0) {
          throw new BadRequestException("Convite atingiu o limite de usos");
        }
      } else {
        await tx.invite.update({
          where: { id: invite.id },
          data: { uses: { increment: 1 } },
        });
      }
    });

    // quem já está no servidor vê o membro novo aparecer na lista
    const [user, novoMembro] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      // `joinedAt` vem do banco, e não de `new Date()` aqui: a tabela de
      // membros ordena por ele, e um relógio do processo diferente do da
      // transação colocaria o recém-chegado na posição errada
      this.prisma.guildMember.findUnique({
        where: { userId_guildId: { userId, guildId: invite.guildId } },
        select: { joinedAt: true },
      }),
    ]);
    if (user && novoMembro) {
      this.realtime.emitToGuild(invite.guildId, WS_EVENTS.MEMBER_JOINED, {
        guildId: invite.guildId,
        // membro novo entra só com o @everyone: nenhum cargo atribuído
        member: {
          role: "MEMBER",
          user: toPublicUser(user),
          roleIds: [],
          joinedAt: novoMembro.joinedAt.toISOString(),
        },
      });
    }
    // sockets já abertos passam a receber o servidor novo sem reconectar
    this.realtime.joinGuildRoom(userId, invite.guildId);
    // as salas de canal vêm de VIEW_CHANNEL, não do booleano `private`
    await this.guilds.resyncChannelRooms(invite.guildId, userId);
    // e as **minhas outras sessões** precisam saber que entrei: sem isto, quem
    // aceitava o convite no site só via o servidor no desktop depois de
    // reiniciar. `emitToUser` acerta a sala `user:<id>`, ou seja, todas as
    // conexões da conta — inclusive a que fez este POST (inserir duas vezes o
    // mesmo servidor é inofensivo: o cliente troca pelo id).
    this.realtime.emitToUser(userId, WS_EVENTS.GUILD_JOINED, {
      guild: toGuildDTO(invite.guild),
      reason: "joined",
    });
    // "X entrou no servidor" no canal de sistema, quando o servidor tem um
    await this.onboarding.announceJoin(invite.guildId, userId);
    return invite.guild;
  }

  private checkValidity(invite: {
    expiresAt: Date | null;
    maxUses: number | null;
    uses: number;
  }): { valid: boolean; reason?: string } {
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      return { valid: false, reason: "Convite expirado" };
    }
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      return { valid: false, reason: "Convite atingiu o limite de usos" };
    }
    return { valid: true };
  }

  /** O canal precisa ser um canal de texto deste servidor. */
  private async channelDoServidor(guildId: string, channelId: string): Promise<string | null> {
    const canal = await this.prisma.channel.findFirst({
      where: { id: channelId, guildId, type: "TEXT" },
      select: { id: true },
    });
    if (!canal) throw new BadRequestException("Canal inválido para este servidor");
    return canal.id;
  }

  private toInfo(invite: {
    code: string;
    guildId: string;
    uses: number;
    maxUses: number | null;
    expiresAt: Date | null;
  }): InviteInfo {
    return {
      code: invite.code,
      guildId: invite.guildId,
      uses: invite.uses,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    };
  }

  private genCode(len = 8): string {
    // Rejection sampling: descarta bytes na "cauda" que não formam um múltiplo
    // completo do alfabeto, evitando o viés de módulo (256 % 36 !== 0).
    const limit = 256 - (256 % ALPHABET.length);
    let out = "";
    while (out.length < len) {
      const bytes = randomBytes(len);
      for (let i = 0; i < bytes.length && out.length < len; i++) {
        if (bytes[i] < limit) out += ALPHABET[bytes[i] % ALPHABET.length];
      }
    }
    return out;
  }
}
