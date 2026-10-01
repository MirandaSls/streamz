/**
 * Como a moldura do palco (cabeçalho, cápsula de controles, ícones dos cantos)
 * entra e sai da tela.
 *
 * No Discord ela não acende no lugar: o que mora em cima desce, o que mora
 * embaixo sobe, e na saída cada um volta por onde veio. Só `opacity` — o que
 * havia aqui — lê como um corte, mesmo com 200ms.
 *
 * **À vista não há `translate-y-0`**, e é de propósito: no Tailwind 3 a classe
 * vira um `transform` identidade, e qualquer `transform` diferente de `none`
 * passa a ser o bloco de contenção dos descendentes `fixed`. A cápsula ancora
 * menus e dicas; sem transform nenhum no repouso eles continuam medidos contra
 * a janela. A transição para `none` interpola como identidade, então o deslize
 * acontece do mesmo jeito.
 *
 * Duração e curva saem dos tokens de `globals.css` (`--mov-lento`,
 * `--mov-curva-saida`), que já zeram sob `prefers-reduced-motion`.
 */
export type LadoDaMoldura = "cima" | "baixo";

const TRANSICAO =
  "transition-[opacity,transform] duration-[var(--mov-lento)] ease-[var(--mov-curva-saida)]";

const ESCONDIDA: Record<LadoDaMoldura, string> = {
  cima: "pointer-events-none -translate-y-4 opacity-0",
  baixo: "pointer-events-none translate-y-4 opacity-0",
};

export function classeDaMoldura(visivel: boolean, lado: LadoDaMoldura): string {
  return `${TRANSICAO} ${visivel ? "opacity-100" : ESCONDIDA[lado]}`;
}

/**
 * O ponteiro saiu do palco: a moldura some já, ou espera o tempo de inatividade?
 *
 * Só o mouse esconde na hora. Para dedo e caneta o `pointerleave` dispara ao
 * **levantar** — todo toque terminaria apagando a moldura que ele acabou de
 * acordar.
 */
export function saidaEscondeAMoldura(tipoDePonteiro: string): boolean {
  return tipoDePonteiro === "mouse";
}
