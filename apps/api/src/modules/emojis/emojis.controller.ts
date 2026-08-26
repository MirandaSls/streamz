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
import { IsString, Length } from "class-validator";
import type { ServerResponse } from "node:http";
import { MAX_CUSTOM_EMOJI_SIZE } from "@streamz/shared";
import { EmojisService } from "./emojis.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { UPLOAD_THROTTLE } from "../../common/throttle";

class NomeDto {
  @IsString()
  @Length(2, 32)
  name!: string;
}

@Controller()
export class EmojisController {
  constructor(private readonly emojis: EmojisService) {}

  /** Emojis de todos os servidores do usuário — é o que o seletor consome. */
  @UseGuards(JwtGuard)
  @Get("emojis")
  mine(@CurrentUser() user: JwtPayload) {
    return this.emojis.listForUser(user.sub);
  }

  @UseGuards(JwtGuard)
  @Get("guilds/:guildId/emojis")
  list(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.emojis.listForGuild(user.sub, guildId);
  }

  /**
   * Envio do emoji: `multipart/form-data` com o arquivo em `file` e o nome em
   * `name`. O limite do multer é o mesmo do contrato — quem passa dele leva
   * 413 antes de o arquivo terminar de subir.
   */
  @UseGuards(JwtGuard)
  @UPLOAD_THROTTLE
  @Post("guilds/:guildId/emojis")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_CUSTOM_EMOJI_SIZE } }))
  create(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body("name") name: string,
    @UploadedFile() file: { buffer: Buffer; size: number },
  ) {
    return this.emojis.create(user.sub, guildId, name, file);
  }

  @UseGuards(JwtGuard)
  @Patch("guilds/:guildId/emojis/:id")
  rename(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("id") id: string,
    @Body() dto: NomeDto,
  ) {
    return this.emojis.rename(user.sub, guildId, id, dto.name);
  }

  @UseGuards(JwtGuard)
  @Delete("guilds/:guildId/emojis/:id")
  remove(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("id") id: string,
  ) {
    return this.emojis.remove(user.sub, guildId, id);
  }

  /**
   * Imagem do emoji: pública, como o avatar. Uma mensagem com `<:nome:id>` é
   * lida por quem nunca entrou no servidor de origem; sem isso o emoji viraria
   * um quadrado quebrado. Ver EmojisService.imageStream.
   */
  @SkipThrottle()
  @Get("emojis/:id/image")
  async image(@Param("id") id: string, @Res() res: ServerResponse) {
    const { body, contentType } = await this.emojis.imageStream(id);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    // a imagem de um id nunca muda (renomear não troca o objeto)
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    body.on("error", () => res.destroy());
    body.pipe(res);
  }
}
