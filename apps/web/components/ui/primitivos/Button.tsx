"use client";

import Link from "next/link";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

/**
 * Botão do Discord (refresh 2025): o módulo único `.button_a22cb0` de
 * `docs/referencias-discord/tokens/css-bruto/362698.047b6f205fd7bdc1.css`.
 *
 * Especificação medida (cartão 0.4-botao):
 * - Tamanhos (a borda de 1px conta na altura — `.xs_a22cb0/.sm_a22cb0/.md_a22cb0
 *   .buttonChildrenWrapper_a22cb0{min-height:…}` é o quadro **sem** borda; a borda
 *   mora no `<button>` de fora):
 *   `xs` quadro 22 + borda → 24, padding 3×7, raio `rounded` (`--radius-xs`);
 *   `sm` quadro 30 + borda → 32, padding 3×11, raio `rounded-lg` (`--radius-sm`);
 *   `md` quadro 38 + borda → 40, padding 7×15, raio `rounded-lg`. Não existe `lg`.
 *   `min-width` com texto: 60 (xs, sm) e 100 (md). Gap ícone–texto 4
 *   (`buttonChildren_a22cb0{gap:var(--space-4)}`).
 *   Conferido contra print 1:1 (`docs/Reference/Captura de tela 2026-08-31
 *   124052.png`, botão "Enviar pedido de amizade", sm): coluna x=705 dá borda em
 *   y=206/237 e miolo em y=207–236 → 206–237 = **32px**, bate. E contra
 *   `…124114.png` (Confirmar, md): coluna x=760 dá borda em y=390/429, miolo
 *   391–428 → 390–429 = **40px**, bate. (Janela desses dois prints é
 *   1282×722 e 1280×728, não 1919×1079 — não é o print "canônico" da ADR, mas
 *   é 1:1 do Discord real (zoom 100%, sem indício de escala) e é o que havia
 *   com botão de md/sm limpo; por isso o número entra como medido, não como
 *   "não medido".)
 * - Fonte do texto (não fixada no cabeçalho original, medida agora): o módulo
 *   `a22cb0` não define `font-size` do texto do botão — quem define é a classe
 *   de `Text` que o Discord injeta como filho, fora do CSS-por-hash daqui. Sem
 *   acesso a esse JS, a medida saiu do glifo nos dois prints acima: o "C" de
 *   "Confirmar" (md) tem cap-height 11px (y404–414) e o "E" de "Enviar" (sm) tem
 *   cap-height 10px (y217–226) — 11/10px de cap-height bate com fonte de
 *   16/14px (Noto Sans, cap-height ≈0,714×tamanho: 16×0,714=11,4; 14×0,714=10).
 *   Isso casa exatamente com as classes que já existem no projeto
 *   (`tailwind.config.ts`): `text-text-md` (16px/1,25) para `md`, `text-text-sm`
 *   (14px/1,2857) para `sm`. Peso: o par do Discord para botão é sempre a
 *   variante `/medium` da escala de texto (`text-md/medium_cf4812` = weight
 *   500) — `font-medium`, nunca `font-semibold`. **`xs` não foi medido num
 *   print** (não achei confirmação de modal com botão `xs` com texto); por
 *   forma (mesmo `min-width`/padding-base de `sm`, só a altura difere) ele leva
 *   o mesmo `text-text-sm`/`font-medium` de `sm` — ver "nao_verificado".
 * - Variantes → tokens `--control-*` (fundo/texto/borda × default/hover/active;
 *   ícone segue o mesmo valor do texto em todas as variantes medidas, então um
 *   token de cor só resolve os dois via herança de `color`):
 *   `primario` = `control-primary-*` (limão; texto e ícone ESCUROS — regra do
 *   accent, já no token), `secundario` = `control-secondary-*`,
 *   `critico` = `control-critical-primary-*`, `critico-secundario` =
 *   `control-critical-secondary-*`, `positivo` = `control-connected-*`,
 *   `link` = texto `text-link` sem fundo nem borda (sublinha no hover).
 *   A borda **não** é `border-transparent`: cada variante tem
 *   `--control-*-border-*` próprio (`#ffffff14`/`#9999990a`, quase invisível
 *   mas não nulo — é um relevo de 1px, não decoração).
 *   `critico`/`critico-secundario`: os tokens existem em `tokens.css`
 *   (`--control-critical-primary-*`, `--control-critical-secondary-*`) mas o
 *   seletor de classe (`.critical…_a22cb0` ou equivalente) não apareceu no CSS
 *   bruto disponível — só os nomes de token, sem a classe que os liga ao
 *   componente. Uso os tokens direto (é a única fonte que existe) e registro
 *   aqui por não ter print de confirmação com botão `critico`.
 * - Desabilitado: `opacity .5; pointer-events: none`.
 * - Carregando: o conteúdo sobe e some (`translateY(-100%)`, opacidade 0) e três
 *   pontos na cor do texto entram no lugar (opacidade 0→1, `translateY(100%→0)`
 *   — espelha a saída do conteúdo), sem mudar a medida do botão
 *   (`position:relative;overflow:hidden` no `<button>`, o spinner é absoluto).
 *   Os pontos em si (`.pulsingEllipsis__46696` no mesmo arquivo): 3 bolinhas de
 *   6×6, raio 3px (não é `--radius-*`, é hardcoded no spinner genérico do
 *   Discord), `gap` 2px, cor `currentColor` (`.spinnerItem_a22cb0{background-
 *   color:currentColor!important}` — por isso herdam a cor do texto de cada
 *   variante sem prop extra), anima `opacity 1→.3→1` e `scale 1→.8→1` em 1,4s
 *   `ease-in-out infinite`, com o 2º ponto a +0,2s e o 3º a +0,4s.
 * - Só ícone (sem `children`): quadrado do tamanho (24/32/40), sem padding.
 * - `larguraTotal` só vale com texto, como no Discord
 *   (`.fullWidth_a22cb0.hasText_a22cb0`) — ignorado num botão só-ícone.
 * - Foco de teclado: **não** reimplementado aqui — o `:focus-visible` global de
 *   `globals.css` cobre o `<button>` sem precisar de classe local. Ele casa por
 *   pseudo-classe, não por seletor de tag, então cobre o `<a>` do `href` igual.
 *
 * ---
 * Rodada de correção (cartão c1-button): o que a migração da onda 0 precisou e
 * não existia. Nada abaixo muda o comportamento de quem já usa o componente.
 *
 * - **`href` (link com cara de botão).** O Discord desenha o mesmo botão em
 *   `<a>`: `.button_a22cb0` não tem nenhum seletor de tag (é `.button_a22cb0`
 *   puro, e a regra de reset `background:initial;border:1px solid transparent;
 *   color:inherit;margin:0;padding:0` existe justamente para servir aos dois),
 *   e `.lookBlank__201d5,.lookLink__201d5{border:none}` no módulo antigo é
 *   aplicada em `<a>` e `<button>` sem distinção. Ou seja: **visual idêntico,
 *   zero medida nova**. Rota interna (começa com `/` e não com `//`) sai em
 *   `next/link` para não recarregar o app; o resto sai em `<a>` cru.
 *   Desabilitado num `<a>` não existe em HTML — o próprio Discord resolve por
 *   `[aria-disabled=true]` (`.button__201d5:disabled,.button__201d5[aria-
 *   disabled=true]{cursor:not-allowed;opacity:.5}`), então o `href` some (um
 *   `<a>` sem `href` sai da ordem de tabulação) e o par `pointer-events-none
 *   opacity-50` entra por classe, já que a variante `disabled:` do Tailwind não
 *   pega em `<a>`.
 * - **`neutro` (o terciário/"ghost").** Base em `.lookBlank__201d5{background:
 *   transparent;border:0;color:currentColor;margin:0;padding:0}` — sem fundo,
 *   sem borda e **sem padding**; por isso `neutro` também não recebe o
 *   `min-width` de 60/100, que só faz sentido para caixa preenchida. A cor o
 *   `lookBlank` não fixa (`color:currentColor`): o par é o do ghost de texto do
 *   Discord, `--text-muted` em repouso e `--text-strong` no hover, medido em
 *   `.nonGroupSectionHeaderHideButton__606e9{color:var(--text-muted)}` +
 *   `:hover{color:var(--text-strong)}` (`274972.3ce052fc3fb980e8.css`), o mesmo
 *   par de `.sectionCollapsible__606e9` e `.sortTrigger__31004`. Sem sublinhado
 *   (nenhuma dessas regras tem `text-decoration`). A **altura** continua a do
 *   `tamanho` (alvo de clique) — isso o `lookBlank` não diz, é decisão nossa,
 *   ver "nao_verificado".
 * - **`link`/`critico-link` agora são inline.** Antes `link` herdava altura,
 *   `min-width` e padding de botão e não cabia dentro de uma frase. O Discord
 *   tem exatamente esse caso e ele é um *tamanho*, não uma variante:
 *   `.sizeMin__201d5{display:inline;height:auto;padding:0 4px;width:auto}` +
 *   `.sizeMin__201d5 .contents__201d5{display:inline}`. Como `link` no nosso
 *   componente **só** serve a esse caso (as caixas são `secundario`/`neutro`),
 *   a variante já entra com `sizeMin`: `inline`, altura automática, sem
 *   `min-width`, sem borda. **Divergência consciente:** o padding lateral de
 *   4px do `sizeMin` fica em 0 aqui, porque todos os presos deste cartão são
 *   link no meio de uma frase, onde 4px de cada lado lê como espaço de palavra
 *   (no Discord o `sizeMin` aparece isolado). Está em "faltando" para o
 *   coordenador decidir. Cor: `link` = `--text-link` e `critico-link` =
 *   `--text-feedback-critical`, medidos em `.lookLink__201d5.colorLink__201d5
 *   {color:var(--text-link)}` e `.lookLink__201d5.colorRed__201d5{color:var(
 *   --text-feedback-critical)}`. O sublinhado do hover é o mesmo dos dois
 *   (`--button--underline-color` no hover) — aqui `hover:underline`.
 * - **`tamanho` numérico** (altura em px): para as peças fora de 24/32/40, que
 *   o Discord não tem. A altura vem do chamador (via `style`, porque o JIT do
 *   Tailwind não enxerga classe montada em tempo de execução) e **não** traz
 *   `min-width`; raio, fonte e padding saem do degrau medido mais próximo por
 *   baixo (≤24 → `xs`, ≤32 → `sm`, senão `md`). Essa interpolação é derivada,
 *   **não medida** — não existe degrau intermediário no CSS do Discord.
 * - **`data-*` passa pelo `...resto`.** Vale para `<Button data-teste="x">`: o
 *   TypeScript não confere atributo JSX com hífen contra as props do
 *   componente (nomes hifenizados ficam fora da checagem de excesso), e o
 *   atributo cai no `...resto` e é cuspido no `<button>`/`<a>` como qualquer
 *   outro. Não é preciso `<button>` nativo para pendurar seletor de e2e.
 */
