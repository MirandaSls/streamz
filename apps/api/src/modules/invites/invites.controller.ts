import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, Min } from "class-validator";
import { InvitesService } from "./invites.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import {
  INVITE_CREATE_THROTTLE,
  INVITE_PREVIEW_THROTTLE,
} from "../../common/throttle";

class CreateInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInHours?: number;
}

@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @UseGuards(JwtGuard)
  @INVITE_CREATE_THROTTLE
  @Post("guilds/:guildId/invites")
  create(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.create(user.sub, guildId, dto);
  }

  @UseGuards(JwtGuard)
  @Get("guilds/:guildId/invites")
  list(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.invites.list(user.sub, guildId);
  }

  @UseGuards(JwtGuard)
  @Delete("guilds/:guildId/invites/:code")
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("code") code: string,
  ) {
    return this.invites.revoke(user.sub, guildId, code);
  }

  /** Prévia pública: a tela de "entrar no servidor" abre sem estar logado. */
  @INVITE_PREVIEW_THROTTLE
  @Get("invites/:code")
  preview(@Param("code") code: string) {
    return this.invites.preview(code);
  }

  @UseGuards(JwtGuard)
  @Post("invites/:code/redeem")
  redeem(@CurrentUser() user: JwtPayload, @Param("code") code: string) {
    return this.invites.redeem(user.sub, code);
  }
}
