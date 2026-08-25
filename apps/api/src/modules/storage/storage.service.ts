import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { ATTACHMENT_URL_TTL_SECONDS } from "@newdisc/shared";

/** Claims do token curto de leitura de anexo (`?t=` no proxy da API). */
export interface AttachmentTokenClaims {
  /** id do anexo autorizado; o token não vale para nenhum outro. */
  aid: string;
  typ: "attachment";
}

/**
 * Storage de objetos sobre Cloudflare R2 (API compatível com S3).
 *
 * Config por ambiente:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_PUBLIC_BASE_URL  (opcional) — base pública do bucket (r2.dev ou domínio
 *                        próprio). Só use se o bucket for mesmo público.
 *
 * Sem credenciais, `isConfigured()` é false e o UploadsController responde de
 * forma clara (espelha o tratamento de credencial ausente do LiveKit).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  constructor(private readonly jwt: JwtService) {}

  private get bucket(): string {
    return process.env.R2_BUCKET ?? "";
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET,
    );
  }

  private getClient(): S3Client {
    if (this.client) return this.client;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    return this.client;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Corpo do objeto para o proxy de leitura (GET /uploads/file/:id). */
  async get(key: string): Promise<Readable> {
    const out = await this.getClient().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return out.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.getClient()
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch((e) => this.logger.warn(`Falha ao apagar ${key}: ${e}`));
  }

  /**
   * URL de leitura de um anexo, sempre com prazo de validade.
   *
   * Decisão (opção "a" do plano de segurança): a URL padrão é uma **URL
   * assinada do R2** (presigned GET, expira em ATTACHMENT_URL_TTL_SECONDS).
   * O motivo é que `<img src>` no browser não manda header `Authorization` —
   * sem assinatura a única alternativa seria um endpoint público, que era
   * justamente o furo (qualquer um com o id baixava anexo de canal privado).
   * O proxy da API (`GET /uploads/file/:id`) continua existindo como
   * **fallback autenticado**: aceita `Authorization: Bearer` ou um token curto
   * `?t=` assinado aqui, válido só para aquele anexo.
   *
   * `R2_PUBLIC_BASE_URL` continua sendo respeitado, mas é opt-in explícito de
   * bucket público — nesse caso não há como restringir por permissão.
   *
   * Quem chama já passou pela autorização (ver mensagem / ser o uploader);
   * a URL devolvida é uma capacidade de curta duração para aquele leitor.
   */
  async attachmentUrl(id: string, key: string): Promise<string> {
    const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
    if (base) return `${base}/${key}`;

    if (this.isConfigured()) {
      try {
        return await getSignedUrl(
          this.getClient(),
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
          { expiresIn: ATTACHMENT_URL_TTL_SECONDS },
        );
      } catch (e) {
        // presign falhou (credencial inválida, relógio, etc.) — cai no proxy
        this.logger.warn(`Falha ao assinar URL de ${key}: ${e}`);
      }
    }
    return this.proxyUrl(id);
  }

  /** URL do proxy da API com token curto embutido (fallback do presign). */
  private proxyUrl(id: string): string {
    const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(
      /\/+$/,
      "",
    );
    return `${api}/api/uploads/file/${id}?t=${this.signAttachmentToken(id)}`;
  }

  /** Token curto que autoriza a leitura de UM anexo pelo proxy. */
  signAttachmentToken(attachmentId: string): string {
    return this.jwt.sign(
      { aid: attachmentId, typ: "attachment" } satisfies AttachmentTokenClaims,
      { secret: process.env.JWT_SECRET, expiresIn: ATTACHMENT_URL_TTL_SECONDS },
    );
  }

  /** Devolve o id do anexo autorizado pelo token, ou null se inválido. */
  verifyAttachmentToken(token: string): string | null {
    try {
      const claims = this.jwt.verify<AttachmentTokenClaims>(token, {
        secret: process.env.JWT_SECRET,
      });
      return claims?.typ === "attachment" && claims.aid ? claims.aid : null;
    } catch {
      return null;
    }
  }
}