export type VarianteDeBotao =
  | "primario"
  | "secundario"
  | "critico"
  | "critico-secundario"
  | "positivo"
  | "neutro"
  | "link"
  | "critico-link";

/** Os três degraus que o Discord define (24/32/40 de altura total). */
export type TamanhoNomeadoDeBotao = "xs" | "sm" | "md";
/** Um degrau do Discord, ou uma altura em px para o que está fora deles. */
export type TamanhoDeBotao = TamanhoNomeadoDeBotao | number;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Padrão `primario`. */
  variante?: VarianteDeBotao;
  /** Padrão `md` (40px). Número = altura em px, sem `min-width`. */
  tamanho?: TamanhoDeBotao;
  /** Ícone à esquerda do texto. Sem `children`, o botão vira quadrado. */
  icone?: ReactNode;
  /** Ícone à direita do texto (chevron, seta externa). */
  iconeDireita?: ReactNode;
  /** Troca o conteúdo pelos três pontos sem mudar a medida; bloqueia o clique. */
  carregando?: boolean;
  /** Ocupa a largura do pai (só com texto). */
  larguraTotal?: boolean;
  /** Raio de pílula (`--radius-round`). */
  pilula?: boolean;
  /**
   * Desenha um `<a>` com o mesmo visual (rota interna vira `next/link`).
   * `disabled`/`carregando` tiram o `href`, o que já tira o link do Tab.
   */
  href?: string;
  /** `target` do `<a>` (só com `href`). Com `_blank`, o `rel` ganha um padrão. */
  alvo?: string;
  /** `rel` do `<a>` (só com `href`). */
  rel?: string;
}

