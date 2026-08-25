import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import type { Attachment as AttachmentDTO } from "@newdisc/shared";
import { MAX_ATTACHMENT_SIZE } from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { GuildsService } from "../guilds/guilds.service";
import { sniffImage, sanitizeFilename } from "./media";

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly guilds: GuildsService,
    private readonly jwt: JwtService,
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

  /**
   * Autoriza a leitura pelo proxy (`GET /uploads/file/:id`) e devolve o anexo.
   *
   * Dois caminhos, ambos exigindo prova de autorização — o id do anexo sozinho
   * nunca basta (era o furo: cuid vazado dava acesso a canal privado):
   *  - `?t=` — token curto assinado pela API para AQUELE anexo, emitido só a
   *    quem já passou pela autorização ao montar o DTO da mensagem. É o que faz
   *    `<img src>` funcionar, já que o browser não manda `Authorization`.
   *  - `Authorization: Bearer <access token>` — reavalia a permissão agora:
   *    anexo vinculado a mensagem → `assertCanViewChannel` do canal dela;
   *    anexo ainda solto → só o próprio uploader.
   */
  async authorizeServe(
    id: string,
    auth: { bearer?: string; queryToken?: string },
  ) {
    const att = await this.prisma.attachment.findUnique({
      where: { id },
      include: { message: { select: { channelId: true } } },
    });
    if (!att) throw new NotFoundException("Anexo não encontrado");

    if (auth.queryToken && this.storage.verifyAttachmentToken(auth.queryToken) === id) {
      return att;
    }

    const userId = auth.bearer ? this.verifyBearer(auth.bearer) : null;
    if (!userId) throw new UnauthorizedException("Token ausente ou inválido");

    if (att.message) {
      await this.guilds.assertCanViewChannel(userId, att.message.channelId);
    } else if (att.uploaderId !== userId) {
      throw new ForbiddenException("Anexo não vinculado a nenhuma mensagem sua");
    }
    return att;
  }

  /** Valida o access token do header e devolve o id do usuário (ou null). */
  private verifyBearer(token: string): string | null {
    try {
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: process.env.JWT_SECRET,
      });
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }

  async toDTO(a: {
    id: string;
    key: string;
    filename: string;
    contentType: string;
    size: number;
    width: number | null;
    height: number | null;
  }): Promise<AttachmentDTO> {
    return {
      id: a.id,
      url: await this.storage.attachmentUrl(a.id, a.key),
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      width: a.width,
      height: a.height,
    };
  }
}
