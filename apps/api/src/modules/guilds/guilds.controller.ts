import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, Length } from "class-validator";
import { GuildsService } from "./guilds.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

class CreateGuildDto {
  @IsString()
  @Length(2, 64)
  name!: string;
}

class KickDto {
  @IsString()
  userId!: string;
}

class BanDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  reason?: string;
}

@UseGuards(JwtGuard)
@Controller("guilds")
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateGuildDto) {
    return this.guilds.create(user.sub, dto.name);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.guilds.listForUser(user.sub);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.getWithChannels(user.sub, id);
  }

  @Get(":id/members")
  members(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.listMembers(user.sub, id);
  }

  @Post(":id/kick")
  kick(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: KickDto,
  ) {
    return this.guilds.kick(user.sub, id, dto.userId);
  }

  @Post(":id/ban")
  ban(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: BanDto,
  ) {
    return this.guilds.ban(user.sub, id, dto.userId, dto.reason);
  }

  @Get(":id/bans")
  bans(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.listBans(user.sub, id);
  }

  @Delete(":id/bans/:userId")
  unban(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.guilds.unban(user.sub, id, userId);
  }
}
