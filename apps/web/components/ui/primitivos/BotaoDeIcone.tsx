"use client";

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from "react";
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
 * A cor do texto sobe em dois patamares: com `fundo="nenhum"` (família 1,
 * sempre visível) começa **discreta** (`icon-muted`) porque fica plantada na
 * tela o tempo todo; com fundo (famílias 2 e 3, só aparecem quando o contexto
 * já está em foco) começa um degrau acima — o mesmo valor de `icon-subtle`,
 * que é numericamente igual a `--interactive-text-default` (`#abacb2` nos dois).
 *
 * ── Rodada de correção (as cinco famílias que a migração encontrou) ────────
 *
 * 4. **Fundo permanente** (`fundo="sempre"`) — dois módulos independentes, com
 *    exatamente o mesmo quarteto de tokens: `.button__71c22` (28×28, disco) e
 *    `.actionButton_f8fa06` (36×36, disco, ícone `.icon_f8fa06` 20px). Repouso
 *    `background-color: var(--background-base-lower)`; hover
 *    `var(--interactive-background-hover)`; `:active`
 *    `var(--interactive-background-active)`. Tinta `--interactive-text-default`
 *    → hover `--interactive-text-hover` → `:active` `--interactive-text-active`.
 *    É a mesma progressão de tinta de `fundo="hover"`, só que o retângulo já
 *    nasce pintado — por isso as duas compartilham a paleta aqui.
 * 5. **Disco** (`forma="disco"`) — `border-radius:50%` em `.actionButton__20855`
 *    (36), `.actionButton_f8fa06` (36), `.bannerButton_fb7f94` (32) e
 *    `var(--radius-round)` em `.button__71c22` (28). Círculo perfeito, não um
 *    raio fixo: `rounded-full`.
 * 6. **Lados medidos**: 24 (`.hoverBarButton_f84418`), 28 (`.button__71c22`),
 *    32 (`.iconWrapper__9293f`, `.button_e131a9`, `.bannerButton_fb7f94` via
 *    `--custom-button-button-sm-height` = 32px), 36 (`.actionButton__20855`,
 *    `.actionButton_f8fa06`, `.headerIconButton_eb881a`), 44 (`.button_f563df`,
 *    raio 8). **Em todos eles o glifo é 20px** — `.actionIcon__20855`,
 *    `.icon_f8fa06`, `.icon_f563df`, `--chat-input-icon-size`, `buttonIcon_e131a9`.
 *    Ou seja: no Discord o ícone **não** cresce com a caixa entre 24 e 44, e um
 *    "ícone proporcional" por regra de três seria invenção. Daí o padrão do
 *    lado numérico ser 20 e existir `tamanhoDoIcone` para o resto. **52 e 56
 *    não foram medidos** como botão de ícone (o único 52 do CSS,
 *    `.soundButton_d9cf5f`, é 52×96, um cartão de som, não um botão de ícone):
 *    quem usar esses lados escolhe o glifo na mão.
 * 7. **Tons** — o par accept/deny de `.actionButton_f8fa06` é a medida:
 *    `.actionAccept_f8fa06:hover{color:var(--icon-feedback-positive)}` e
 *    `.actionDeny_f8fa06:hover{color:var(--icon-feedback-critical)}`. O
 *    provisório usava `--text-feedback-critical` no perigo; trocado pelo token
 *    de ícone, que é o medido — **sem mudança de pixel**, os dois resolvem
 *    `#f87e7a` em `app/tokens.css`. `tom="ativo"` (fundo persistente de ligado)
 *    sai de `.isSelected__3b3ff{background-color:var(--interactive-background-selected);
 *    color:var(--interactive-text-active)}`; o hover desse estado **não foi
 *    medido**, e por isso ele não muda no hover.
 * 8. **Desabilitado que mantém a dica** — `.bannerButton_fb7f94.disabled_fb7f94
 *    {cursor:normal;opacity:.5}`: opacidade 50%, e o elemento continua no fluxo
 *    de ponteiro (o Discord não põe `pointer-events:none` nessa variante; põe,
 *    numa outra, `.actionButton_f8fa06.disabled_f8fa06{opacity:.3;
 *    pointer-events:none}`). Usamos a primeira **de propósito**: `<button
 *    disabled>` não dispara evento de ponteiro nenhum no Chromium, então a dica
 *    que explica *por que* o botão está cinza nunca apareceria — é o mesmo
 *    raciocínio que `components/chat/HeaderIcon.tsx` já tinha escrito à mão.
 *    Por isso `desabilitado` usa `aria-disabled` e **não** o atributo nativo: o
 *    clique some no componente, a dica fica. O `disabled` nativo continua
 *    passando por `...resto` para quem quiser o comportamento antigo.
 *
 * ── Rodada 2p-primitivos (onda 2; só aditiva) ──────────────────────────────
 *
 * A onda 1 desenhou à mão o que o primitivo não cobria: o `HeaderIcon` do
 * cabeçalho do canal e os três controles da barra de título do desktop
 * (`desktop/BarraDeTitulo.tsx`, `Controle`). O que faltava:
 *
 * 9. **Sem raio** (`forma="reto"`). Nem `.iconWrapper__9293f` (cabeçalho do
 *    canal, `858942.086f3345af1722be.css`) nem `.winButton_c38106` (barra de
 *    título) declaram `border-radius`. No cabeçalho não aparece (não há
 *    fundo); na barra de título aparece, porque o hover pinta a caixa inteira
 *    e o canto tem de ser vivo.
 * 10. **Hover sólido crítico** (`fundo="hover-critico"`), o "fechar" da barra
 *    de título: `.winButtonClose_c38106:hover{background-color:var(
 *    --control-critical-primary-background-default);color:var(
 *    --control-critical-primary-icon-default)}`. Repouso `.winButtons_c38106
 *    {color:var(--interactive-text-default)}`. É um vermelho opaco, e não o
 *    cinza translúcido `--interactive-background-hover` de `fundo="hover"`
 *    (que é o do minimizar/maximizar, `.winButtonMinMax_c38106:hover`).
 *    Existe uma segunda família antiga, `.winButtonClose__421ed:hover`
 *    (`--background-feedback-critical` a 8% com texto `--white`, caixa 28×22);
 *    a `c38106` é a que casa com a altura de 32 da barra
 *    (`.winButton_c38106{height:var(--custom-app-top-bar-height);width:var(
 *    --custom-app-top-bar-height)}`, 32px em VARIAVEIS.md), por isso é ela.
 * 11. **Opacidade do desabilitado por família** (`opacidadeDesabilitado`): 50
 *    (`.bannerButton_fb7f94.disabled_fb7f94`, o padrão de sempre), 60
 *    (`.iconDisabled__9293f{opacity:.6}`, cabeçalho do canal) e 30
 *    (`.actionButton_f8fa06.disabled_f8fa06{opacity:.3}`; é também o que
 *    `desktop/BarraDeTitulo.tsx` mediu nas setas apagadas e hoje escreve como
 *    `className="opacity-30"`).
 * 12. **Receitas** (`variante`): as combinações acima com nome, para a tela não
 *    remontar o quarteto a cada uso. `cabecalho` = caixa 32 (`--space-32`),
 *    sem raio, sem fundo, glifo 20 (`--chat-input-icon-size`), desabilitado a
 *    60. `janela` = 32×32 sem raio, `fundo="hover"`, sem dica. `janela-fechar`
 *    = igual, com `fundo="hover-critico"`. "Sem dica" nas duas de janela
 *    porque o Discord não mostra dica nesses controles (registrado no
 *    cabeçalho de `BarraDeTitulo.tsx`). Prop escrita sempre vence a receita.
 *
 * ── Rodada de correção (cartão botao-de-icone-familias) ────────────────────
 *
 * 13. **Fundo `hover-selecionado`** — `.emojiButton__74017`/`.attachButton__36c1b`
 *    do composer (`css-bruto/962953…css`): repouso `--interactive-text-default`,
 *    hover pinta `background-color:var(--interactive-background-selected)` com
 *    a tinta subindo a `--interactive-text-active` — um degrau mais forte que
 *    `fundo="hover"` (que pinta `--interactive-background-hover`/
 *    `--interactive-text-hover`). Os dois eram tratados como a mesma família;
 *    não são.
 * 14. **Fundo `nenhum-interativo`** — o par que faltava para "sem retângulo em
 *    estado algum" (como `fundo="nenhum"`) mas com a tinta de `interactive-text-*`
 *    em vez de `icon-*` — o caso do botão de emoji do status personalizado
 *    (`.clearIcon_dbc4b7{color:var(--interactive-text-default)}`, sem fundo em
 *    nenhum estado).
 * 15. **Prop `selecionado`** — preenchimento fixo e mais fraco que `tom="ativo"`
 *    (`bg-background-base-low`, o "selecionado" do trilho vertical do
 *    `SeletorDeComandos`, `.wrapper_ca5f52` no CSS: hover
 *    `--interactive-background-hover`, selecionado `--background-base-low`),
 *    sem hover por cima (o mesmo raciocínio de `tom="ativo"`, item 7: o
 *    preenchimento persistente não é um estado que o hover deva riscar). Ao
 *    contrário de `tom="ativo"`, não é sobre feedback (aceitar/recusar) nem
 *    sobre a tinta do ícone — só o fundo; por isso vira prop própria, e não
 *    mais um `tom`.
 * 16. **Degrau `acao`** (`tamanho="acao"`) — `.actionButton_f8fa06{height:36px;
 *    width:36px}` (item 6 do cabeçalho já cita o módulo): a linha de amigos
 *    passava esse valor por `className` (`h-9 w-9`), que o `CAIXA[degrau]` do
 *    tamanho nomeado vencia (32, não 36) por entrar depois no template de
 *    classes — precisa ser um degrau de verdade, não um `className` que perde
 *    a competição de cascata.
 */
