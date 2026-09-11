import type { ReactNode } from "react";

/**
 * Linha de configuração: título + descrição à esquerda, controle (Switch,
 * Select, botão) à direita, divisória embaixo — o padrão das telas de
 * Configurações.
 *
 * Especificação (cartão 0.4-controles implementa): a divisória é 1px
 * `--border-subtle` (`.divider_e62f9d`). Título e descrição da linha "não
 * medidos" no CSS bruto — medir no print 1:1 de Configurações
 * (`/opt/stack/streamz/docs/Reference/`, prints de 2026-09-01 11:43–11:46) e
 * registrar a origem no comentário. Até lá: título 16/20 peso 500
 * `--text-strong`, descrição 14/18 `--text-muted`, 4 entre eles.
 */
export interface LinhaDeControleProps {
  rotulo: ReactNode;
  descricao?: ReactNode;
  /** `id` do controle, para o rótulo clicável. */
  htmlFor?: string;
  controle: ReactNode;
  semDivisoria?: boolean;
  className?: string;
}

// Implementação provisória (cartão 0.4-controles substitui pelo medido).
export function LinhaDeControle({ rotulo, descricao, htmlFor, controle, semDivisoria, className = "" }: LinhaDeControleProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-4 ${semDivisoria ? "" : "border-b border-border-subtle last:border-b-0"} ${className}`}
    >
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-text-md font-medium text-text-strong">
          {rotulo}
        </label>
        {descricao ? <p className="mt-1 text-text-sm text-text-muted">{descricao}</p> : null}
      </div>
      <div className="shrink-0">{controle}</div>
    </div>
  );
}
