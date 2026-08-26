import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import type { GuildReadResult } from "@newdisc/shared";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";

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
    return { guildId, channelIds: doServidor, lastReadAt: at.toISOString() };
  }
}
