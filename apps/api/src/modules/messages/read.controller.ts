import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { WS_EVENTS, type ChannelReadEvent } from "@streamz/shared";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { GuildsService } from "../guilds/guilds.service";
import { ReadStateService } from "../read-state/read-state.service";
import { RealtimeService } from "../realtime/realtime.service";

/** "Li até agora": o cliente chama ao abrir o canal e a cada mensagem nova vista. */
@UseGuards(JwtGuard)
@Controller("channels/:channelId")
export class ReadController {
  constructor(
    private readonly guilds: GuildsService,
    private readonly readState: ReadStateService,
    private readonly realtime: RealtimeService,
  ) {}

  @Post("read")
  async markRead(@CurrentUser() user: JwtPayload, @Param("channelId") channelId: string) {
    const acesso = await this.guilds.assertCanViewChannel(user.sub, channelId);
    const at = await this.readState.markRead(user.sub, channelId);
    // ler num aparelho apaga o badge no outro: leitura é da conta, não da aba
    this.realtime.emitToUser(user.sub, WS_EVENTS.CHANNEL_READ, {
      channelIds: [channelId],
      lastReadAt: at.toISOString(),
      guildId: acesso.channel.guildId,
    } satisfies ChannelReadEvent);
    return { channelId, lastReadAt: at.toISOString() };
  }
}
