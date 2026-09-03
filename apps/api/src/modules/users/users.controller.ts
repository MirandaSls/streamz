import {
  Body,
  Controller,
  Delete,
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
import { IsHexColor, IsIn, IsOptional, IsString, Length } from "class-validator";
import type { ServerResponse } from "node:http";
import {
  MAX_ABOUT_ME,
  MAX_AVATAR_SIZE,
  MAX_BANNER_SIZE,
  maxUploadDeImagemDePerfil,
  MAX_CUSTOM_STATUS,
  MAX_DISPLAY_NAME,
  MAX_PRONOUNS,
} from "@streamz/shared";
import type { CustomStatusDuration, UserStatus } from "@streamz/shared";
import { UsersService } from "./users.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { UPLOAD_THROTTLE } from "../../common/throttle";

class ProfileDto {
  @IsOptional()
  @IsString()
  @Length(0, MAX_DISPLAY_NAME)
  displayName?: string | null;

  // ── d-social ── perfil rico
  @IsOptional()
  @IsString()
  @Length(0, MAX_ABOUT_ME)
  aboutMe?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, MAX_PRONOUNS)
  pronouns?: string | null;

  // string vazia limpa a cor; qualquer outro valor precisa ser hex
  @IsOptional()
  @IsHexColor({ message: "A cor do perfil precisa estar no formato #rrggbb" })
  bannerColor?: string | null;
}

const DURATIONS: CustomStatusDuration[] = ["never", "1h", "4h", "today", "week"];

class CustomStatusDto {
  @IsOptional()
  @IsString()
  @Length(0, MAX_CUSTOM_STATUS)
  text?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  emoji?: string | null;

  @IsIn(DURATIONS)
  duration!: CustomStatusDuration;
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
    return this.users.updateProfile(user.sub, {
      displayName: dto.displayName,
      aboutMe: dto.aboutMe,
      pronouns: dto.pronouns,
      bannerColor: dto.bannerColor,
    });
  }

  // ── d-social ──

  /** Status personalizado (texto + emoji + prazo). */
  @UseGuards(JwtGuard)
  @Patch("me/custom-status")
  updateCustomStatus(@CurrentUser() user: JwtPayload, @Body() dto: CustomStatusDto) {
    return this.users.updateCustomStatus(user.sub, {
      text: dto.text ?? null,
      emoji: dto.emoji ?? null,
      duration: dto.duration,
    });
  }

  @UseGuards(JwtGuard)
  @UPLOAD_THROTTLE
  @Post("me/banner")
  // o teto do multer é o do maior formato (GIF, 8 MB); qual limite vale para
  // este arquivo é decisão do service, que já olhou os bytes
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: maxUploadDeImagemDePerfil(MAX_BANNER_SIZE) },
    }),
  )
  updateBanner(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: { buffer: Buffer; size: number },
  ) {
    return this.users.updateBanner(user.sub, file);
  }

  @UseGuards(JwtGuard)
  @Delete("me/banner")
  removeBanner(@CurrentUser() user: JwtPayload) {
    return this.users.removeBanner(user.sub);
  }

  /**
   * Perfil completo de alguém, na minha visão (amigos e servidores em comum,
   * relação). `guildId` diz de qual servidor o cartão foi aberto.
   */
  @UseGuards(JwtGuard)
  @Get(":id/profile")
  profile(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Query("guildId") guildId?: string,
  ) {
    return this.users.profile(user.sub, id, guildId || undefined);
  }

  /** Banner é público como o avatar: `<img src>` não manda token. */
  @SkipThrottle()
  @Get(":id/banner")
  async banner(@Param("id") id: string, @Res() res: ServerResponse) {
    const { body, contentType } = await this.users.bannerStream(id);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    body.on("error", () => res.destroy());
    body.pipe(res);
  }

  @UseGuards(JwtGuard)
  @Patch("me/status")
  updateStatus(@CurrentUser() user: JwtPayload, @Body() dto: StatusDto) {
    return this.users.updateStatus(user.sub, dto.manualStatus ?? null);
  }

  @UseGuards(JwtGuard)
  @UPLOAD_THROTTLE
  @Post("me/avatar")
  // idem ao banner: multer no teto do GIF, limite fino no service
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: maxUploadDeImagemDePerfil(MAX_AVATAR_SIZE) },
    }),
  )
  updateAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: { buffer: Buffer; size: number },
  ) {
    return this.users.updateAvatar(user.sub, file);
  }

  @UseGuards(JwtGuard)
  @Delete("me/avatar")
  removeAvatar(@CurrentUser() user: JwtPayload) {
    return this.users.removeAvatar(user.sub);
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
