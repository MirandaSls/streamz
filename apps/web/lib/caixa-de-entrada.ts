/**
 * Como abrir a caixa de entrada de fora dela (o atalho Ctrl+I).
 *
 * O painel mora dentro de um `HeaderPopover`, que guarda o próprio
 * aberto/fechado — e pode haver dois montados ao mesmo tempo: o da barra de
 * título do desktop e o do cabeçalho da página Amigos. Um evento no `window`
 * resolve sem store nova: quem escuta primeiro abre e interrompe a propagação
 * (`stopImmediatePropagation`), então nunca abrem os dois.
 */
export const EVENTO_CAIXA_DE_ENTRADA = "streamz:caixa-de-entrada";

export function abrirCaixaDeEntrada(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_CAIXA_DE_ENTRADA));
}