export type TamanhoDeBotaoDeIcone = "sm" | "md" | "lg" | "acao";
/** Lado da caixa: um degrau nomeado, ou o número em px que veio de medida. */
export type LadoDeBotaoDeIcone = TamanhoDeBotaoDeIcone | number;
export type FormaDeBotaoDeIcone = "quadrado" | "disco" | "reto";
export type FundoDeBotaoDeIcone =
  | "nenhum"
  | "hover"
  | "hover-selecionado"
  | "sempre"
  | "hover-critico"
  | "nenhum-interativo";
export type TomDeBotaoDeIcone = "neutro" | "perigo" | "positivo" | "ativo";
/** Receitas de família medidas (item 12 do cabeçalho). */
export type VarianteDeBotaoDeIcone = "cabecalho" | "janela" | "janela-fechar";
/** Opacidade do desabilitado, em %, pelas famílias medidas (item 11). */
export type OpacidadeDeBotaoDesabilitado = 30 | 50 | 60;

export interface BotaoDeIconeProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title">,
    Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "download" | "target" | "rel"> {
  /** Vira `aria-label` e o texto da dica. Obrigatório: ícone sem nome não existe. */
  rotulo: string;
  icone: ReactNode;
  /**
   * `sm` 24 — barra de hover da mensagem (ícone medido em 20px) e ações de
   * canto de cartão (`AcaoDoCartao`, que hoje passa ícone de 16px; os dois
   * cabem na mesma caixa). `md` 32 (ícone 20, padrão — cabeçalho do canal e
   * painel "Voz conectada"). `lg` 40 (ícone 24 — não medido, ver cabeçalho do
   * arquivo). `acao` 36 (`.actionButton_f8fa06`, item 16 do cabeçalho) — os
   * botões redondos de ação de linha (conversar/mais da lista de amigos).
   *
   * **Número** = o lado em px (28, 36, 44… apareceram na migração). Nesse caso
   * a caixa vai em `style`, não em classe: Tailwind não gera `h-[${n}px]` de
   * valor dinâmico, e medida em px é px. Com lado numérico o primitivo passa a
   * **mandar no glifo** (20px, o valor medido de 24 a 44); `tamanhoDoIcone`
   * muda isso. Com `sm`/`md`/`lg` o glifo continua sendo o que o consumidor
   * passar em `icone`, como sempre foi.
   */
  tamanho?: LadoDeBotaoDeIcone;
  /**
   * Lado do glifo em px, quando o primitivo deve mandar nele. Sobrepõe o `size`
   * do ícone (CSS ganha de atributo de largura/altura do SVG).
   */
  tamanhoDoIcone?: number;
  /**
   * `quadrado` usa o raio do tamanho; `disco` é círculo (`border-radius:50%`);
   * `reto` não tem raio nenhum, como a toolbar do cabeçalho do canal e os
   * controles da barra de título (item 9 do cabeçalho).
   */
  forma?: FormaDeBotaoDeIcone;
  /**
   * `nenhum` sem retângulo em estado algum (cabeçalho do canal). `hover` só
   * pinta ao passar o ponteiro (barra da mensagem, painel de voz). `hover-
   * selecionado` é o mesmo, um degrau mais forte — `--interactive-background-
   * selected`/`--interactive-text-active` (item 13) — do composer
   * (emoji/anexar). `sempre` nasce pintado (botões sobre a faixa do perfil,
   * "voltar ao presente" da lista, discos do painel de voz). `hover-critico`
   * pinta um vermelho sólido só no hover, com o ícone claro por cima: o
   * "fechar" da barra de título (item 10). `nenhum-interativo` é como `nenhum`
   * (sem retângulo em estado algum) mas com a tinta de `interactive-text-*`
   * em vez de `icon-*` (item 14 — o botão de emoji do status personalizado).
   * Padrão: o que `comFundo` disser.
   *
   * **Falta uma quarta família, de propósito:** botão sobre *imagem* (a faixa
   * do perfil, o palco de vídeo) não é `--background-base-lower`, que é opaco —
   * o Discord usa `--control-overlay-secondary-background-*` com borda
   * `--opacity-white-8` (`.bannerButton_fb7f94`, 32×32 disco, medido). Enquanto
   * ela não existir aqui, esse caso continua com `className` próprio, como em
   * `TelaCheiaDeVideo`/`PalcoMobile`.
   */
  fundo?: FundoDeBotaoDeIcone;
  /**
   * `perigo` e `positivo` tingem o **hover** (apagar/recusar, aceitar);
   * `ativo` é o ligado de fundo persistente (ex.: som ligado). `neutro` é o
   * padrão. Ver item 7 do cabeçalho.
   */
  tom?: TomDeBotaoDeIcone;
  /**
   * Estado ligado/selecionado (ex.: lista de membros aberta). Vira
   * `aria-pressed` e sobe a tinta um degrau — é a **semântica**; quem quer o
   * retângulo pintado do ligado usa `tom="ativo"` junto.
   */
  ativo?: boolean;
  /**
   * Preenchimento fixo e mais fraco que `tom="ativo"` (`bg-background-base-
   * low`), sem hover por cima — o trilho do `SeletorDeComandos` (item 15 do
   * cabeçalho). Diferente de `ativo` (que só sobe a tinta) e de `tom="ativo"`
   * (que é sobre feedback, com a tinta de `interactive-text-active` junto):
   * aqui é só o fundo.
   */
  selecionado?: boolean;
  /** Atalho de `tom="perigo"`. Mantido para não quebrar os consumidores. */
  perigo?: boolean;
  /** Atalho de `fundo="hover"`. Mantido para não quebrar os consumidores. */
  comFundo?: boolean;
  /**
   * Vira `<a>` em vez de `<button>` — o caso do download de anexo, onde o
   * navegador exige âncora (`components/media/MediaGroup.tsx`). Combine com
   * `download`/`target`/`rel`.
   */
  href?: string;
  /**
   * Cinza **sem** matar a dica: `aria-disabled`, clique inerte, opacidade 50%
   * e hover congelado — mas o ponteiro continua chegando, então
   * `motivoDesabilitado` aparece na dica. Ver item 8 do cabeçalho.
   */
  desabilitado?: boolean;
  /**
   * Por que o botão está cinza. Sem isto a dica do desabilitado é o próprio
   * rótulo, que não explica nada.
   */
  motivoDesabilitado?: string;
  /** Onde a dica aparece. Padrão `top`. */
  ladoDaDica?: LadoDaDica;
  /** Sem dica (quando outro elemento já nomeia o botão visualmente). */
  semDica?: boolean;
  /** Atalho mostrado na dica (ex.: "Ctrl+F"). */
  atalho?: string;
  /**
   * Receita de uma família do Discord; qualquer prop escrita vence a receita.
   * - `cabecalho`: toolbar do cabeçalho do canal (`.iconWrapper__9293f`):
   *   caixa 32, sem raio, sem fundo, glifo 20, desabilitado a 60%.
   * - `janela`: minimizar/maximizar da barra de título
   *   (`.winButtonMinMax_c38106`): 32×32, sem raio, hover
   *   `--interactive-background-hover`, sem dica.
   * - `janela-fechar`: o fechar (`.winButtonClose_c38106`): igual, com o hover
   *   sólido `--control-critical-primary-background-default`.
   *
   * Ver item 12 do cabeçalho.
   */
  variante?: VarianteDeBotaoDeIcone;
  /**
   * Opacidade do `desabilitado` em %: `50` (padrão), `60` (cabeçalho do canal,
   * `.iconDisabled__9293f`) ou `30` (`.actionButton_f8fa06.disabled_f8fa06`, e
   * as setas apagadas da barra de título). Sem efeito se `desabilitado` for
   * falso. Ver item 11 do cabeçalho.
   */
  opacidadeDesabilitado?: OpacidadeDeBotaoDesabilitado;
}

