/**
 * A regra de nome de emoji e figurinha, num lugar só.
 *
 * Duas telas mexem no mesmo recurso — a aba "Emoji" das configurações do
 * servidor e o `GuildEmojisModal` que abre pelo seletor — e a regra é do
 * servidor, não da tela: enquanto cada uma tinha a sua cópia, o texto de ajuda
 * dizia coisas diferentes nos dois lugares para o mesmo 400 da API.
 */

/** Regra de nome, repetida ao usuário antes de o servidor recusar. */
export const AJUDA_NOME = "Só letras minúsculas, números e _ (2 a 32 caracteres).";

/** Nome sugerido a partir do arquivo: "Festa Final.png" → "festa_final". */
export function sugerirNome(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}
