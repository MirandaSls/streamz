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
import { IsIn, IsOptional, IsString, Length } from "class-validator";
import type { MemberRole } from "@newdisc/shared";
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

class RoleDto {
  // OWNER não é atribuível por aqui — não existe transferência de posse no MVP
  @IsIn(["ADMIN", "MEMBER"])
  role!: Extract<MemberRole, "ADMIN" | "MEMBER">;
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
    return this.guilds.listForUser(user.sub, user.username);
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.getWithChannels(user.sub, id, user.username);
  }

  /** Sair do servidor (o dono não sai — apaga). */
  @Post(":id/leave")
  leave(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.leave(user.sub, id);
  }

  /** Apagar o servidor (só o dono). */
  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.remove(user.sub, id);
  }

  @Get(":id/members")
  members(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.listMembers(user.sub, id);
  }

  /** Promover a ADMIN / rebaixar a MEMBER (só o dono). */
  @Patch(":id/members/:userId/role")
  setRole(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() dto: RoleDto,
  ) {
    return this.guilds.setRole(user.sub, id, userId, dto.role);
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
