"use client";

/**
 * Interruptor do Discord: `.switchIndicator_a28278` / `.thumb_a28278` em
 * `css-bruto/858942.086f3345af1722be.css`.
 *
 * Especificação medida (cartão 0.4-controles implementa):
 * - Trilho 48×24 com borda 1px (`--switch-border-default` /
 *   `--switch-border-selected-default`), raio 16 (`--radius-lg`), fundo
 *   `--switch-background-default` → hover `-hover` → ligado
 *   `--switch-background-selected-default` (limão) → ligado+hover `-selected-hover`.
 * - Polegar 24×24 (a altura do trilho, com `margin -1px` compensando a borda),
 *   branco (`--switch-thumb-background-*`), desloca 24 ao ligar. Ícone dentro do
 *   polegar: `--switch-thumb-icon-default` desligado e
 *   `--switch-thumb-icon-active` ligado (escuro, regra do accent — o Discord põe
 *   blurple, o limão sobre branco quebraria "limão só sobre escuro"). Tamanho do
 *   ícone "não medido" no CSS: medir no print 1:1 de Configurações.
 * - Transição de cor e posição: "não medido" (o app usa 150 ms; manter).
 * - Desabilitado: cursor not-allowed e opacidade .5 (conferir).
 * - `role="switch"` + `aria-checked`; Espaço alterna.
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

// Implementação provisória (cartão 0.4-controles substitui pelo medido).
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
      className={`relative h-[24px] w-[48px] shrink-0 rounded-2xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        marcado
          ? "border-switch-border-selected-default bg-switch-background-selected-default"
          : "border-switch-border-default bg-switch-background-default"
      } ${className}`}
    >
      <span
        className={`absolute -left-px -top-px h-[24px] w-[24px] rounded-full bg-switch-thumb-background-default transition-transform ${
          marcado ? "translate-x-[24px]" : ""
        }`}
      />
    </button>
  );
}
