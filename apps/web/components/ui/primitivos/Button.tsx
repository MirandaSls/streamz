"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

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
 *   `globals.css` cobre o `<button>` sem precisar de classe local.
 */
export type VarianteDeBotao =
  | "primario"
  | "secundario"
  | "critico"
  | "critico-secundario"
  | "positivo"
  | "link";
export type TamanhoDeBotao = "xs" | "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Padrão `primario`. */
  variante?: VarianteDeBotao;
  /** Padrão `md` (40px). */
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
  link: "bg-transparent border-transparent text-text-link hover:underline",
};

// Altura total (borda incluída), padding do miolo e largura mínima com texto —
// ver o cabeçalho para a origem de cada número.
const TAMANHOS: Record<TamanhoDeBotao, { altura: string; raio: string; textoIcone: string; comTexto: string; semTexto: string }> = {
  xs: { altura: "h-[24px]", raio: "rounded", textoIcone: "text-text-sm", comTexto: "min-w-[60px] py-[3px] px-[7px]", semTexto: "w-[24px]" },
  sm: { altura: "h-[32px]", raio: "rounded-lg", textoIcone: "text-text-sm", comTexto: "min-w-[60px] py-[3px] px-[11px]", semTexto: "w-[32px]" },
  md: { altura: "h-[40px]", raio: "rounded-lg", textoIcone: "text-text-md", comTexto: "min-w-[100px] py-[7px] px-[15px]", semTexto: "w-[40px]" },
};

/**
 * Três pontos que substituem o conteúdo em `carregando`. Cor = `currentColor`
 * (herda do texto da variante); medidas e tempo em `spinner-pulsing-ellipsis__
 * 46696` (ver cabeçalho do arquivo).
 */
function TresPontos() {
  return (
    <span className="flex items-center gap-0.5" role="status" aria-label="Carregando">
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
    type = "button",
    className = "",
    disabled,
    children,
    ...resto
  },
  ref,
) {
  const temTexto = children != null && children !== false;
  const t = TAMANHOS[tamanho];

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`relative box-border inline-flex items-center justify-center overflow-hidden border font-medium transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 ${VARIANTES[variante]} ${t.altura} ${pilula ? "rounded-full" : t.raio} ${t.textoIcone} ${
        temTexto && larguraTotal
          ? `${t.comTexto} w-full flex-1`
          : temTexto
            ? `${t.comTexto} flex-none`
            : `${t.semTexto} flex-none p-0`
      } ${className}`}
      {...resto}
    >
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
    </button>
  );
});
