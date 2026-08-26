import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString, Min } from "class-validator";
import { InvitesService } from "./invites.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { OptionalJwtGuard } from "../../common/optional-jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import {
  INVITE_CREATE_THROTTLE,
  INVITE_PREVIEW_THROTTLE,
} from "../../common/throttle";

class CreateInviteDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUses?: number;

  /** minutos até expirar; `0` = nunca expira (última opção do seletor). */
  @IsOptional()
  @IsInt()
  @Min(0)
  expiresInMinutes?: number;

  @IsOptional()
  @IsBoolean()
  temporary?: boolean;

  @IsOptional()
  @IsString()
  channelId?: string | null;
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

  /**
   * Prévia pública: a página `/invite/:code` abre sem estar logado. Com token
   * válido a resposta também diz se o visitante já é membro.
   */
  @UseGuards(OptionalJwtGuard)
  @INVITE_PREVIEW_THROTTLE
  @Get("invites/:code")
  preview(@CurrentUser() user: JwtPayload | undefined, @Param("code") code: string) {
    return this.invites.preview(code, user?.sub);
  }

  @UseGuards(JwtGuard)
  @Post("invites/:code/redeem")
  redeem(@CurrentUser() user: JwtPayload, @Param("code") code: string) {
    return this.invites.redeem(user.sub, code);
  }
}
