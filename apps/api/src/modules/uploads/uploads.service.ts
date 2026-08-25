import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Attachment as AttachmentDTO } from "@newdisc/shared";
import { MAX_ATTACHMENT_SIZE } from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { sniffImage, sanitizeFilename } from "./media";

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Valida, envia ao R2 e registra o anexo (ainda sem mensagem). O envio da
   * mensagem vincula depois, por id (ver MessagesService.create).
   */
  async upload(
    uploaderId: string,
    file: { originalname: string; buffer: Buffer; size: number },
  ): Promise<AttachmentDTO> {
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        "Armazenamento (R2) não configurado. Ver PENDENCIAS.md.",
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException("Arquivo vazio");
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      throw new PayloadTooLargeException(
        `Arquivo excede o limite de ${Math.floor(MAX_ATTACHMENT_SIZE / 1024 / 1024)} MB`,
      );
    }

    const filename = sanitizeFilename(file.originalname);
    // content-type derivado dos bytes (imagem reconhecida) ou binário genérico
    const image = sniffImage(file.buffer);
    const contentType = image?.mime ?? "application/octet-stream";

    // segmento único da chave no bucket (independente do id do registro)
    const key = `attachments/${randomUUID()}/${filename}`;
    await this.storage.put(key, file.buffer, contentType);

    const row = await this.prisma.attachment.create({
      data: {
        uploaderId,
        key,
        filename,
        contentType,
        size: file.size,
        width: image?.width ?? null,
        height: image?.height ?? null,
      },
    });
    return this.toDTO(row);
  }

  /** Metadados do anexo para o proxy de leitura. */
  async findForServe(id: string) {
    return this.prisma.attachment.findUnique({ where: { id } });
  }

  toDTO(a: {
    id: string;
    key: string;
    filename: string;
    contentType: string;
    size: number;
    width: number | null;
    height: number | null;
  }): AttachmentDTO {
    return {
      id: a.id,
      url: this.storage.publicUrl(a.id, a.key),
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      width: a.width,
      height: a.height,
    };
  }
}
