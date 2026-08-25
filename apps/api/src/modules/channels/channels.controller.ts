import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { ChannelsService } from "./channels.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { GUILD_CHANNEL_TYPES } from "@newdisc/shared";
import type { GuildChannelType } from "@newdisc/shared";

class CreateChannelDto {
  @IsString()
  @Length(1, 64)
  name!: string;

  @IsIn(GUILD_CHANNEL_TYPES)
  type!: GuildChannelType;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}

class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;
}

class ChannelMemberDto {
  @IsString()
  userId!: string;
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
    return this.channels.create(user.sub, guildId, dto.name, dto.type, {
      isPrivate: dto.isPrivate,
      readOnly: dto.readOnly,
      memberIds: dto.memberIds,
    });
  }

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.channels.listForGuild(user.sub, guildId);
  }

  @Patch(":channelId")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("channelId") channelId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channels.update(user.sub, guildId, channelId, dto);
  }

  @Delete(":channelId")
  remove(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("channelId") channelId: string,
  ) {
    return this.channels.remove(user.sub, guildId, channelId);
  }

  @Get(":channelId/members")
  members(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("channelId") channelId: string,
  ) {
    return this.channels.listMembers(user.sub, guildId, channelId);
  }

  @Post(":channelId/members")
  addMember(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("channelId") channelId: string,
    @Body() dto: ChannelMemberDto,
  ) {
    return this.channels.addMember(user.sub, guildId, channelId, dto.userId);
  }

  @Delete(":channelId/members/:userId")
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("channelId") channelId: string,
    @Param("userId") userId: string,
  ) {
    return this.channels.removeMember(user.sub, guildId, channelId, userId);
  }
}
