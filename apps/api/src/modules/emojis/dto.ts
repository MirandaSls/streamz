import type { CustomEmoji, Sticker } from "@streamz/shared";

/**
 * Conversores das linhas de `CustomEmoji`/`Sticker` para os DTOs do contrato.
 *
 * A URL da imagem não é assinada como a de anexo: emoji e figurinha aparecem em
 * mensagem de qualquer canal — inclusive para quem nunca entrou no servidor de
 * origem —, então amarrá-las à autorização do canal não protegeria nada e
 * quebraria o render. São públicas por id, como o CDN de emoji do Discord.
 */

function baseDaApi(): string {
  return (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(/\/+$/, "");
}

/** URL pública da imagem de um emoji personalizado. */
export function emojiUrl(id: string): string {
  return `${baseDaApi()}/api/emojis/${id}/image`;
}

/** URL pública da imagem de uma figurinha. */
export function stickerUrl(id: string): string {
  return `${baseDaApi()}/api/stickers/${id}/image`;
}

export interface CustomEmojiRow {
  id: string;
  guildId: string;
  name: string;
  animated: boolean;
  createdById: string;
}

export function toEmojiDTO(e: CustomEmojiRow): CustomEmoji {
  return {
    id: e.id,
    guildId: e.guildId,
    name: e.name,
    animated: e.animated,
    url: emojiUrl(e.id),
    createdById: e.createdById,
  };
}

export interface StickerRow {
  id: string;
  guildId: string;
  name: string;
  tags: string;
  createdById: string;
}

export function toStickerDTO(s: StickerRow): Sticker {
  return {
    id: s.id,
    guildId: s.guildId,
    name: s.name,
    tags: s.tags,
    url: stickerUrl(s.id),
    createdById: s.createdById,
  };
}
