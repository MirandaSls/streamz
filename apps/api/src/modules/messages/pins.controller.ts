import { Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { PinsService } from "./pins.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

/** Mensagens fixadas de um canal (serve canal de servidor e conversa direta). */
@UseGuards(JwtGuard)
@Controller("channels/:channelId/pins")
export class PinsController {
  constructor(private readonly pins: PinsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param("channelId") channelId: string) {
    return this.pins.list(channelId, user.sub);
  }

  // idempotente: fixar duas vezes é a mesma coisa que fixar uma
  @Post(":messageId")
  pin(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.pins.pin(channelId, user.sub, messageId);
  }

  @Delete(":messageId")
  unpin(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.pins.unpin(channelId, user.sub, messageId);
  }
}
