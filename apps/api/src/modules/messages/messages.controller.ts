import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { MessagesService } from "./messages.service";
import { JwtGuard } from "../../common/jwt.guard";

@UseGuards(JwtGuard)
@Controller("channels/:channelId/messages")
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  history(
    @Param("channelId") channelId: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.messages.history(channelId, cursor);
  }

  @Get("search")
  search(
    @Param("channelId") channelId: string,
    @Query("q") q: string,
  ) {
    return this.messages.search(channelId, q ?? "");
  }
}
