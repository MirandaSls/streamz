import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, Min } from "class-validator";
import { InvitesService } from "./invites.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

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

@UseGuards(JwtGuard)
@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post("guilds/:guildId/invites")
  create(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.create(user.sub, guildId, dto);
  }

  @Get("invites/:code")
  preview(@Param("code") code: string) {
    return this.invites.preview(code);
  }

  @Post("invites/:code/redeem")
  redeem(@CurrentUser() user: JwtPayload, @Param("code") code: string) {
    return this.invites.redeem(user.sub, code);
  }
}
