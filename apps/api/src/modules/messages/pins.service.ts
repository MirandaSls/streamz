import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MAX_PINS_PER_CHANNEL, WS_EVENTS } from "@newdisc/shared";
import type { PinnedMessage } from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { MessagesService } from "./messages.service";
import { toPublicUser } from "../../common/dto";

/**
 * Mensagens fixadas de um canal.
 *
 * Quem pode fixar: a moderação do servidor (OWNER/ADMIN) ou, em conversa
 * direta, qualquer participante — lá não existe papel. A decisão sai do
 * `assertCanViewChannel`, que já distingue os dois casos.
 */
@Injectable()
export class PinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly messages: MessagesService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(channelId: string, userId: string): Promise<PinnedMessage[]> {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const rows = await this.prisma.pinnedMessage.findMany({
      where: { channelId },
      include: { pinnedBy: true },
      orderBy: { pinnedAt: "desc" },
    });
    return Promise.all(
      rows.map(async (r) => ({
        message: await this.messages.getDTO(r.messageId),
        pinnedBy: toPublicUser(r.pinnedBy),
        pinnedAt: r.pinnedAt.toISOString(),
      })),
    );
  }

  async pin(channelId: string, userId: string, messageId: string): Promise<PinnedMessage> {
    await this.assertCanPin(userId, channelId);
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true, type: true },
    });
    if (!msg || msg.channelId !== channelId) throw new NotFoundException("Mensagem não encontrada");
    if (msg.type !== "DEFAULT") throw new BadRequestException("Mensagem do sistema não é fixável");

    const jaFixada = await this.prisma.pinnedMessage.findUnique({ where: { messageId } });
    if (!jaFixada) {
      const total = await this.prisma.pinnedMessage.count({ where: { channelId } });
      if (total >= MAX_PINS_PER_CHANNEL) {
        throw new BadRequestException(
          `Este canal já tem ${MAX_PINS_PER_CHANNEL} mensagens fixadas`,
        );
      }
    }

    const row = await this.prisma.pinnedMessage.upsert({
      where: { messageId },
      create: { channelId, messageId, pinnedById: userId },
      update: {},
      include: { pinnedBy: true },
    });

    const pin: PinnedMessage = {
      message: await this.messages.getDTO(messageId),
      pinnedBy: toPublicUser(row.pinnedBy),
      pinnedAt: row.pinnedAt.toISOString(),
    };

    if (!jaFixada) {
      this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_PINNED, { channelId, pin });
      // a própria mensagem passa a mostrar o marcador de fixada
      this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_UPDATED, pin.message);
      // narração no canal, como no Discord ("X fixou uma mensagem")
      const sistema = await this.messages.createSystem(channelId, userId, "SYSTEM_PIN", messageId);
      this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_NEW, sistema);
    }
    return pin;
  }

  async unpin(channelId: string, userId: string, messageId: string): Promise<{ messageId: string }> {
    await this.assertCanPin(userId, channelId);
    const row = await this.prisma.pinnedMessage.findUnique({ where: { messageId } });
    if (!row || row.channelId !== channelId) {
      throw new NotFoundException("Esta mensagem não está fixada");
    }
    await this.prisma.pinnedMessage.delete({ where: { messageId } });
    this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_UNPINNED, { channelId, messageId });
    this.realtime.emitToChannel(
      channelId,
      WS_EVENTS.MESSAGE_UPDATED,
      await this.messages.getDTO(messageId),
    );
    return { messageId };
  }

  /** Fixar/desafixar: moderação no servidor, qualquer participante em DM. */
  private async assertCanPin(userId: string, channelId: string) {
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    if (access.tipo === "guild" && access.member.role === "MEMBER") {
      throw new ForbiddenException("Só a moderação fixa mensagens neste canal");
    }
    return access;
  }
}
