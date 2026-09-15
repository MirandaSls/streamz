"use client";

/**
 * Interruptor do Discord: `.switchIndicator_a28278` / `.thumb_a28278` em
 * `css-bruto/858942.086f3345af1722be.css`.
 *
 * Medido (cartão 0.4-controles):
 * - Trilho 48×24 com borda 1px (`--switch-border-default` /
 *   `--switch-border-selected-default`), raio 16 (`rounded-2xl` =
 *   `--radius-lg`), fundo `--switch-background-default` → hover `-hover` →
 *   ligado `--switch-background-selected-default` (limão) → ligado+hover
 *   `-selected-hover`. Confirmado pixel a pixel no print 1:1 de Notificações
 *   (`docs/Reference/Captura de tela 2026-09-01 114554.png`, trilho em
 *   x≈1387–1434/y≈770–793, e `.../114508.png`, trilho ligado em
 *   x≈1342–1389/y≈222–245): os dois fecham em 48×24.
 * - Polegar: caixa 24×24 (`margin -1px` compensa a borda de 1px do trilho),
 *   desloca `translate-x-[24px]` ao ligar. Dentro da caixa o **círculo
 *   pintado é 16×16, centralizado** (4px de folga de cada lado) — não os
 *   24×24 da caixa inteira (medido nos dois prints acima: círculo
 *   x≈1392–1407/y≈774–789 desligado, x≈1371–1384/y≈226–241 ligado).
 * - **Sem ícone dentro do polegar.** O CSS declara
 *   `--switch-thumb-icon-default`/`-active`, mas varrendo linha a linha (tol
 *   0) o interior do círculo nos dois estados e nos dois prints acima
 *   (`.../114554.png` desligado, `.../114508.png` ligado, mais
 *   `.../114554.png` "Use entrada de chat padrão") não tem um pixel sequer
 *   diferente de branco — só a borda anti-serrilhada. Os tokens ficam sem
 *   uso aqui (regra de autoridade: print 1:1 vence CSS).
 * - Transição de cor e posição: "não medido" no CSS nem no print (é
 *   instantâneo numa captura estática); mantidos os 150ms já usados no app.
 * - Desabilitado: cursor not-allowed (`[data-disabled]` no CSS) e opacidade
 *   .5 — a opacidade é "não medido" para o switch em si (o CSS bruto só dá o
 *   cursor; não achei switch desabilitado em nenhum print), mantida por
 *   consistência com Checkbox/Radio, que têm essa regra confirmada.
 * - `role="switch"` + `aria-checked`; Espaço/Enter alternam (nativo do
 *   `<button>`).
 */
export interface SwitchProps {
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
  desabilitado?: boolean;
  id?: string;
  /** Nome acessível quando não há `<label htmlFor>`. */
  rotulo?: string;
  className?: string;
}

export function Switch({ marcado, aoMudar, desabilitado, id, rotulo, className = "" }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={marcado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => aoMudar(!marcado)}
      className={`relative h-[24px] w-[48px] shrink-0 rounded-2xl border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        marcado
          ? "border-switch-border-selected-default bg-switch-background-selected-default hover:border-switch-border-selected-hover hover:bg-switch-background-selected-hover"
          : "border-switch-border-default bg-switch-background-default hover:border-switch-border-hover hover:bg-switch-background-hover"
      } ${className}`}
    >
      <span
        className={`absolute -left-px -top-px h-[24px] w-[24px] transition-transform duration-150 ${
          marcado ? "translate-x-[24px]" : ""
        }`}
      >
        <span
          className={`absolute inset-1 rounded-full ${
            marcado ? "bg-switch-thumb-background-selected-default" : "bg-switch-thumb-background-default"
          }`}
        />
      </span>
    </button>
  );
}
