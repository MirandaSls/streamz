"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip, type LadoDaDica } from "./Tooltip";

/**
 * Botão só de ícone, com dica — o "ícone clicável" do Discord: a toolbar do
 * cabeçalho do canal, a barra de ações da mensagem, os botões do painel do
 * usuário, fechar de painel. Substitui o `<button title=…><Icone/></button>`
 * espalhado pelo app: o `rotulo` vira `aria-label` E a dica (`Tooltip`), e o
 * `title=` nativo morre.
 *
 * Medido (cartão 0.4-botao-de-icone) nas três famílias do CSS bruto de
 * `docs/referencias-discord/tokens/css-bruto/` e no print 1:1
 * `docs/Reference/Captura de tela 2026-08-31 111402.png` (DM "elle" — mostra as
 * três ao mesmo tempo: toolbar do cabeçalho, barra de hover da mensagem e
 * rodapé do usuário):
 *
 * 1. **Cabeçalho do canal** — `.toolbar__9293f`/`.iconWrapper__9293f`/
 *    `.clickable__9293f` (arquivo `858942.086f3345af1722be.css`, o mesmo módulo
 *    de `.container__9293f`, que é a barra do cabeçalho). Caixa
 *    `var(--space-32)` = **32px**, sem raio e **sem fundo em nenhum estado**
 *    (`iconWrapper` não pinta `background`). Ícone `var(--chat-input-icon-size)`
 *    = **20px**. Cor: repouso `--icon-muted`, hover `--icon-subtle`, selecionado
 *    (`.selected__9293f`) `--icon-strong` — confirmado no print (linha y=61 da
 *    imagem: ícones em repouso amostram `#96979e` = `--icon-muted`; o ícone de
 *    lista de membros, aberto, amostra `#fbfbfb` = `--icon-strong`). Gap entre
 *    ícones `var(--space-xs)` = 8px (não é responsabilidade deste componente).
 * 2. **Barra de ações no hover da mensagem** — `.hoverBarButton_f84418` dentro
 *    de `.popover_f84418` (arquivo
 *    `css-bruto/sob-demanda/982186.7b5a8121de5cffb9.css`). Botão: `padding:2px`
 *    + ícone `20px` = caixa **24×24**, `border-radius:6px` **literal** (não é
 *    nenhum passo de `--radius-*`, por isso a classe é `rounded-md`, o padrão
 *    puro do Tailwind, e não uma das quatro do `design.md`). Hover pinta
 *    `background: var(--interactive-background-hover)`, pressionado
 *    `--interactive-background-active`. O contêiner (`popover_f84418`) é
 *    `background: var(--background-surface-high)` — confirmado no print: a
 *    linha do hover em "nessa entrega de agora?" (y≈482) amostra `#242429`,
 *    exatamente `--background-surface-high`. Cor do ícone não medida em CSS
 *    (a família só troca o fundo); no print, `#abacb2` = `--icon-subtle`.
 * 3. **Painel "Voz conectada" / rodapé do usuário** — `.actionButtons_e131a9`/
 *    `.button_e131a9`/`.buttonIcon_e131a9` (arquivo
 *    `593586.fe57c064b52a9ea4.css`; a classe `.panelButton_` citada no cartão
 *    não existe no CSS capturado — esta é a mais próxima). Caixa
 *    `height: var(--space-32)` = **32px** (bate com a família 1), raio
 *    `var(--radius-sm)` = **8px**, ícone `20px!important` (bate com a família 1
 *    de novo). Cor do texto/ícone `--interactive-text-active` fixa; fundo
 *    repouso `--background-base-low` → hover `--background-base-lower` (há
 *    também uma variante `control-secondary-background-*` mais nova no mesmo
 *    arquivo, que parece vencer a cascata — os dois pares ficam registrados na
 *    entrega do cartão, nenhum dos dois é o que este componente usa). O
 *    gear/engrenagem solto do rodapé (fora do grid) só deu para medir o glifo
 *    no print (coluna x=333: ~20px de altura) — sem hover no print, a caixa e
 *    o fundo em repouso ficam "não medido".
 *
 * Dessas três, `sm` e `md` vêm de medida direta (32px aparece em duas famílias
 * independentes, o que dá confiança). `lg` (40px) **não tem par em nenhuma das
 * três** — nenhum print ou CSS desta leva isola um botão de ícone de 40px;
 * mantido por progressão (+8 sobre `md`) e sinalizado em "não verificado" na
 * entrega do cartão. O raio de `lg` segue o de `md` (`--radius-sm`) pela mesma
 * razão.
 *
 * A cor do texto sobe em dois patamares: sem `comFundo` (família 1, sempre
 * visível) começa **discreta** (`icon-muted`) porque fica plantada na tela o
 * tempo todo; com `comFundo` (famílias 2 e 3, só aparecem quando o contexto já
 * está em foco) começa um degrau acima — o mesmo valor de `icon-subtle`, que é
 * numericamente igual a `--interactive-text-default` (`#abacb2` nos dois).
 * Perigo (hover vermelho) não apareceu em nenhuma das três famílias medidas;
 * mantido `--text-feedback-critical` do provisório, que já é o token de perigo
 * do resto do app.
 */
