import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_ATTACHMENT_SIZE } from "@newdisc/shared";
import { UploadsService } from "./uploads.service";
import { StorageService } from "../storage/storage.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { UPLOAD_THROTTLE } from "../../common/throttle";

@Controller("uploads")
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
  ) {}

  /** Envia um arquivo e devolve o anexo (ainda não vinculado a mensagem). */
  @Post()
  @UPLOAD_THROTTLE
  @UseGuards(JwtGuard)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_ATTACHMENT_SIZE } }),
  )
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: { originalname: string; buffer: Buffer; size: number },
  ) {
    return this.uploads.upload(user.sub, file);
  }

  /**
   * Proxy de leitura — fallback para quando não há URL assinada do R2 (ver o
   * comentário em StorageService.attachmentUrl). Nunca é público: exige o token
   * curto `?t=` daquele anexo ou um `Authorization: Bearer` com permissão de
   * ver o canal da mensagem. Servimos sempre com `nosniff`.
   *
   * Não usa `@UseGuards(JwtGuard)` porque o caminho normal (`<img src>`) não
   * manda header algum — a autorização é feita no service, que aceita as duas
   * formas de prova.
   */
  // uma tela de canal pode pedir dezenas de imagens de uma vez; o teto global
  // por IP não faz sentido aqui — a autorização é que protege esta rota
  @SkipThrottle()
  @Get("file/:id")
  async serve(
    @Param("id") id: string,
    @Query("t") queryToken: string | undefined,
    @Req() req: IncomingMessage,
    @Res() res: ServerResponse,
  ) {
    const header = req.headers?.authorization;
    const att = await this.uploads.authorizeServe(id, {
      bearer: header?.startsWith("Bearer ") ? header.slice(7) : undefined,
      queryToken,
    });

    const isImage = att.contentType.startsWith("image/");
    // headers setados na mão: com @Res() os decorators @Header são ignorados
    res.setHeader("Content-Type", att.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    // "private": a resposta depende de quem pediu, não pode virar cache compartilhado
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader(
      "Content-Disposition",
      `${isImage ? "inline" : "attachment"}; filename="${att.filename}"`,
    );

    const body = await this.storage.get(att.key);
    body.on("error", () => res.destroy());
    body.pipe(res);
  }
}
