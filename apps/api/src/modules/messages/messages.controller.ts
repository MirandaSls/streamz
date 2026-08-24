import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { MessagesService } from "./messages.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

@UseGuards(JwtGuard)
@Controller("channels/:channelId/messages")
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  history(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.messages.history(channelId, user.sub, cursor);
  }

  @Get("search")
  search(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Query("q") q: string,
  ) {
    return this.messages.search(channelId, user.sub, q ?? "");
  }

  @Get(":messageId/thread")
  thread(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.messages.thread(channelId, user.sub, messageId);
  }
}
