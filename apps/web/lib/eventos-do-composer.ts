/**
 * Pedidos de painel para o composer: abrir o emoji, o GIF, a figurinha ou o
 * seletor de arquivo de fora dele — quem dispara são os atalhos de teclado
 * (o mapa deles mora com os atalhos, não aqui).
 *
 * Vai por `CustomEvent` no `window`, no mesmo molde do `EVENTO_MENCAO`
 * (`lib/mencoes.ts`), e pelo mesmo motivo: quem pede não sabe qual composer
 * está montado. Quem decide se atende é o próprio `Composer.tsx` — só o da
 * conversa ativa (canal ou DM), nunca o da thread. Sem composer na tela, o
 * evento cai no vazio, que é o comportamento desejado.
 */

export const EVENTO_PAINEL_DO_COMPOSER = "streamz:painel-do-composer";

export type AcaoDoPainel = "emoji" | "gif" | "figurinha" | "anexar";

export interface DetalhePainelDoComposer {
  acao: AcaoDoPainel;
}

export function pedirPainelDoComposer(acao: AcaoDoPainel): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DetalhePainelDoComposer>(EVENTO_PAINEL_DO_COMPOSER, { detail: { acao } }),
  );
}
