import type { Attachment } from "@streamz/shared";
import type { StorageService } from "../storage/storage.service";

/** Linha de `Attachment` com o que o DTO precisa. */
export interface AttachmentRow {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  /** GIF do provedor: a imagem mora fora, não há objeto no bucket. */
  externalUrl?: string | null;
}

/**
 * Linha → DTO, num lugar só (messages, uploads e a galeria de mídia usam este).
 *
 * Assíncrono porque a URL do anexo guardado no bucket é assinada na hora e
 * expira (ver StorageService.attachmentUrl). Quando o anexo é externo — um GIF
 * escolhido no seletor —, a URL é a do provedor: nada subiu para o nosso
 * storage, então não há o que assinar. Isso é o que permite o botão de GIF
 * funcionar mesmo sem R2 configurado.
 */
export async function toAttachmentDTO(
  storage: StorageService,
  a: AttachmentRow,
): Promise<Attachment> {
  return {
    id: a.id,
    url: a.externalUrl ?? (await storage.attachmentUrl(a.id, a.key)),
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    width: a.width,
    height: a.height,
  };
}
