/**
 * Validação da imagem de um emoji personalizado ou de uma figurinha.
 *
 * Reaproveita o `sniffImage` dos uploads (magic-bytes, sem dependência) e por
 * cima aplica o que é específico deste domínio: só PNG/GIF/WebP, teto de bytes
 * e teto de lado em pixels. **Não redimensionamos** — sem uma biblioteca de
 * imagem no servidor, reduzir na mão significaria decodificar PNG/WebP à mão;
 * então o arquivo grande é recusado com a medida no texto do erro, e quem
 * envia corrige antes. É a diferença consciente para o Discord, que reamostra.
 *
 * Funções puras de propósito: o service traduz o resultado em exceção HTTP.
 */

import { gifAnimado, sniffImage, webpAnimado } from "../uploads/media";

/** Formatos aceitos: os que o `<img>` do cliente sabe animar/mostrar. */
export const TIPOS_DE_IMAGEM = ["image/png", "image/gif", "image/webp"] as const;

export type ResultadoImagem =
  | { ok: true; mime: string; width: number; height: number; animated: boolean }
  | { ok: false; motivo: string; grande?: boolean };

export interface LimitesImagem {
  maxBytes: number;
  maxLado: number;
}

/**
 * Valida o arquivo enviado. `grande: true` no resultado distingue "passou do
 * tamanho" (413) de "formato/dimensão inválidos" (400).
 */
export function validarImagem(buf: Buffer, limites: LimitesImagem): ResultadoImagem {
  if (!buf?.length) return { ok: false, motivo: "Arquivo vazio" };
  if (buf.length > limites.maxBytes) {
    return {
      ok: false,
      grande: true,
      motivo: `Arquivo acima de ${Math.round(limites.maxBytes / 1024)} KB`,
    };
  }

  const info = sniffImage(buf);
  if (!info || !(TIPOS_DE_IMAGEM as readonly string[]).includes(info.mime)) {
    return { ok: false, motivo: "Use uma imagem PNG, GIF ou WebP" };
  }
  if (!info.width || !info.height) {
    return { ok: false, motivo: "Não foi possível ler as dimensões da imagem" };
  }
  if (info.width > limites.maxLado || info.height > limites.maxLado) {
    return {
      ok: false,
      motivo: `Imagem de ${info.width}×${info.height}px: o máximo é ${limites.maxLado}×${limites.maxLado}px`,
    };
  }

  return {
    ok: true,
    mime: info.mime,
    width: info.width,
    height: info.height,
    animated: temAnimacao(buf, info.mime),
  };
}

/** Extensão do arquivo a partir do mime — vira o sufixo da chave no bucket. */
export function extensaoDe(mime: string): string {
  return mime === "image/png" ? "png" : mime === "image/gif" ? "gif" : "webp";
}

/** true quando a imagem se move (GIF com laço, WebP com o bloco ANIM). */
export function temAnimacao(buf: Buffer, mime: string): boolean {
  if (mime === "image/gif") return gifAnimado(buf);
  if (mime === "image/webp") return webpAnimado(buf);
  return false;
}