interface ReceitaDeBotaoDeIcone {
  tamanho: LadoDeBotaoDeIcone;
  forma: FormaDeBotaoDeIcone;
  fundo: FundoDeBotaoDeIcone;
  tamanhoDoIcone?: number;
  opacidadeDesabilitado?: OpacidadeDeBotaoDesabilitado;
  semDica?: boolean;
}

// Origem de cada número no item 12 do cabeçalho. Os controles de janela não
// forçam o glifo: o desenho de 10px da barra de título vem do chamador.
const RECEITAS: Record<VarianteDeBotaoDeIcone, ReceitaDeBotaoDeIcone> = {
  cabecalho: { tamanho: "md", forma: "reto", fundo: "nenhum", tamanhoDoIcone: 20, opacidadeDesabilitado: 60 },
  janela: { tamanho: "md", forma: "reto", fundo: "hover", semDica: true },
  "janela-fechar": { tamanho: "md", forma: "reto", fundo: "hover-critico", semDica: true },
};

/** Classe literal por opacidade (o Tailwind só gera o que aparece no código). */
const OPACIDADE_DESABILITADO: Record<OpacidadeDeBotaoDesabilitado, string> = {
  30: "opacity-30",
  50: "opacity-50",
  60: "opacity-60",
};

// Caixas medidas (ver cabeçalho): 24 e 32 saem de CSS+print; 40 é progressão,
// não medido. Px literal porque o número vem de medida, não da escala do tema.
// Classe, e não `style`, porque há consumidor que sobrescreve a caixa pelo
// `className` (`BotaoDeSons` passa `h-8 w-full`) — `style` venceria e quebraria.
const CAIXA: Record<TamanhoDeBotaoDeIcone, string> = {
  sm: "h-[24px] w-[24px]",
  md: "h-[32px] w-[32px]",
  lg: "h-[40px] w-[40px]",
  acao: "h-[36px] w-[36px]",
};