// Fundo / texto+ícone (herdado por `color`) / borda, por estado — na ordem que
// o CSS do Discord aplica (default, depois :hover, depois :active).
const VARIANTES: Record<VarianteDeBotao, string> = {
  primario:
    "bg-control-primary-background-default text-control-primary-text-default border-control-primary-border-default hover:bg-control-primary-background-hover hover:text-control-primary-text-hover hover:border-control-primary-border-hover active:bg-control-primary-background-active active:text-control-primary-text-active active:border-control-primary-border-active",
  secundario:
    "bg-control-secondary-background-default text-control-secondary-text-default border-control-secondary-border-default hover:bg-control-secondary-background-hover hover:text-control-secondary-text-hover hover:border-control-secondary-border-hover active:bg-control-secondary-background-active active:text-control-secondary-text-active active:border-control-secondary-border-active",
  critico:
    "bg-control-critical-primary-background-default text-control-critical-primary-text-default border-control-critical-primary-border-default hover:bg-control-critical-primary-background-hover hover:text-control-critical-primary-text-hover hover:border-control-critical-primary-border-hover active:bg-control-critical-primary-background-active active:text-control-critical-primary-text-active active:border-control-critical-primary-border-active",
  "critico-secundario":
    "bg-control-critical-secondary-background-default text-control-critical-secondary-text-default border-control-critical-secondary-border-default hover:bg-control-critical-secondary-background-hover hover:text-control-critical-secondary-text-hover hover:border-control-critical-secondary-border-hover active:bg-control-critical-secondary-background-active active:text-control-critical-secondary-text-active active:border-control-critical-secondary-border-active",
  positivo:
    "bg-control-connected-background-default text-control-connected-text-default border-control-connected-border-default hover:bg-control-connected-background-hover hover:text-control-connected-text-hover hover:border-control-connected-border-hover active:bg-control-connected-background-active active:text-control-connected-text-active active:border-control-connected-border-active",
  // `lookBlank` + o par muted→strong do ghost de texto (ver cabeçalho).
  neutro: "bg-transparent border-transparent text-text-muted hover:text-text-strong",
  link: "bg-transparent border-transparent text-text-link hover:underline",
  "critico-link": "bg-transparent border-transparent text-text-feedback-critical hover:underline",
};

