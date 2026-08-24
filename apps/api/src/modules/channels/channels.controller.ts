import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsString, Length } from "class-validator";
import { ChannelsService } from "./channels.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import type { ChannelType } from "@newdisc/shared";

class CreateChannelDto {
  @IsString()
  @Length(1, 64)
  name!: string;

  @IsIn(["TEXT", "VOICE"])
  type!: ChannelType;
}

@UseGuards(JwtGuard)
@Controller("guilds/:guildId/channels")
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channels.create(user.sub, guildId, dto.name, dto.type);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.channels.listForGuild(user.sub, guildId);
  }
}