// 6px literal no `sm` (`.hoverBarButton_f84418`), 8px = --radius-sm no resto
// (`.button_e131a9`, `.button_f563df`). O `lg` herda o do `md` por extensão.
// `acao` (36) é o mesmo --radius-sm de `.actionButton_f8fa06` (item 16).
const RAIO: Record<TamanhoDeBotaoDeIcone, string> = {
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-lg",
  acao: "rounded-lg",
};

/** Raio do lado numérico: 8px é o medido em 32 e em 44, os dois extremos. */
const RAIO_NUMERICO = "rounded-lg";

/** Glifo do lado numérico: 20px de 24 a 44, em cinco módulos (item 6). */
const ICONE_PADRAO = 20;

/**
 * A paleta por família de fundo. `hover` e `sempre` compartilham a tinta: os
 * módulos medidos (`.button_e131a9`, `.button__71c22`, `.actionButton_f8fa06`)
 * usam o mesmo trio `interactive-text-*`; a diferença entre as duas é só o
 * retângulo já nascer pintado.
 */
const PALETA: Record<FundoDeBotaoDeIcone, { repouso: string; hover: string; ativo: string; caixa: string; caixaHover: string }> = {
  nenhum: {
    repouso: "text-icon-muted",
    hover: "hover:text-icon-subtle",
    ativo: "text-icon-strong",
    caixa: "",
    caixaHover: "",
  },
  hover: {
    repouso: "text-interactive-text-default",
    hover: "hover:text-interactive-text-hover",
    ativo: "text-interactive-text-active",
    caixa: "",
    caixaHover: "hover:bg-interactive-background-hover active:bg-interactive-background-active",
  },
  // `.emojiButton__74017`/`.attachButton__36c1b` (item 13): um degrau mais
  // forte que `hover` — o hover pinta `interactive-background-selected` e a
  // tinta já sobe direto a `interactive-text-active`, sem o degrau
  // intermediário de `interactive-text-hover`.
  "hover-selecionado": {
    repouso: "text-interactive-text-default",
    hover: "hover:text-interactive-text-active",
    ativo: "text-interactive-text-active",
    caixa: "",
    caixaHover: "hover:bg-interactive-background-selected",
  },
  sempre: {
    repouso: "text-interactive-text-default",
    hover: "hover:text-interactive-text-hover",
    ativo: "text-interactive-text-active",
    caixa: "bg-background-base-lower",
    caixaHover: "hover:bg-interactive-background-hover active:bg-interactive-background-active",
  },
  // `.winButtons_c38106` (repouso) + `.winButtonClose_c38106:hover`. O CSS
  // não tem `:active` para o fechar, então não há degrau de pressionado.
  "hover-critico": {
    repouso: "text-interactive-text-default",
    hover: "hover:text-control-critical-primary-icon-default",
    ativo: "text-interactive-text-active",
    caixa: "",
    caixaHover: "hover:bg-control-critical-primary-background-default",
  },
  // Item 14: o par de `nenhum` (sem retângulo em estado algum) que faltava
  // com a tinta de `interactive-text-*` em vez de `icon-*`.
  "nenhum-interativo": {
    repouso: "text-interactive-text-default",
    hover: "hover:text-interactive-text-hover",
    ativo: "text-interactive-text-active",
    caixa: "",
    caixaHover: "",
  },
};