/** Variantes sem caixa nenhuma (`sizeMin__201d5`): vivem dentro de uma frase. */
const VARIANTES_INLINE: readonly VarianteDeBotao[] = ["link", "critico-link"];
/** Variantes com caixa, mas sem preenchimento: perdem padding e `min-width`. */
const VARIANTES_SEM_PREENCHIMENTO: readonly VarianteDeBotao[] = ["neutro"];

// Altura total (borda incluída), padding do miolo e largura mínima com texto —
// ver o cabeçalho para a origem de cada número.
const TAMANHOS: Record<
  TamanhoNomeadoDeBotao,
  { altura: string; raio: string; textoIcone: string; larguraMinima: string; padding: string; quadrado: string }
> = {
  xs: { altura: "h-[24px]", raio: "rounded", textoIcone: "text-text-sm", larguraMinima: "min-w-[60px]", padding: "py-[3px] px-[7px]", quadrado: "w-[24px]" },
  sm: { altura: "h-[32px]", raio: "rounded-lg", textoIcone: "text-text-sm", larguraMinima: "min-w-[60px]", padding: "py-[3px] px-[11px]", quadrado: "w-[32px]" },
  md: { altura: "h-[40px]", raio: "rounded-lg", textoIcone: "text-text-md", larguraMinima: "min-w-[100px]", padding: "py-[7px] px-[15px]", quadrado: "w-[40px]" },
};

