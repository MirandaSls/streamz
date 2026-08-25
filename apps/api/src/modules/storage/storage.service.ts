import { Injectable, Logger } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

/**
 * Storage de objetos sobre Cloudflare R2 (API compatível com S3).
 *
 * Config por ambiente:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   R2_PUBLIC_BASE_URL  (opcional) — base pública do bucket (r2.dev ou domínio
 *                        próprio). Se ausente, servimos por proxy da API.
 *
 * Sem credenciais, `isConfigured()` é false e o UploadsController responde de
 * forma clara (espelha o tratamento de credencial ausente do LiveKit).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

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
   * URL pública de um anexo. Prefere a base do bucket (CDN direto); sem ela,
   * cai para o proxy da API por id — assim funciona só com as credenciais,
   * sem precisar tornar o bucket público.
   */
  publicUrl(id: string, key: string): string {
    const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
    if (base) return `${base}/${key}`;
    const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(
      /\/+$/,
      "",
    );
    return `${api}/api/uploads/file/${id}`;
  }
}
