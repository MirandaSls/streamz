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
import { IsOptional, IsString, Length } from "class-validator";
import type { ServerResponse } from "node:http";
import { MAX_STICKER_SIZE } from "@newdisc/shared";
import { StickersService } from "./stickers.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { UPLOAD_THROTTLE } from "../../common/throttle";

class AtualizarFigurinhaDto {
  @IsOptional()
  @IsString()
  @Length(2, 32)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  tags?: string;
}

@Controller()
export class StickersController {
  constructor(private readonly stickers: StickersService) {}

  /** Figurinhas de todos os servidores do usuário (seletor do composer). */
  @UseGuards(JwtGuard)
  @Get("stickers")
  mine(@CurrentUser() user: JwtPayload) {
    return this.stickers.listForUser(user.sub);
  }

  @UseGuards(JwtGuard)
  @Get("guilds/:guildId/stickers")
  list(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.stickers.listForGuild(user.sub, guildId);
  }

  @UseGuards(JwtGuard)
  @UPLOAD_THROTTLE
  @Post("guilds/:guildId/stickers")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_STICKER_SIZE } }))
  create(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body("name") name: string,
    @Body("tags") tags: string,
    @UploadedFile() file: { buffer: Buffer; size: number },
  ) {
    return this.stickers.create(user.sub, guildId, name, tags ?? "", file);
  }

  @UseGuards(JwtGuard)
  @Patch("guilds/:guildId/stickers/:id")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("id") id: string,
    @Body() dto: AtualizarFigurinhaDto,
  ) {
    return this.stickers.update(user.sub, guildId, id, dto);
  }

  @UseGuards(JwtGuard)
  @Delete("guilds/:guildId/stickers/:id")
  remove(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("id") id: string,
  ) {
    return this.stickers.remove(user.sub, guildId, id);
  }

  /** Imagem da figurinha: pública por id, como a do emoji. */
  @SkipThrottle()
  @Get("stickers/:id/image")
  async image(@Param("id") id: string, @Res() res: ServerResponse) {
    const { body, contentType } = await this.stickers.imageStream(id);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    body.on("error", () => res.destroy());
    body.pipe(res);
  }
}
