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
import type { Attachment as AttachmentDTO, ExternalAttachmentInput } from "@streamz/shared";
import { MAX_ATTACHMENT_SIZE, externalAttachmentSchema } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { GuildsService } from "../guilds/guilds.service";
import { sniffImage, sanitizeFilename } from "./media";
import { toAttachmentDTO, type AttachmentRow } from "./attachment-dto";

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
   * Anexo por **URL externa** — o GIF escolhido no seletor.
   *
   * O arquivo não passa pelo nosso storage: o provedor já o serve, e copiar o
   * GIF para o bucket a cada envio custaria banda e espaço sem ganho nenhum
   * (é assim que o Discord trata o GIF do Tenor). Por isso este caminho
   * funciona mesmo sem R2 configurado.
   *
   * Só o domínio do provedor é aceito: sem essa trava, a rota viraria um jeito
   * de fazer qualquer mensagem carregar uma URL arbitrária como se fosse anexo
   * validado por nós — inclusive apontando para a rede interna.
   */
  async createExternal(
    uploaderId: string,
    input: ExternalAttachmentInput,
  ): Promise<AttachmentDTO> {
    const parsed = externalAttachmentSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Anexo externo inválido");
    }
    const { url, filename, width, height } = parsed.data;
    if (!hostDeGifPermitido(url)) {
      throw new BadRequestException("Só GIFs do provedor de busca podem ser anexados por URL");
    }

    const row = await this.prisma.attachment.create({
      data: {
        uploaderId,
        // não há objeto no bucket; a chave existe só para manter a coluna única
        key: `external/${randomUUID()}`,
        externalUrl: url,
        filename: sanitizeFilename(filename),
        contentType: "image/gif",
        size: 0,
        width: width ?? null,
        height: height ?? null,
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
    // A prova vem antes da consulta: sem ela, responder 404 x 401 já contaria a
    // um anônimo quais ids de anexo existem.
    const porToken =
      !!auth.queryToken && this.storage.verifyAttachmentToken(auth.queryToken) === id;
    const userId = porToken ? null : auth.bearer ? this.verifyBearer(auth.bearer) : null;
    if (!porToken && !userId) {
      throw new UnauthorizedException("Token ausente ou inválido");
    }

    const att = await this.prisma.attachment.findUnique({
      where: { id },
      include: { message: { select: { channelId: true } } },
    });
    if (!att) throw new NotFoundException("Anexo não encontrado");
    if (porToken) return att;

    if (att.message) {
      await this.guilds.assertCanViewChannel(userId!, att.message.channelId);
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

  async toDTO(a: AttachmentRow): Promise<AttachmentDTO> {
    return toAttachmentDTO(this.storage, a);
  }
}

/** Domínios do provedor de GIF (Tenor) que podem virar anexo por URL. */
const HOSTS_DE_GIF = ["media.tenor.com", "c.tenor.com", "media1.tenor.com", "tenor.com"];

/** true se a URL é https e o host é um dos do provedor (ou subdomínio dele). */
export function hostDeGifPermitido(url: string): boolean {
  const m = url.match(/^https:\/\/([^/?#]+)/i);
  if (!m) return false;
  const host = m[1].toLowerCase().replace(/:\d+$/, "");
  return HOSTS_DE_GIF.some((h) => host === h || host.endsWith(`.${h}`));
}