/** Hover tingido dos dois tons de feedback (`.actionAccept_`/`.actionDeny_`). */
const TINGE_HOVER: Record<TomDeBotaoDeIcone, string> = {
  neutro: "",
  perigo: "hover:text-icon-feedback-critical",
  positivo: "hover:text-icon-feedback-positive",
  ativo: "",
};

export const BotaoDeIcone = forwardRef<HTMLButtonElement, BotaoDeIconeProps>(function BotaoDeIcone(
  {
    rotulo,
    icone,
    // Sem padrão na desestruturação: a receita (`variante`) entra entre a prop
    // escrita e o padrão de sempre, resolvida logo abaixo.
    tamanho: tamanhoPedido,
    tamanhoDoIcone: iconePedido,
    forma: formaPedida,
    fundo,
    variante,
    opacidadeDesabilitado,
    tom,
    ativo = false,
    selecionado = false,
    perigo = false,
    comFundo = false,
    href,
    // Os três só existem no ramo âncora; saem de `resto` para não virarem
    // atributo inválido num `<button>`.
    download,
    target,
    rel,
    desabilitado = false,
    motivoDesabilitado,
    ladoDaDica = "top",
    semDica: semDicaPedido,
    atalho,
    type = "button",
    className = "",
    style,
    onClick,
    ...resto
  },
  ref,
) {
  // Compatibilidade: `comFundo`/`perigo` são as props antigas, e o padrão sem
  // nenhuma delas continua sendo "sem retângulo, tom neutro" — exatamente o
  // que os ~50 consumidores já montados esperam. As props novas vencem quando
  // vêm escritas. A receita só preenche o que ninguém escreveu: sem `variante`
  // cada linha abaixo cai no mesmo padrão de antes.
  const receita = variante ? RECEITAS[variante] : null;
  const tamanho: LadoDeBotaoDeIcone = tamanhoPedido ?? receita?.tamanho ?? "md";
  const tamanhoDoIcone = iconePedido ?? receita?.tamanhoDoIcone;
  const forma: FormaDeBotaoDeIcone = formaPedida ?? receita?.forma ?? "quadrado";
  const semDica = semDicaPedido ?? receita?.semDica ?? false;
  const opacidade = OPACIDADE_DESABILITADO[opacidadeDesabilitado ?? receita?.opacidadeDesabilitado ?? 50];
  const familia: FundoDeBotaoDeIcone = fundo ?? (comFundo ? "hover" : (receita?.fundo ?? "nenhum"));
  const tonalidade: TomDeBotaoDeIcone = tom ?? (perigo ? "perigo" : "neutro");
  const paleta = PALETA[familia];

  // O lado numérico e o lado nomeado seguem caminhos diferentes de propósito:
  // o nomeado vai em classe (para o `className` do consumidor ainda poder
  // sobrescrever a caixa), o numérico vai em `style` (o Tailwind não gera
  // `h-[${n}px]` de valor calculado em tempo de execução).
  const ladoEmPx = typeof tamanho === "number" ? tamanho : null;
  const degrau: TamanhoDeBotaoDeIcone = typeof tamanho === "number" ? "md" : tamanho;
  const ladoIcone = tamanhoDoIcone ?? (ladoEmPx === null ? undefined : ICONE_PADRAO);

  const medidas = ladoEmPx === null ? null : { height: ladoEmPx, width: ladoEmPx };
  // Variável CSS em vez de `h-[Npx]`: o valor é dinâmico e o Tailwind só gera
  // classe que exista literalmente no código-fonte.
  const glifo = ladoIcone == null ? null : ({ "--icone-do-botao": `${ladoIcone}px` } as CSSProperties);
  const classeDoGlifo = ladoIcone == null ? "" : "[&>svg]:h-[var(--icone-do-botao)] [&>svg]:w-[var(--icone-do-botao)]";

  const caixa = ladoEmPx === null ? CAIXA[degrau] : "";
  // `reto` não emite classe de raio nenhuma (item 9 do cabeçalho)
  const raio =
    forma === "disco" ? "rounded-full" : forma === "reto" ? "" : ladoEmPx === null ? RAIO[degrau] : RAIO_NUMERICO;

  // `tom="ativo"` é o ligado com retângulo persistente: ele troca o fundo
  // inteiro, então vence a família. Hover desse estado não foi medido — fica
  // parado de propósito, em vez de inventar um degrau.
  const ligado = tonalidade === "ativo";
  const tinta = ligado ? "text-interactive-text-active" : ativo ? paleta.ativo : paleta.repouso;
  // `selecionado` (item 15) é só o fundo — mais fraco que `ligado`, que também
  // muda a tinta — e vence a família porque, como `ligado`, é um preenchimento
  // persistente que o hover não deve riscar por cima.
  const preenchimento = ligado
    ? "bg-interactive-background-selected"
    : selecionado
      ? "bg-background-base-low"
      : paleta.caixa;

  // O tom tingido **substitui** o hover neutro, não soma a ele: duas classes
  // `hover:text-*` no mesmo elemento deixariam a cor por conta da ordem do CSS
  // gerado. No Discord é a mesma hierarquia — `.actionDeny_f8fa06:hover` vence
  // `.actionButton_f8fa06:hover` por especificidade.
  const hoverDeTinta = ativo || ligado ? "" : TINGE_HOVER[tonalidade] || paleta.hover;
  // Desabilitado congela o hover (o ponteiro continua chegando, senão a dica
  // sumiria — ver item 8 do cabeçalho), e o `disabled` nativo, se alguém ainda
  // o passar por `...resto`, continua com o par `disabled:` de sempre.
  // `selecionado` anula o `caixaHover` da família (item 15): o preenchimento já
  // está lá, e um hover por cima dele nunca foi medido.
  const reativo = desabilitado
    ? `cursor-not-allowed ${opacidade}`
    : `${hoverDeTinta} ${selecionado ? "" : paleta.caixaHover}`;

  const classes = `grid shrink-0 place-items-center transition-colors disabled:pointer-events-none disabled:opacity-50 ${caixa} ${raio} ${classeDoGlifo} ${tinta} ${preenchimento} ${reativo} ${className}`;
  const estilo = medidas || glifo ? { ...medidas, ...glifo, ...style } : style;

  const alvo = href ? (
    <a
      // O ref do primitivo é tipado como `HTMLButtonElement` porque é o que os
      // consumidores declaram (`useRef<HTMLButtonElement>`); no ramo âncora o
      // elemento é outro, e só aqui o cast existe.
      ref={ref as unknown as Ref<HTMLAnchorElement>}
      href={desabilitado ? undefined : href}
      download={download}
      target={target}
      rel={rel}
      aria-label={rotulo}
      aria-disabled={desabilitado || undefined}
      className={classes}
      style={estilo}
      onClick={desabilitado ? undefined : (onClick as unknown as MouseEventHandler<HTMLAnchorElement>)}
      {...(resto as unknown as AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {icone}
    </a>
  ) : (
    <button
      ref={ref}
      type={type}
      aria-label={rotulo}
      aria-pressed={ativo || undefined}
      aria-disabled={desabilitado || undefined}
      className={classes}
      style={estilo}
      onClick={desabilitado ? undefined : onClick}
      {...resto}
    >
      {icone}
    </button>
  );

  if (semDica) return alvo;
  // A dica do desabilitado explica o cinza; sem motivo, ela volta a ser o
  // rótulo (melhor repetir o nome do que mentir um motivo).
  const dica = desabilitado ? (motivoDesabilitado ?? rotulo) : rotulo;
  return (
    <Tooltip rotulo={dica} lado={ladoDaDica} atalho={atalho}>
      {alvo}
    </Tooltip>
  );
});
