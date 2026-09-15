import type { ReactNode } from "react";

/**
 * Divisória do Discord: 1px `--border-subtle` (`.divider_e62f9d` e dezenas de
 * `.divider_*`/`.separator_*` no CSS bruto).
 *
 * Medido (cartão 0.4-pequenos):
 * - `horizontal`: 1px de altura, 100% de largura (`.divider_e62f9d{height:1px;
 *   width:100%;background-color:var(--border-subtle)}`, letra por letra);
 *   margens quem decide é o uso.
 * - `vertical`: 1px de largura, esticada por padrão (`self-stretch`); a
 *   toolbar do Discord fixa 20px (`.separator__841c8{height:20px;width:1px}`)
 *   — quem precisa disso passa `className="h-5"` (20px), não é o padrão do
 *   primitivo porque a maioria dos usos estica.
 * - Com `rotulo`: linha – texto – linha. Medida do divisor de **data**
 *   (`DateDivider` em `MessageList.tsx`, mantida aqui): `text-xs` (12px)
 *   `font-semibold` `text-text-muted`, `px-1` entre o texto e as linhas —
 *   bate com o CSS achado para esse padrão. tom `perigo` é o "NOVO" das não
 *   lidas: mesma medida do `UnreadDivider` de `MessageList.tsx` — só a linha
 *   da esquerda (sem linha depois do rótulo), pílula com canto de baixo
 *   arredondado (`rounded-b-sm`, não a escala de raio do Discord — é a forma
 *   que o Discord usa ali, "colada" no topo da primeira mensagem não lida) em
 *   `--status-danger`, texto 10px peso 700 caixa-alta.
 * - `margem` (rodada 2p-primitivos): o separador de menu do Discord não ocupa
 *   a largura toda, tem 8 de folga em volta
 *   (`.separator_c1e9c4{border-bottom:1px solid var(--border-subtle);
 *   margin:var(--custom-menu-separator-margin,8px)}`, `css-bruto/858942.*.css`).
 *   A revisão mediu 202px com 8 de cada lado no menu do servidor (print
 *   `2026-08-31 101733`, linha y=141, x127–328), contra 16 no nosso. Com
 *   `w-full`, uma margem lateral vinda de `className` estouraria a caixa
 *   (100% + 16), e por isso a folga é prop: ela tira o `w-full` e deixa o
 *   `<hr>` de bloco ocupar o que sobra.
 */
export interface DividerProps {
  orientacao?: "horizontal" | "vertical";
  rotulo?: ReactNode;
  tom?: "sutil" | "normal" | "perigo";
  /**
   * Folga em px nos quatro lados da linha horizontal sem rótulo, no lugar da
   * largura total: `8` é o separador de menu do Discord (`.separator_c1e9c4`).
   * Vai em `style`. Ignorada na vertical e com `rotulo`.
   */
  margem?: number;
  className?: string;
}

export function Divider({ orientacao = "horizontal", rotulo, tom = "sutil", margem, className = "" }: DividerProps) {
  const cor = tom === "perigo" ? "bg-status-danger" : tom === "normal" ? "bg-border-normal" : "bg-border-subtle";

  if (orientacao === "vertical") {
    return <span role="separator" aria-orientation="vertical" className={`inline-block w-px self-stretch ${cor} ${className}`} />;
  }

  if (!rotulo) {
    if (margem != null) {
      return <hr style={{ margin: margem }} className={`h-px border-0 ${cor} ${className}`} />;
    }
    return <hr className={`h-px w-full border-0 ${cor} ${className}`} />;
  }

  if (tom === "perigo") {
    // "NOVO" das não lidas — mesma medida de `UnreadDivider` em MessageList.tsx: só a linha da esquerda.
    return (
      <div role="separator" className={`flex items-center ${className}`}>
        <span className="h-px flex-1 bg-status-danger" />
        <span className="rounded-b-sm bg-status-danger px-1 py-px text-[10px] font-bold uppercase leading-[13px] tracking-wide text-control-critical-primary-text-default">
          {rotulo}
        </span>
      </div>
    );
  }

  // divisor de data — mesma medida de `DateDivider` em MessageList.tsx.
  return (
    <div role="separator" className={`flex items-center ${className}`}>
      <span className={`h-px flex-1 ${cor}`} />
      <span className="px-1 text-xs font-semibold text-text-muted">{rotulo}</span>
      <span className={`h-px flex-1 ${cor}`} />
    </div>
  );
}
