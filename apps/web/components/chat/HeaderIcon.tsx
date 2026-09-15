"use client";

import type { MouseEvent, ReactNode } from "react";
import { BotaoDeIcone } from "@/components/ui/primitivos";

/**
 * Botão de ícone da toolbar do cabeçalho: agora é o `BotaoDeIcone` na receita
 * `variante="cabecalho"`, e não mais um `<button>` desenhado à mão.
 *
 * Fica em arquivo próprio porque o `HeaderPopover` também o usa, e o cabeçalho
 * já monta popovers — mantê-lo dentro do `HeaderBar` fecharia um ciclo de
 * importação entre os dois.
 *
 * **Cores** (a receita já as traz): as do ícone do cabeçalho do Discord. No CSS
 * bruto (`858942….css`, o módulo do cabeçalho do canal):
 * `.clickable__9293f .icon__9293f{color:var(--icon-muted)}`,
 * `:hover{color:var(--icon-subtle)}`, `.selected__9293f{color:var(--icon-strong)}`
 * e `.iconDisabled__9293f{opacity:.6}`. Bate com o print 1:1 `2026-09-02 180835`:
 * em repouso a tinta mede #96979e (`--icon-muted`; linha y=52, x1542–1553) e a
 * de membros, ligada, #fbfbfb (`--icon-strong`; linha y=62, x1624–1635).
 *
 * **Caixa de 32**, a de `.iconWrapper__9293f{height:var(--space-32);width:
 * var(--space-32)}` — era 24 enquanto o botão era feito à mão. Com isso o
 * passo de 42 entre os ícones passou a sair de 32 + 10 de vão no `HeaderBar`
 * (antes 24 + 18), e a âncora do `HeaderPopover` (a caixa do botão) cresceu
 * 4px de cada lado.
 *
 * **O glifo continua o do chamador.** A receita força 20px pelo seletor
 * `[&>svg]`, mas cada chamador já escolheu o `size` que dá os 18px de tinta
 * medidos no `180835` (os glifos medem 20, 16×18, 18 e 18 de tinta em
 * x1496–1515, 1540–1555, 1582–1599 e 1623–1640): Threads e Pin a 21, Users a
 * 22, os da DM a 20. Por isso o ícone vai dentro de um `span`, que o seletor
 * não alcança — e o `pointer-events-none` nele evita que um ícone que troca de
 * componente entre o `pointerdown` e o `click` engula o clique.
 *
 * **`compacto`** volta à caixa de 24: é a caixa de entrada na barra de título
 * do desktop, onde o print 1:1 `2026-09-01 113500` mede passo de 36 entre os
 * glifos (centros x=1105,5 e 1141,5) e a borda direita do painel em x=1117,
 * 11,5 à direita do centro do glifo — a borda de uma caixa de 24, não de 32.
 */
export default function HeaderIcon({
  label,
  onClick,
  active = false,
  disabled = false,
  motivoDesabilitado,
  semTooltip = false,
  compacto = false,
  children,
}: {
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  /**
   * Por que o botão está cinza. Sem isto a dica do desabilitado é
   * "(em breve)", que é verdade para os botões ainda sem função e mentira para
   * o telefone durante uma chamada — ali o motivo é "já estou nela".
   */
  motivoDesabilitado?: string;
  /** com o painel do botão aberto a dica só atrapalha: cobre o conteúdo. */
  semTooltip?: boolean;
  /** caixa de 24 em vez de 32 — a barra de título do desktop (ver cabeçalho). */
  compacto?: boolean;
  children: ReactNode;
}) {
  return (
    <BotaoDeIcone
      variante="cabecalho"
      // `sm` (24) só no compacto; sem ele a receita fica com o `md` (32)
      tamanho={compacto ? "sm" : undefined}
      rotulo={label}
      icone={
        <span aria-hidden="true" className="pointer-events-none grid place-items-center">
          {children}
        </span>
      }
      onClick={onClick}
      ativo={active}
      // o primitivo usa `aria-disabled` (a dica do motivo continua chegando) e
      // tira o `onClick` sozinho; a guarda de verdade contra o clique repetido
      // está na store (`chamada-em-curso.ts`) — o botão é o aviso, não a trava
      desabilitado={disabled}
      motivoDesabilitado={motivoDesabilitado ?? `${label} (em breve)`}
      ladoDaDica="bottom"
      semDica={semTooltip}
    />
  );
}
