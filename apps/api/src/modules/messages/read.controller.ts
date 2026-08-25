import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { GuildsService } from "../guilds/guilds.service";
import { ReadStateService } from "../read-state/read-state.service";

/** "Li até agora": o cliente chama ao abrir o canal e a cada mensagem nova vista. */
@UseGuards(JwtGuard)
@Controller("channels/:channelId")
export class ReadController {
  constructor(
    private readonly guilds: GuildsService,
    private readonly readState: ReadStateService,
  ) {}

  @Post("read")
  async markRead(@CurrentUser() user: JwtPayload, @Param("channelId") channelId: string) {
    await this.guilds.assertCanViewChannel(user.sub, channelId);
    const at = await this.readState.markRead(user.sub, channelId);
    return { channelId, lastReadAt: at.toISOString() };
  }
}