export type TamanhoDeBotaoDeIcone = "sm" | "md" | "lg";

export interface BotaoDeIconeProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title"> {
  /** Vira `aria-label` e o texto da dica. Obrigatório: ícone sem nome não existe. */
  rotulo: string;
  icone: ReactNode;
  /**
   * `sm` 24 — barra de hover da mensagem (ícone medido em 20px) e ações de
   * canto de cartão (`AcaoDoCartao`, que hoje passa ícone de 16px; os dois
   * cabem na mesma caixa). `md` 32 (ícone 20, padrão — cabeçalho do canal e
   * painel "Voz conectada"). `lg` 40 (ícone 24 — não medido, ver cabeçalho do
   * arquivo).
   */
  tamanho?: TamanhoDeBotaoDeIcone;
  /** Estado ligado/selecionado (ex.: lista de membros aberta). */
  ativo?: boolean;
  /** Hover em vermelho (apagar, sair, desligar). */
  perigo?: boolean;
  /** Hover com fundo, não só cor. */
  comFundo?: boolean;
  /** Onde a dica aparece. Padrão `top`. */
  ladoDaDica?: LadoDaDica;
  /** Sem dica (quando outro elemento já nomeia o botão visualmente). */
  semDica?: boolean;
  /** Atalho mostrado na dica (ex.: "Ctrl+F"). */
  atalho?: string;
}

// Caixas medidas (ver cabeçalho): 24 e 32 saem de CSS+print; 40 é progressão,
// não medido. Px literal porque o número vem de medida, não da escala do tema.
const CAIXA: Record<TamanhoDeBotaoDeIcone, string> = {
  sm: "h-[24px] w-[24px] rounded-md", // 6px literal (`.hoverBarButton_`), não um passo de --radius-*
  md: "h-[32px] w-[32px] rounded-lg", // 8px = --radius-sm (`.button_e131a9`)
  lg: "h-[40px] w-[40px] rounded-lg", // raio por extensão do md; caixa não medida
};

export const BotaoDeIcone = forwardRef<HTMLButtonElement, BotaoDeIconeProps>(function BotaoDeIcone(
  {
    rotulo,
    icone,
    tamanho = "md",
    ativo = false,
    perigo = false,
    comFundo = false,
    ladoDaDica = "top",
    semDica = false,
    atalho,
    type = "button",
    className = "",
    ...resto
  },
  ref,
) {
  // Sem fundo (cabeçalho, família 1): a cor sobe em três degraus porque o
  // ícone fica sempre visível. Com fundo (barra de hover da mensagem e painel
  // de voz, famílias 2 e 3): já nasce um degrau acima, porque só aparece
  // quando o contexto já está em foco — ver a nota de proveniência no
  // cabeçalho do arquivo.
  const corTexto = comFundo
    ? ativo
      ? "text-interactive-text-active"
      : "text-interactive-text-default hover:text-interactive-text-hover"
    : ativo
      ? "text-icon-strong"
      : "text-icon-muted hover:text-icon-subtle";

  const botao = (
    <button
      ref={ref}
      type={type}
      aria-label={rotulo}
      aria-pressed={ativo || undefined}
      className={`grid shrink-0 place-items-center transition-colors disabled:pointer-events-none disabled:opacity-50 ${CAIXA[tamanho]} ${corTexto} ${
        perigo ? "hover:text-text-feedback-critical" : ""
      } ${
        comFundo ? "hover:bg-interactive-background-hover active:bg-interactive-background-active" : ""
      } ${className}`}
      {...resto}
    >
      {icone}
    </button>
  );
  if (semDica) return botao;
  return (
    <Tooltip rotulo={rotulo} lado={ladoDaDica} atalho={atalho}>
      {botao}
    </Tooltip>
  );
});
