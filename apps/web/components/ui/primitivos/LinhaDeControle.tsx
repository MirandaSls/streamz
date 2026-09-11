import type { ReactNode } from "react";

/**
 * Linha de configuração: título + descrição à esquerda, controle (Switch,
 * Select, botão) à direita, divisória embaixo — o padrão das telas de
 * Configurações.
 *
 * Medido (cartão 0.4-controles), print 1:1 de Notificações
 * (`docs/Reference/Captura de tela 2026-09-01 114554.png` e
 * `.../114605.png`):
 * - O controle **não centraliza contra o bloco inteiro** (título+descrição)
 *   — alinha pelo topo, rente ao título. Em "Ativar notificações na área de
 *   trabalho" (descrição de 2 linhas, `.../114554.png`) o centro do switch
 *   (y≈259, medido 248–270) fica a 4px do centro do título (y≈255, medido
 *   252–262) e a 18px do centro do bloco inteiro (y≈277, título+descrição
 *   medidos 252–303) — se fosse `items-center` contra o bloco todo, o switch
 *   estaria uns 18px mais abaixo. Confirmado numa segunda linha
 *   ("Desativar todos os sons de notificação", `.../114605.png`): título
 *   centro y≈512, switch centro y≈513 — a 1px. Por isso `items-start`, não
 *   `items-center`.
 * - Divisória 1px `--border-subtle` (`.divider_e62f9d`) — não aparece entre
 *   linhas simples de switch em Notificações (o Discord só usa nas divisas
 *   de seção, ex. antes de "Sons"); quem monta a tela decide `semDivisoria`
 *   linha a linha.
 * - Título/descrição: "não medido" com precisão de sub-pixel (a mancha de
 *   tinta do título e da 1ª linha da descrição ficou perto demais para
 *   separar, no pixel, um título 16/20 de uma descrição colada logo abaixo
 *   com `mt-0` de um `mt-1`) — os valores já batiam com a escala nomeada do
 *   app (`text-text-md font-medium text-text-strong` / `text-text-sm
 *   text-text-muted`, gap 4 = `gap-1`) e nada no print contradiz; mantidos.
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

export function LinhaDeControle({ rotulo, descricao, htmlFor, controle, semDivisoria, className = "" }: LinhaDeControleProps) {
  return (
    <div
      className={`flex items-start justify-between gap-4 py-4 ${semDivisoria ? "" : "border-b border-border-subtle last:border-b-0"} ${className}`}
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
