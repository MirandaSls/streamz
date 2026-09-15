import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { MAX_SOUNDBOARD_SIZE } from "@streamz/shared";
import { SoundboardService } from "./soundboard.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { UPLOAD_THROTTLE } from "../../common/throttle";

/** Corpo de `POST /voice/channels/:channelId/soundboard/play`. */
class TocarSomDto {
  @IsString()
  @Length(1, 64)
  soundId!: string;
}

@Controller()
export class SoundboardController {
  constructor(private readonly soundboard: SoundboardService) {}

  /** Sons de todos os servidores do usuário — é o que o painel consome. */
  @UseGuards(JwtGuard)
  @Get("soundboard")
  mine(@CurrentUser() user: JwtPayload) {
    return this.soundboard.listForUser(user.sub);
  }

  @UseGuards(JwtGuard)
  @Get("guilds/:guildId/soundboard")
  list(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.soundboard.listForGuild(user.sub, guildId);
  }

  /**
   * Envio do som: `multipart/form-data` com o arquivo em `file`, o nome em
   * `name`, o emoji (opcional) em `emoji` e o volume de referência (opcional,
   * texto de "0" a "1") em `volume` — o "Volume do som" do modal, que já existia
   * no contrato (`SoundboardSound.volume`) e na coluna, mas não tinha por onde
   * entrar. Chega como `unknown` porque multipart só carrega texto; quem
   * converte e valida é `volumeDoEnvio` (`dto.ts`). O limite do multer é o
   * mesmo do contrato — quem passa dele leva 413 antes de o arquivo terminar de
   * subir.
   *
   * A **duração** não é conferida aqui (não há decodificador de áudio na API):
   * quem mede é o cliente, antes de enviar. Ver `soundboard/audio.ts`.
   */
  @UseGuards(JwtGuard)
  @UPLOAD_THROTTLE
  @Post("guilds/:guildId/soundboard")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_SOUNDBOARD_SIZE } }))
  create(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body("name") name: string,
    @Body("emoji") emoji: string,
    @Body("volume") volume: unknown,
    @UploadedFile() file: { buffer: Buffer; size: number },
  ) {
    return this.soundboard.create(user.sub, guildId, name, emoji, file, volume);
  }

  @UseGuards(JwtGuard)
  @Delete("guilds/:guildId/soundboard/:id")
  remove(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("id") id: string,
  ) {
    return this.soundboard.remove(user.sub, guildId, id);
  }

  /**
   * Toca um som para quem está na chamada daquele canal.
   *
   * REST e não evento de socket pelo mesmo motivo do `voice/move`: a ação pode
   * ser recusada (não está na chamada, som de outro servidor, um por segundo) e
   * quem apertou precisa saber, para mostrar o aviso em vez de ficar achando
   * que o som saiu. Quem toca de fato é o evento `soundboard.play`, que vai para
   * todo mundo da sala — inclusive para quem apertou.
   */
  @UseGuards(JwtGuard)
  @Post("voice/channels/:channelId/soundboard/play")
  play(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Body() dto: TocarSomDto,
  ) {
    return this.soundboard.play(user.sub, channelId, dto.soundId);
  }

  /**
   * Áudio do som: público, como a imagem do emoji. Quem aperta o botão faz a
   * sala inteira baixar o arquivo, e parte dela pode não ser do servidor de
   * origem. Ver `SoundboardService.audioStream`.
   */
  @SkipThrottle()
  @Get("soundboard/:id/audio")
  async audio(@Param("id") id: string, @Res() res: ServerResponse) {
    const { body, contentType } = await this.soundboard.audioStream(id);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    // o arquivo de um id nunca muda (não há renomear que mova o objeto)
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    body.on("error", () => res.destroy());
    body.pipe(res);
  }
}
