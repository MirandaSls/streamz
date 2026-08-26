import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import { IsIn, IsOptional, IsString, Length } from "class-validator";
import type { ServerResponse } from "node:http";
import { MAX_GUILD_DESCRIPTION, MAX_GUILD_ICON_SIZE } from "@streamz/shared";
import type { MemberRole } from "@streamz/shared";
import { GuildsService } from "./guilds.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { UPLOAD_THROTTLE } from "../../common/throttle";

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
  // OWNER não vem por aqui: trocar de dono é POST /guilds/:id/transfer
  @IsIn(["ADMIN", "MEMBER"])
  role!: Extract<MemberRole, "ADMIN" | "MEMBER">;
}

class UpdateGuildDto {
  @IsOptional()
  @IsString()
  @Length(2, 64)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, MAX_GUILD_DESCRIPTION)
  description?: string | null;
}

class TransferDto {
  @IsString()
  userId!: string;
}

@Controller("guilds")
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  /** Ícone do servidor é público, como o avatar: `<img src>` não manda token. */
  @SkipThrottle()
  @Get(":id/icon")
  async icon(@Param("id") id: string, @Res() res: ServerResponse) {
    const { body, contentType } = await this.guilds.iconStream(id);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    body.on("error", () => res.destroy());
    body.pipe(res);
  }

  @UseGuards(JwtGuard)
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateGuildDto) {
    return this.guilds.create(user.sub, dto.name);
  }

  @UseGuards(JwtGuard)
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.guilds.listForUser(user.sub, user.username);
  }

  @UseGuards(JwtGuard)
  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.getWithChannels(user.sub, id, user.username);
  }

  /** Sair do servidor (o dono não sai — apaga). */
  @UseGuards(JwtGuard)
  @Post(":id/leave")
  leave(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.leave(user.sub, id);
  }

  /** Nome e descrição do servidor (MANAGE_GUILD). */
  @UseGuards(JwtGuard)
  @Patch(":id")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateGuildDto,
  ) {
    return this.guilds.update(user.sub, id, dto);
  }

  /** Ícone do servidor (MANAGE_GUILD). 503 claro sem R2 configurado. */
  @UseGuards(JwtGuard)
  @UPLOAD_THROTTLE
  @Post(":id/icon")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_GUILD_ICON_SIZE } }))
  updateIcon(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer; size: number },
  ) {
    return this.guilds.updateIcon(user.sub, id, file);
  }

  /** Transferir a posse (só o dono; o antigo dono vira ADMIN). */
  @UseGuards(JwtGuard)
  @Post(":id/transfer")
  transfer(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: TransferDto,
  ) {
    return this.guilds.transferOwnership(user.sub, id, dto.userId);
  }

  /** Apagar o servidor (só o dono). */
  @UseGuards(JwtGuard)
  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.remove(user.sub, id);
  }

  @UseGuards(JwtGuard)
  @Get(":id/members")
  members(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.listMembers(user.sub, id);
  }

  /** Promover a ADMIN / rebaixar a MEMBER (só o dono). */
  @UseGuards(JwtGuard)
  @Patch(":id/members/:userId/role")
  setRole(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() dto: RoleDto,
  ) {
    return this.guilds.setRole(user.sub, id, userId, dto.role);
  }

  @UseGuards(JwtGuard)
  @Post(":id/kick")
  kick(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: KickDto,
  ) {
    return this.guilds.kick(user.sub, id, dto.userId);
  }

  @UseGuards(JwtGuard)
  @Post(":id/ban")
  ban(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: BanDto,
  ) {
    return this.guilds.ban(user.sub, id, dto.userId, dto.reason);
  }

  @UseGuards(JwtGuard)
  @Get(":id/bans")
  bans(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.guilds.listBans(user.sub, id);
  }

  @UseGuards(JwtGuard)
  @Delete(":id/bans/:userId")
  unban(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.guilds.unban(user.sub, id, userId);
  }
}
