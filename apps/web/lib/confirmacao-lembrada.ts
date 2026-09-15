/**
 * "Não perguntar de novo" das confirmações (o checkbox à esquerda do rodapé no
 * print `docs/Reference/Captura de tela 2026-08-31 124114.png`).
 *
 * Fica no `localStorage` do navegador, como preferência local: é o aparelho
 * que deixa de perguntar, não a conta — não há tabela para isso e a decisão
 * de produto é não criar uma. Toda leitura e escrita vai em try/catch porque o
 * acessor pode lançar (janela anônima, dado do site bloqueado, SSR sem
 * `window`); na dúvida a resposta é `false`, e perguntar de novo é o lado
 * seguro de uma confirmação.
 */

const PREFIXO = "streamz:confirmacao:";

/** A pessoa já marcou "Não perguntar de novo" para esta confirmação? */
export function confirmacaoLembrada(chave: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(PREFIXO + chave) === "1";
  } catch {
    return false;
  }
}

/** Guarda que esta confirmação não deve mais ser perguntada. */
export function lembrarConfirmacao(chave: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFIXO + chave, "1");
  } catch {
    // sem armazenamento a caixa volta a aparecer na próxima vez; nada a fazer
  }
}