/**
 * Traduz o `tamanho` em classes. No caso numérico a altura sai por `style` (o
 * JIT do Tailwind lê o código-fonte, não enxerga `h-[${n}px]` montado em tempo
 * de execução) e o `min-width` some — quem pede altura fora dos degraus está
 * encaixando o botão em algo, não desenhando um botão de diálogo.
 */
function medidasDoTamanho(tamanho: TamanhoDeBotao) {
  if (typeof tamanho !== "number") {
    return { ...TAMANHOS[tamanho], alturaEmPx: null as number | null };
  }
  const degrau = tamanho <= 24 ? TAMANHOS.xs : tamanho <= 32 ? TAMANHOS.sm : TAMANHOS.md;
  return { ...degrau, altura: "", larguraMinima: "", quadrado: "", alturaEmPx: tamanho };
}

/**
 * Três pontos que substituem o conteúdo em `carregando`. Cor = `currentColor`
 * (herda do texto da variante); medidas e tempo em `spinner-pulsing-ellipsis__
 * 46696` (ver cabeçalho do arquivo). `inline-flex` (e não `flex`) porque nas
 * variantes inline ele é filho de um elemento `display:inline` — um flex de
 * nível de bloco ali quebraria a linha da frase.
 */
function TresPontos() {
  return (
    <span className="inline-flex items-center gap-0.5" role="status" aria-label="Carregando">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[6px] w-[6px] rounded-[3px] bg-current anim-pulso-do-botao"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variante = "primario",
    tamanho = "md",
    icone,
    iconeDireita,
    carregando = false,
    larguraTotal = false,
    pilula = false,
    href,
    alvo,
    rel,
    type = "button",
    className = "",
    style,
    disabled,
    children,
    ...resto
  },
  ref,
) {
  const temTexto = children != null && children !== false;
  const ehInline = VARIANTES_INLINE.includes(variante);
  const semPreenchimento = ehInline || VARIANTES_SEM_PREENCHIMENTO.includes(variante);
  const desativado = disabled === true || carregando;
  const m = medidasDoTamanho(tamanho);

  // Altura (e, no botão só-ícone, largura) do tamanho numérico. O `style` do
  // chamador vem depois de propósito: quem passa medida explícita manda.
  const estiloDaCaixa: CSSProperties | undefined =
    m.alturaEmPx !== null && !ehInline
      ? temTexto
        ? { height: m.alturaEmPx, minHeight: m.alturaEmPx, ...style }
        : { height: m.alturaEmPx, minHeight: m.alturaEmPx, width: m.alturaEmPx, minWidth: m.alturaEmPx, ...style }
      : style;

  const classeDoMiolo = temTexto
    ? `${semPreenchimento ? "p-0" : `${m.padding} ${m.larguraMinima}`} ${larguraTotal ? "w-full flex-1" : "flex-none"}`
    : `${m.quadrado} flex-none p-0`;

  const classes = ehInline
    ? // `sizeMin__201d5`: nenhuma caixa. Sem altura, sem largura mínima, sem
      // padding e sem borda — o link ocupa o que a frase dá a ele.
      `inline h-auto min-h-0 w-auto min-w-0 border-0 p-0 text-left align-baseline font-medium transition-colors duration-150 ease-out ${VARIANTES[variante]} ${desativado ? "pointer-events-none opacity-50" : ""} ${className}`
    : `relative box-border inline-flex items-center justify-center overflow-hidden border font-medium transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 ${VARIANTES[variante]} ${m.altura} ${pilula ? "rounded-full" : m.raio} ${m.textoIcone} ${classeDoMiolo} ${className}`;

  const conteudo = ehInline ? (
    // Inline não tem caixa fixa para o spinner sobrepor: em `carregando` os três
    // pontos entram no lugar do texto mesmo (a frase muda de largura, e é o
    // certo aqui — o botão de caixa é que não pode pular).
    carregando ? (
      <TresPontos />
    ) : (
      <>
        {icone}
        {temTexto ? children : null}
        {iconeDireita}
      </>
    )
  ) : (
    <>
      {/* Conteúdo: sobe e some em `carregando` (translateY -100% + opacidade 0),
          nunca muda a caixa do botão porque ela é fixada pelo `<button>` (altura
          + min-width acima), não por este miolo. */}
      <span
        className={`flex items-center justify-center gap-1 whitespace-nowrap transition-[opacity,transform] duration-200 ease-out ${
          carregando ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        {icone}
        {temTexto ? <span className="truncate">{children}</span> : null}
        {iconeDireita}
      </span>
      {/* Spinner: sempre no DOM (para a transição de entrada/saída existir nos
          dois sentidos), escondido por padrão — o espelho do miolo acima. */}
      <span
        aria-hidden={!carregando || undefined}
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200 ease-out ${
          carregando ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        }`}
      >
        {carregando ? <TresPontos /> : null}
      </span>
    </>
  );

  if (href !== undefined) {
    // `resto` está tipado como atributo de `<button>` (a interface estende
    // `ButtonHTMLAttributes` e continua estendendo, para não quebrar quem já
    // usa). Sobra `form`/`name`/`value`, que não existem em `<a>`; a conversão
    // dupla é o preço de manter a API antiga intacta em vez de tornar o
    // componente polimórfico por genérico.
    const props = resto as unknown as AnchorHTMLAttributes<HTMLAnchorElement>;
    const refDoLink = ref as unknown as Ref<HTMLAnchorElement>;
    // `_blank` sem `noopener` dá à aba nova acesso a `window.opener`. Padrão de
    // segurança, não medida do Discord — o chamador ainda pode sobrepor.
    const relFinal = rel ?? (alvo === "_blank" ? "noopener noreferrer" : undefined);
    const comuns = {
      ...props,
      ref: refDoLink,
      className: classes,
      style: estiloDaCaixa,
      target: alvo,
      rel: relFinal,
      "aria-busy": carregando || undefined,
      // Sem `href` o `<a>` já sai da ordem de tabulação; o `aria-disabled` é o
      // que o Discord usa para anunciar e apagar (`[aria-disabled=true]`).
      "aria-disabled": desativado || undefined,
    };

    if (desativado) {
      return <a {...comuns}>{conteudo}</a>;
    }
    // Rota interna pelo roteador (sem recarregar o app); `//`, `http(s)://`,
    // `mailto:` e `#` continuam `<a>` cru.
    const rotaInterna = href.startsWith("/") && !href.startsWith("//");
    if (rotaInterna) {
      // `href` depois do spread de propósito: `AnchorHTMLAttributes` declara um
      // `href?` opcional, e deixá-lo por último tira qualquer dúvida sobre quem
      // vence (aqui, sempre o `href` da prop).
      return (
        <Link {...comuns} href={href}>
          {conteudo}
        </Link>
      );
    }
    return (
      <a {...comuns} href={href}>
        {conteudo}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={desativado}
      aria-busy={carregando || undefined}
      className={classes}
      style={estiloDaCaixa}
      {...resto}
    >
      {conteudo}
    </button>
  );
});
