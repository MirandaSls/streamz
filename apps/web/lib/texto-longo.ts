/**
 * Texto acima do limite de uma mensagem não é cortado — vira um anexo
 * `message.txt`, exatamente como o Discord faz. Esta é a parte **pura**: o
 * que decide se passou do limite, monta o `File` do upload e recorta a
 * prévia de um `.txt` já anexado. O resto (o textarea, o upload em si, o
 * cartão que desenha a prévia) mora no componente, que ninguém roda neste
 * servidor.
 */

import { MAX_MESSAGE_LENGTH, SPOILER_PREFIX } from "@streamz/shared";
import type { Attachment } from "@streamz/shared";

/** Nome do anexo que substitui o texto longo — o mesmo do Discord. */
export const NOME_DO_TEXTO_LONGO = "message.txt";

/** Bytes máximos que a prévia busca e mostra (acima disso o cartão mostra só o começo e oferece baixar). */
export const LIMITE_DA_PREVIA_BYTES = 64 * 1024;

/** Linhas mostradas com a prévia recolhida. */
export const LINHAS_DA_PREVIA_RECOLHIDA = 10;

/**
 * O texto passa do teto de uma mensagem?
 *
 * Conta em **code units** (`string.length`), como o `maxLength` do textarea e
 * o `z.string().max()` do contrato em `packages/shared` — não em code points
 * nem em grafemas. Um emoji de surrogate pair conta 2 aqui e no schema; contar
 * diferente deixaria o cliente aceitar o que o servidor recusa (ou o
 * contrário).
 */
export function passaDoLimite(texto: string, limite = MAX_MESSAGE_LENGTH): boolean {
  return texto.length > limite;
}

/**
 * Colar `colado` no lugar de `[inicio, fim)` de `atual` deixaria o campo
 * acima do limite?
 *
 * É a conta que o textarea faz **antes** de aceitar um `paste`: monta o texto
 * resultante (o que sobra antes da seleção + o colado + o que sobra depois) e
 * mede esse total, sem mutar nada — quem decide o que fazer com o resultado
 * (colar truncado, virar anexo, recusar) é o componente.
 */
export function colagemPassaDoLimite(
  atual: string,
  colado: string,
  inicio: number,
  fim: number,
  limite = MAX_MESSAGE_LENGTH,
): boolean {
  const resultado = atual.slice(0, inicio) + colado + atual.slice(fim);
  return passaDoLimite(resultado, limite);
}

/** O texto como arquivo `message.txt` (text/plain;charset=utf-8), pronto para o upload. */
export function textoComoArquivo(texto: string): File {
  return new File([texto], NOME_DO_TEXTO_LONGO, { type: "text/plain;charset=utf-8" });
}

/** Extensões de texto que a conversa sabe prever, sem o ponto e em minúsculas. */
const EXTENSOES_PREVISUALIZAVEIS = new Set([
  "txt",
  "md",
  "log",
  "pub",
  "conf",
  "cfg",
  "env",
  "csv",
  "json",
  "xml",
  "yml",
  "yaml",
  "ini",
  "toml",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "sh",
  "css",
  "scss",
  "html",
  "sql",
  "lua",
]);

/**
 * O anexo é texto que a conversa sabe prever?
 *
 * Decide pelo **nome**, nunca pelo `contentType`: o servidor grava anexo de
 * texto como `application/octet-stream` (`uploads/media.ts` só reconhece
 * magic-bytes de mídia binária), então o content-type não distingue um
 * `.ts` de um `.zip`. O prefixo de spoiler (`SPOILER_`) é ignorado só para
 * achar a extensão — o cartão de spoiler continua escondendo o conteúdo.
 *
 * Tamanho 0 ou negativo é anexo externo (embed, link) sem bytes nossos para
 * buscar — não há o que prever.
 */
export function ehTextoPrevisualizavel(anexo: Pick<Attachment, "filename" | "size">): boolean {
  if (anexo.size <= 0) return false;
  const semSpoiler = anexo.filename.startsWith(SPOILER_PREFIX)
    ? anexo.filename.slice(SPOILER_PREFIX.length)
    : anexo.filename;
  const ponto = semSpoiler.lastIndexOf(".");
  if (ponto <= 0) return false;
  const extensao = semSpoiler.slice(ponto + 1).toLowerCase();
  return EXTENSOES_PREVISUALIZAVEIS.has(extensao);
}

/** Recorta o texto da prévia: devolve as primeiras `linhas` linhas e se sobrou algo. */
export function recortarPrevia(
  texto: string,
  linhas = LINHAS_DA_PREVIA_RECOLHIDA,
): { trecho: string; cortado: boolean } {
  const todas = texto.split("\n");
  if (todas.length <= linhas) {
    return { trecho: texto, cortado: false };
  }
  return { trecho: todas.slice(0, linhas).join("\n"), cortado: true };
}
