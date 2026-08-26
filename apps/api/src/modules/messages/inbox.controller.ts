import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { InboxService } from "./inbox.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

/** Caixa de entrada do usuário: menções não lidas e canais com novidade. */
@UseGuards(JwtGuard)
@Controller("me")
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get("mentions")
  mentions(@CurrentUser() user: JwtPayload, @Query("limit") limit?: string) {
    const n = Number(limit);
    return this.inbox.mentions(
      user.sub,
      user.username,
      Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 25,
    );
  }

  @Get("unread")
  unread(@CurrentUser() user: JwtPayload) {
    return this.inbox.unread(user.sub, user.username);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.inbox.markAllRead(user.sub);
  }
}
