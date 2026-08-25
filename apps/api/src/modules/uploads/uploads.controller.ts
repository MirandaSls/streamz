import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { ServerResponse } from "node:http";
import { MAX_ATTACHMENT_SIZE } from "@newdisc/shared";
import { UploadsService } from "./uploads.service";
import { StorageService } from "../storage/storage.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

@Controller("uploads")
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly storage: StorageService,
  ) {}

  /** Envia um arquivo e devolve o anexo (ainda não vinculado a mensagem). */
  @Post()
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
   * Proxy de leitura por id (público — o cuid não é adivinhável). Usado quando
   * o bucket não tem base pública configurada. Nunca servimos com content-type
   * "confiável" que possa executar no browser.
   */
  @Get("file/:id")
  async serve(@Param("id") id: string, @Res() res: ServerResponse) {
    const att = await this.uploads.findForServe(id);
    if (!att) throw new NotFoundException("Anexo não encontrado");

    const isImage = att.contentType.startsWith("image/");
    // headers setados na mão: com @Res() os decorators @Header são ignorados
    res.setHeader("Content-Type", att.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader(
      "Content-Disposition",
      `${isImage ? "inline" : "attachment"}; filename="${att.filename}"`,
    );

    const body = await this.storage.get(att.key);
    body.on("error", () => res.destroy());
    body.pipe(res);
  }
}
