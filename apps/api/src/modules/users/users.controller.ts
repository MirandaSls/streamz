import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import { IsIn, IsOptional, IsString, Length } from "class-validator";
import type { ServerResponse } from "node:http";
import { MAX_AVATAR_SIZE, MAX_DISPLAY_NAME } from "@newdisc/shared";
import type { UserStatus } from "@newdisc/shared";
import { UsersService } from "./users.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { UPLOAD_THROTTLE } from "../../common/throttle";

class ProfileDto {
  @IsOptional()
  @IsString()
  @Length(0, MAX_DISPLAY_NAME)
  displayName?: string | null;
}

const STATUSES: UserStatus[] = ["ONLINE", "IDLE", "DND", "OFFLINE"];

class StatusDto {
  // null = automático; OFFLINE = invisível
  @IsOptional()
  @IsIn(STATUSES)
  manualStatus!: UserStatus | null;
}

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtGuard)
  @Get("me")
  me(@CurrentUser() user: JwtPayload) {
    return this.users.getPublic(user.sub);
  }

  @UseGuards(JwtGuard)
  @Patch("me")
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: ProfileDto) {
    return this.users.updateProfile(user.sub, { displayName: dto.displayName });
  }

  @UseGuards(JwtGuard)
  @Patch("me/status")
  updateStatus(@CurrentUser() user: JwtPayload, @Body() dto: StatusDto) {
    return this.users.updateStatus(user.sub, dto.manualStatus ?? null);
  }

  @UseGuards(JwtGuard)
  @UPLOAD_THROTTLE
  @Post("me/avatar")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_AVATAR_SIZE } }))
  updateAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: { buffer: Buffer; size: number },
  ) {
    return this.users.updateAvatar(user.sub, file);
  }

  /** Busca de usuário para abrir DM / montar grupo (mín. 2 caracteres). */
  @UseGuards(JwtGuard)
  @Get("search")
  search(@CurrentUser() user: JwtPayload, @Query("q") q: string) {
    return this.users.search(user.sub, q ?? "");
  }

  /** Avatar é público, como no Discord: `<img src>` não manda token. */
  @SkipThrottle()
  @Get(":id/avatar")
  async avatar(@Param("id") id: string, @Res() res: ServerResponse) {
    const { body, contentType } = await this.users.avatarStream(id);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    body.on("error", () => res.destroy());
    body.pipe(res);
  }
}
