/**
 * Comandos de barra do composer (`/shrug`, `/me`, `/spoiler`, `/giphy`…).
 *
 * A lista mora no contrato (`COMANDOS_BARRA`) porque descreve o que a mensagem
 * vira — o que interessa aos dois lados. Aqui fica só a interpretação do texto
 * digitado, pura e testável: o composer chama `interpretarComando` no envio e
 * age conforme o resultado.
 */

import {
  COMANDOS_BARRA,
  SUFIXOS_COMANDO,
  type ComandoBarra,
} from "@streamz/shared";

/** O que fazer com a mensagem depois de reconhecer o comando. */
export type ResultadoComando =
  /** não era comando: envia o texto como veio. */
  | { tipo: "nenhum" }
  /** envia este texto no lugar do digitado. */
  | { tipo: "enviar"; content: string }
  /** abre o seletor de GIF já com o termo. */
  | { tipo: "gif"; termo: string }
  /** muda o apelido no servidor (depende do agente de cargos). */
  | { tipo: "apelido"; apelido: string }
  /** o texto começa com `/` mas não é um comando conhecido. */
  | { tipo: "desconhecido"; nome: string };

/** Comandos cujo nome começa com o termo digitado (autocomplete de `/`). */
export function buscarComandos(termo: string): ComandoBarra[] {
  const q = termo.trim().toLowerCase();
  return COMANDOS_BARRA.filter((c) => c.nome.startsWith(q));
}

/** Separa `/nome resto` em comando e argumento; null se não começa com `/`. */
export function separarComando(
  texto: string,
): { nome: string; argumento: string } | null {
  const m = texto.match(/^\/([a-z]+)(?:\s+([\s\S]*))?$/);
  return m ? { nome: m[1], argumento: (m[2] ?? "").trim() } : null;
}

/**
 * Interpreta o texto do composer.
 *
 * `/shrug` e companhia **acrescentam** o sufixo ao que foi escrito (é o que o
 * Discord faz: `/shrug deu ruim` vira "deu ruim ¯\\_(ツ)_/¯"), enquanto `/me` e
 * `/spoiler` embrulham a mensagem inteira. Um `/` sozinho, ou seguido de algo
 * que não é comando, volta como `desconhecido` — o composer avisa em vez de
 * enviar "/xyz" achando que fez alguma coisa.
 */
export function interpretarComando(texto: string): ResultadoComando {
  const partes = separarComando(texto.trim());
  if (!partes) return { tipo: "nenhum" };

  const comando = COMANDOS_BARRA.find((c) => c.nome === partes.nome);
  if (!comando) return { tipo: "desconhecido", nome: partes.nome };

  const arg = partes.argumento;
  switch (comando.tipo) {
    case "texto": {
      const sufixo = SUFIXOS_COMANDO[comando.nome] ?? "";
      return { tipo: "enviar", content: arg ? `${arg} ${sufixo}` : sufixo };
    }
    case "acao":
      // ação em itálico, como o /me do IRC de onde o Discord herdou
      return arg ? { tipo: "enviar", content: `*${arg}*` } : { tipo: "nenhum" };
    case "spoiler":
      return arg ? { tipo: "enviar", content: `||${arg}||` } : { tipo: "nenhum" };
    case "gif":
      return { tipo: "gif", termo: arg };
    case "apelido":
      return { tipo: "apelido", apelido: arg };
  }
}
