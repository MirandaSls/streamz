import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { parseSearchQuery } from "@newdisc/shared";
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
    return this.messages.search(channelId, user.sub, parseSearchQuery(q ?? ""));
  }

  /** Janela em torno de uma mensagem — o "ir para a mensagem" do cliente. */
  @Get("around/:messageId")
  around(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.messages.around(channelId, user.sub, messageId);
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

/** Busca no servidor inteiro, respeitando os canais que o usuário enxerga. */
@UseGuards(JwtGuard)
@Controller("guilds/:guildId/messages")
export class GuildMessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get("search")
  search(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Query("q") q: string,
  ) {
    return this.messages.searchGuild(guildId, user.sub, parseSearchQuery(q ?? ""));
  }
}
