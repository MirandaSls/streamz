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
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ChannelsService } from "./channels.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import {
  GUILD_CHANNEL_TYPES,
  MAX_CHANNEL_TOPIC,
  MAX_SLOWMODE_SECONDS,
} from "@streamz/shared";
import type { GuildChannelType } from "@streamz/shared";

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

  @IsOptional()
  @IsString()
  categoryId?: string | null;
}

class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;

  // string vazia limpa o tópico (o service normaliza para null)
  @IsOptional()
  @IsString()
  @Length(0, MAX_CHANNEL_TOPIC)
  topic?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SLOWMODE_SECONDS)
  slowmodeSeconds?: number;

  @IsOptional()
  @IsBoolean()
  nsfw?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @IsString()
  categoryId?: string | null;
}

/** Uma linha da reordenação em lote: canal, posição e categoria de destino. */
class ChannelPositionDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  position!: number;

  // null = tirar da categoria (o canal sobe para o topo da lista)
  @IsOptional()
  @IsString()
  categoryId?: string | null;
}

class CategoryPositionDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  position!: number;
}

class ReorderDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelPositionDto)
  channels?: ChannelPositionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryPositionDto)
  categories?: CategoryPositionDto[];
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
      categoryId: dto.categoryId,
    });
  }

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.channels.listForGuild(user.sub, guildId);
  }

  /**
   * Reordenação em lote (arrastar-e-soltar). Declarada **antes** de
   * `PATCH :channelId` porque o Nest casa as rotas na ordem de declaração —
   * invertidas, "positions" seria lido como um id de canal.
   */
  @Patch("positions")
  reorder(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.channels.reorder(user.sub, guildId, {
      channels: dto.channels?.map((c) => ({
        id: c.id,
        position: c.position,
        categoryId: c.categoryId ?? null,
      })),
      categories: dto.categories,
    });
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
