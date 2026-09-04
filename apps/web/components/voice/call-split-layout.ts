/**
 * A conta da divisão entre palco e conversa (ver `CallSplit`).
 *
 * Módulo à parte pelo mesmo motivo do `grid-layout.ts`: é aritmética pura sobre
 * a área disponível, testável sem montar componente nenhum.
 *
 * **A divisão virou horizontal.** Ela era vertical — palco em cima, conversa
 * embaixo — e isso não é o que o Discord faz: na print
 * `docs/Reference/Captura de tela 2026-09-03 203909.png` a conversa da chamada
 * é uma **coluna à direita**, o palco fica com a largura que sobra, e a
 * timeline continua com a altura toda da janela. Empilhado, o palco de uma
 * transmissão em 16:9 ficava numa faixa de 215px e a conversa numa tira.
 *
 * A largura é arrastável e lembrada entre sessões, e é guardada em **pixel** e
 * não em proporção: na print o painel mede 363px numa janela de 3333 (escala
 * 0,8075 ⇒ **450**), e não uma fração dela — quem tem monitor maior ganha mais
 * palco, não mais conversa. É o oposto da altura, que era proporcional porque
 * ali quem tinha de crescer com a tela era o palco.
 */

/** Largura da coluna de conversa. Medido: 363px na print ÷ 0,8075 = 450. */
export const LARGURA_PADRAO = 450;
/**
 * Piso da conversa: abaixo disto o composer perde os botões da direita e a
 * timeline quebra todo anexo. Não medido — é o menor que ainda se lê.
 */
export const LARGURA_MIN = 320;
/** Piso do palco: menos que isso não cabe nem um rosto. Não medido. */
export const PALCO_MIN = 360;

export const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Maior largura que a conversa pode ter sem engolir o palco. */
export function tetoDoChat(disponivel: number): number {
  return Math.max(LARGURA_MIN, disponivel - PALCO_MIN);
}

/** Largura da conversa, em pixel, para uma preferência e uma coluna medida. */
export function larguraDoChat(desejada: number, disponivel: number): number {
  if (disponivel <= 0) return LARGURA_PADRAO;
  // coluna estreita demais para os dois: a conversa cede, mas não desaparece —
  // quem abriu o painel quer lê-lo
  return limitar(desejada, Math.min(LARGURA_MIN, disponivel), tetoDoChat(disponivel));
}

/**
 * Converte uma largura salva para o que se guarda de fato.
 *
 * Fora de uma faixa sensata o valor é ignorado: largura salva numa janela
 * minúscula não é preferência, é acidente.
 */
export function larguraGuardavel(px: number): number | null {
  if (!Number.isFinite(px)) return null;
  return px >= LARGURA_MIN && px <= 1200 ? px : null;
}
