import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { WS_EVENTS, type ChannelReadEvent, type GuildReadResult } from "@streamz/shared";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";

/**
 * "Marcar servidor como lido": zera o não-lido de todos os canais que o usuário
 * enxerga naquele servidor de uma vez só.
 *
 * Vive no módulo de canais (e não no de servidores) porque o que ele marca são
 * canais — a lista já filtrada por `visibleChannelsForUser`, que é o mesmo
 * ponto de autorização usado pelo gateway.
 */
@UseGuards(JwtGuard)
@Controller("guilds/:guildId")
export class GuildReadController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Post("read")
  async markRead(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
  ): Promise<GuildReadResult> {
    await this.guilds.assertMember(user.sub, guildId);
    const visiveis = await this.guilds.visibleChannelsForUser(user.sub);
    const doServidor = visiveis.filter((c) => c.guildId === guildId).map((c) => c.id);
    // um instante só para todos os canais: "li o servidor às 14:03"
    const at = new Date();
    await this.prisma.$transaction(
      doServidor.map((channelId) =>
        this.prisma.readState.upsert({
          where: { userId_channelId: { userId: user.sub, channelId } },
          create: { userId: user.sub, channelId, lastReadAt: at },
          update: { lastReadAt: at },
        }),
      ),
    );
    // as outras conexões da conta zeram o rail e a coluna junto (ver `channel.read`)
    this.realtime.emitToUser(user.sub, WS_EVENTS.CHANNEL_READ, {
      channelIds: doServidor,
      lastReadAt: at.toISOString(),
      guildId,
    } satisfies ChannelReadEvent);
    return { guildId, channelIds: doServidor, lastReadAt: at.toISOString() };
  }
}
