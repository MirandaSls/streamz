"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as KeyboardEventDoReact,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";

/**
 * O popout ÚNICO do app (plano, onda 0.4): substitui as sete mecânicas de
 * painel flutuante que existiam — `PopoverFlutuante` (que agora é um invólucro
 * deste), `PainelFlutuante`, `HeaderPopover`, `PickerPanel`, o `Submenu` de
 * `menus-de-audio`, o `ProfilePopoverHost` e a parte de posição/foco do
 * `ContextMenu`.
 *
 * ## Superfície (medida)
 *
 * - Fundo `--background-surface-high`, sombra `var(--shadow-border),
 *   var(--shadow-high)` (`shadow-popout`), sem borda real: o 1px claro em volta
 *   é o `--shadow-border`.
 * - **Raio 8** (`rounded-lg` = `--radius-sm`), e não o 12 do CSS genérico. O CSS
 *   dá `--radius-md` a `.popout_ab4223` e `.popoutContainer__93fc9`
 *   (`css-bruto/`), mas os três popouts que existem em print 1:1 medem 8, e o
 *   print manda (ADR-0009 §7):
 *   - caixa de entrada, `Captura de tela 2026-09-01 113500.png` (janela de
 *     1283, mas a coluna de canais mede os mesmos 295 do print de 1917, então
 *     é zoom 100%): borda direita reta em x=1118 até y=496, borda de baixo reta
 *     em y=503 a partir de x=1110 — curva de 8 nos dois eixos;
 *   - perfil da lista de membros, `2026-08-31 101804.png`: borda esquerda reta
 *     em x=1343 até y=538, borda de baixo em y=545 a partir de x=1351 — 8;
 *   - perfil do rodapé, `2026-09-03 180020.png`: x=9 até y=1187, base em
 *     y=1196 — 8.
 *   O próprio CSS concorda no perfil: `.outer_c0bea0.user-profile-popout` usa
 *   `--radius-sm`. O menu de status do mesmo print (`.menu_c1e9c4`, raio 8)
 *   também mede 8.
 * - Sem seta (caret). No print da caixa de entrada a coluna x=1105, logo abaixo
 *   do ícone que a abre, vai da barra de título (y 25–32) direto para a borda
 *   da caixa (y=36): não há triângulo. O caret do `HeaderPopover` sai quando ele
 *   migrar.
 * - Padding é do conteúdo (`semRespiro`, padrão verdadeiro); quem quer respiro
 *   passa `semRespiro={false}` e ganha 16 (`.layer__95d7b`, `.popout_ab4223`:
 *   `padding: var(--space-16)`).
 *
 * ## Posição
 *
 * Presa à janela (`fixed`, portal em `document.body`), para nunca ser cortada
 * pelo `overflow` de um ancestral. A conta é `calcularPosicaoFlutuante`: lado
 * preferido, espelhado se não couber, depois os dois lados perpendiculares; no
 * eixo cruzado o alinhamento também espelha (start ↔ end) antes de deslizar
 * para caber a 8 da borda. Reposiciona em resize, em scroll de qualquer
 * ancestral e quando a caixa ou a âncora mudam de tamanho (`ResizeObserver`).
 *
 * ## Entrada
 *
 * É a do `Popout` do Discord (`css-bruto/584159.8b55c6d9ab0a575c.css`,
 * `.translate_faf9c0` e `.scale_faf9c0`): parte 10px deslocada na direção do
 * lado final (`.animatorTop` `translate3d(0,-10px,0)`, `.animatorBottom`
 * `(0,10px)`, `.animatorLeft` `(-10px,0)`, `.animatorRight` `(10px,0)`) e
 * volta em **200 ms** `ease-out` (`.didRender_faf9c0`); escala .95→1 e opacidade
 * 0→1 em **120 ms** `ease-out`, os números do `.scale_faf9c0.didRender` e do
 * nosso `anim-menu`. O `.95` é o do `anim-menu`: o `.01` do Discord é a variante
 * de escala pura, sem o deslocamento. `transform-origin` no ponto da caixa mais
 * perto do alvo — é o que o `.scale_faf9c0.animatorX` faz com "top center",
 * "bottom center", só que acompanhando o alinhamento real.
 * Com `reduzir-movimento` a regra global zera a transição; com
 * `prefers-reduced-motion` a caixa nasce parada (o Discord só anima sob
 * `.full-motion`).
 *
 * ## Fechar e foco
 *
 * Esc (só o popout do topo da pilha, para um submenu aberto não levar o pai
 * junto), clique fora — `mousedown` em captura, ignorando a âncora, os
 * `[data-submenu-de-popout]`, o atributo antigo `[data-submenu-de-popover]` e
 * qualquer popout aberto depois deste —, e `aoFechar`. Foco vai para
 * `[data-autofocus]` ou o primeiro focável, Tab fica preso dentro e o foco volta
 * a quem o tinha quando o popout fecha.
 *
 * ## Celular
 *
 * Com `useEhMobile` vira folha inferior com véu, alça que é botão de verdade e
 * `useVoltarNoCelular` — a mesma folha que o `PopoverFlutuante` desenhava.
 *
 * `usePosicaoFlutuante` e `calcularPosicaoFlutuante` são exportados para o
 * `ContextMenu` usar a mesma conta de colisão, em vez da sua (`colocar`).
 */
export type LadoDoPopout = "top" | "bottom" | "left" | "right";
export type AlinhamentoDoPopout = "start" | "center" | "end";
export type Retangulo = { x: number; y: number; width: number; height: number };
/** Elemento âncora (ref) ou retângulo fixo (clique do botão direito, seleção). */
export type AncoraDoPopout = RefObject<HTMLElement | null> | Retangulo | DOMRect;

export interface PopoutProps {
  aberto: boolean;
  aoFechar: () => void;
  /** Elemento âncora (ref) ou retângulo fixo (clique do botão direito, seleção). */
  ancora: AncoraDoPopout;
  /** Lado preferido. Padrão `bottom`. Espelha se não couber. */
  lado?: LadoDoPopout;
  /**
   * Alinhamento no eixo cruzado: `start` encosta a borda inicial da caixa na
   * do alvo (esquerda em `top`/`bottom`, topo em `left`/`right`). Padrão
   * `start`, o da implementação anterior e do `PopoverFlutuante` — o padrão do
   * Discord não foi medido. Espelha para `end` se não couber.
   */
  alinhamento?: AlinhamentoDoPopout;
  /**
   * Distância do alvo em px. Padrão 8 (da especificação do plano; não medido em
   * print). Negativa sobrepõe: o submenu monta 4px por cima do item.
   */
  distancia?: number;
  /**
   * Deslocamento no eixo cruzado, em px, no sentido do alinhamento. O submenu
   * usa `-6` para o primeiro item dele ficar na linha do item que o abriu
   * (descontando o respiro da caixa); espelhado para `end`, o último item é
   * que fica na linha.
   */
  deslocamento?: number;
  /** Largura fixa; sem ela, a do conteúdo. Ignorada na folha do celular. */
  largura?: number;
  /** Nome acessível do diálogo. */
  rotulo: string;
  /**
   * Papel ARIA da caixa. Padrão `dialog`; um submenu de itens usa `menu`, uma
   * lista de escolha usa `listbox`.
   */
  papel?: "dialog" | "menu" | "listbox";
  /** Padrão `true`. Tab fica preso dentro da caixa. */
  prenderFoco?: boolean;
  /**
   * Padrão `true`: ao abrir, o foco vai para `[data-autofocus]` ou para o
   * primeiro focável. Um submenu aberto pelo hover passa `false` (o foco fica
   * no item do pai); aberto pela seta →, `true`.
   */
  focarAoAbrir?: boolean;
  /** Padrão `true`: ao fechar, o foco volta a quem o tinha quando abriu. */
  devolverFoco?: boolean;
  /**
   * Padrão `true`, menos em submenu: o submenu é desmontado junto com o pai, e
   * fechar no clique fora faria um clique no pai piscar o submenu.
   */
  fecharAoClicarFora?: boolean;
  /**
   * Fecha em vez de reposicionar quando algo fora da caixa rola ou a janela
   * muda de tamanho (o `PainelFlutuante` dos pickers da mensagem: a âncora é um
   * retângulo lido no clique, e rolar deixaria a caixa parada longe do botão).
   * Padrão `false`. Não vale na folha do celular.
   */
  fecharAoRolar?: boolean;
  /**
   * Um clique fora da caixa que ainda conta como de dentro. A âncora por ref já
   * é ignorada sozinha; isto serve a quem ancora por retângulo e tem um botão
   * que alterna o popout — sem isto o `mousedown` fechava e o `click` reabria.
   */
  ehDeDentro?: (alvo: Element) => boolean;
  /** Padrão `true`. No celular vira folha inferior. */
  folhaNoCelular?: boolean;
  /** Padrão `true` (o conteúdo decide o padding). `false` dá 16. */
  semRespiro?: boolean;
  /** Marca o popout como submenu de outro (o pai não fecha ao clicar aqui). */
  ehSubmenu?: boolean;
  /** Tecla dentro da caixa, antes da armadilha de Tab (setas de um menu). */
  aoTeclar?: (e: KeyboardEventDoReact<HTMLDivElement>) => void;
  /** O ponteiro entrou na caixa (o submenu cancela o fechamento agendado). */
  aoEntrarComPonteiro?: () => void;
  /** O ponteiro saiu da caixa. */
  aoSairComPonteiro?: () => void;
  /**
   * Classes da caixa no desktop e do miolo da folha no celular (padding,
   * altura, `overflow-hidden` para o filho respeitar o raio).
   */
  className?: string;
  /**
   * Classes do miolo da folha no celular, quando precisam ser outras que as da
   * caixa do desktop (o `PopoverFlutuante` denso tem respiro de 6 na caixa e de
   * 12 na folha). Sem ela, vale `className`.
   */
  classeNaFolha?: string;
  children: ReactNode;
}

/** Distância mínima da caixa até a borda da janela (especificação do plano; não medido). */
const MARGEM_DA_JANELA = 8;
/** Deslocamento de entrada: `.translate_faf9c0.animatorX_faf9c0`, 10px. */
const DESLOCAMENTO_DE_ENTRADA = 10;
/** `.full-motion .translate_faf9c0.didRender_faf9c0{transition:transform .2s ease-out}`. */
const DURACAO_DO_DESLIZE = 200;
/** `.scale_faf9c0.didRender_faf9c0{transition:transform .12s ease-out,opacity .12s ease-out}`. */
const DURACAO_DA_ESCALA = 120;
/** Camada do popout; cada popout aberto por cima de outro sobe um degrau. */
const Z_BASE = 90;

const OPOSTO: Record<LadoDoPopout, LadoDoPopout> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

const PERPENDICULARES: Record<LadoDoPopout, [LadoDoPopout, LadoDoPopout]> = {
  top: ["right", "left"],
  bottom: ["right", "left"],
  left: ["bottom", "top"],
  right: ["bottom", "top"],
};

const ENTRADA: Record<LadoDoPopout, string> = {
  top: `0px ${-DESLOCAMENTO_DE_ENTRADA}px`,
  bottom: `0px ${DESLOCAMENTO_DE_ENTRADA}px`,
  left: `${-DESLOCAMENTO_DE_ENTRADA}px 0px`,
  right: `${DESLOCAMENTO_DE_ENTRADA}px 0px`,
};

const FOCALIZAVEL = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=true]",
  "[tabindex]",
]
  .map((s) => `${s}:not([tabindex="-1"])`)
  .join(",");

/* ------------------------------------------------------------------ */
/* Conta de posição                                                    */
/* ------------------------------------------------------------------ */

export interface PosicaoCalculada {
  x: number;
  y: number;
  /** O lado em que a caixa ficou (pode ser o espelho do pedido). */
  ladoFinal: LadoDoPopout;
  /** O alinhamento que valeu (pode ser o espelho do pedido). */
  alinhamentoFinal: AlinhamentoDoPopout;
  /** `transform-origin`: o ponto da caixa mais perto do centro do alvo. */
  origem: string;
}

export interface PosicaoFlutuante extends PosicaoCalculada {
  /** `false` até a primeira medida: quem desenha deixa a caixa invisível. */
  pronto: boolean;
}

export interface OpcoesDePosicao {
  /** Padrão `start`. */
  alinhamento?: AlinhamentoDoPopout;
  /** Deslocamento no eixo cruzado, no sentido do alinhamento. Padrão 0. */
  deslocamento?: number;
  /** Distância mínima até a borda da janela. Padrão 8. */
  margem?: number;
}

function limitar(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function ehVertical(lado: LadoDoPopout): boolean {
  return lado === "top" || lado === "bottom";
}

/**
 * A conta de colisão inteira, sem tocar em `window` nem no DOM — é a parte que
 * dá para testar, e a que o `ContextMenu` pode chamar direto com o ponto do
 * cursor (`{ x, y, width: 0, height: 0 }`, lado `right`, `distancia` 0).
 *
 * 1. **Eixo principal:** o lado pedido, se couber; senão o oposto; senão os
 *    dois perpendiculares. Se nenhum couber, fica no lado do eixo pedido com
 *    mais espaço e a coordenada é presa à janela — cobrir o alvo é melhor que
 *    sumir.
 * 2. **Eixo cruzado:** o alinhamento pedido; se vazar, o espelho (start ↔
 *    end); se os dois vazarem, desliza para caber a `margem` da borda. Espelhar
 *    antes de deslizar é a regra do `colocar` do `ContextMenu`: perto da borda
 *    de baixo, empurrar faria o menu cobrir o próprio cursor.
 */
export function calcularPosicaoFlutuante(
  alvo: Retangulo,
  caixa: { width: number; height: number },
  janela: { width: number; height: number },
  lado: LadoDoPopout = "bottom",
  distancia = 8,
  opcoes: OpcoesDePosicao = {},
): PosicaoCalculada {
  const { alinhamento = "start", deslocamento = 0, margem = MARGEM_DA_JANELA } = opcoes;
  const w = caixa.width;
  const h = caixa.height;

  /** Coordenada no eixo principal e se ela cabe na janela. */
  const principal = (l: LadoDoPopout): { v: number; cabe: boolean; espaco: number } => {
    switch (l) {
      case "top": {
        const v = alvo.y - h - distancia;
        return { v, cabe: v >= margem, espaco: alvo.y - distancia - margem };
      }
      case "bottom": {
        const v = alvo.y + alvo.height + distancia;
        return { v, cabe: v + h <= janela.height - margem, espaco: janela.height - margem - v };
      }
      case "left": {
        const v = alvo.x - w - distancia;
        return { v, cabe: v >= margem, espaco: alvo.x - distancia - margem };
      }
      case "right": {
        const v = alvo.x + alvo.width + distancia;
        return { v, cabe: v + w <= janela.width - margem, espaco: janela.width - margem - v };
      }
    }
  };

  const ordem: LadoDoPopout[] = [lado, OPOSTO[lado], ...PERPENDICULARES[lado]];
  let ladoFinal = ordem.find((l) => principal(l).cabe);
  let v: number;
  if (ladoFinal) {
    v = principal(ladoFinal).v;
  } else {
    const pedido = principal(lado);
    const oposto = principal(OPOSTO[lado]);
    ladoFinal = oposto.espaco > pedido.espaco ? OPOSTO[lado] : lado;
    const tam = ehVertical(ladoFinal) ? h : w;
    const limite = ehVertical(ladoFinal) ? janela.height : janela.width;
    v = limitar(principal(ladoFinal).v, margem, Math.max(margem, limite - tam - margem));
  }

  // eixo cruzado: x para os lados de cima/baixo, y para os de esquerda/direita
  const vertical = ehVertical(ladoFinal);
  const inicio = vertical ? alvo.x : alvo.y;
  const tamAlvo = vertical ? alvo.width : alvo.height;
  const tam = vertical ? w : h;
  const limite = vertical ? janela.width : janela.height;
  const cruzado = (a: AlinhamentoDoPopout): number => {
    if (a === "start") return inicio + deslocamento;
    if (a === "end") return inicio + tamAlvo - tam - deslocamento;
    return inicio + tamAlvo / 2 - tam / 2 + deslocamento;
  };
  const cabe = (c: number) => c >= margem && c + tam <= limite - margem;

  let alinhamentoFinal = alinhamento;
  let c = cruzado(alinhamento);
  if (!cabe(c) && alinhamento !== "center") {
    const espelho: AlinhamentoDoPopout = alinhamento === "start" ? "end" : "start";
    if (cabe(cruzado(espelho))) {
      alinhamentoFinal = espelho;
      c = cruzado(espelho);
    }
  }
  c = limitar(c, margem, Math.max(margem, limite - tam - margem));

  const x = Math.round(vertical ? c : v);
  const y = Math.round(vertical ? v : c);

  // o ponto da caixa que "encosta" no alvo, para a escala crescer dali
  const centroX = limitar(alvo.x + alvo.width / 2 - x, 0, w);
  const centroY = limitar(alvo.y + alvo.height / 2 - y, 0, h);
  const origem =
    ladoFinal === "top"
      ? `${centroX}px 100%`
      : ladoFinal === "bottom"
        ? `${centroX}px 0px`
        : ladoFinal === "left"
          ? `100% ${centroY}px`
          : `0px ${centroY}px`;

  return { x, y, ladoFinal, alinhamentoFinal, origem };
}

function ehRef(ancora: AncoraDoPopout): ancora is RefObject<HTMLElement | null> {
  return "current" in ancora;
}

function retanguloDa(ancora: AncoraDoPopout): Retangulo | null {
  if (ehRef(ancora)) {
    const r = ancora.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  }
  // DOMRect também tem x/y/width/height, então os dois casos são um só
  return { x: ancora.x, y: ancora.y, width: ancora.width, height: ancora.height };
}

const NAO_POSICIONADO: PosicaoFlutuante = {
  x: 0,
  y: 0,
  ladoFinal: "bottom",
  alinhamentoFinal: "start",
  origem: "50% 0px",
  pronto: false,
};

/**
 * Posição da `caixa` presa à janela, com a conta de `calcularPosicaoFlutuante`,
 * refeita em resize, em scroll de qualquer ancestral (captura no `window`) e
 * quando a caixa ou a âncora mudam de tamanho.
 *
 * Mede com `offsetWidth`/`offsetHeight`, não `getBoundingClientRect`: a caixa
 * nasce com escala .95, e o retângulo viria encolhido no quadro da medida —
 * foi assim que um painel de 522px era medido como 496 e subia 26px a menos
 * (achado do `PopoverFlutuante`). As duas propriedades ignoram `transform`.
 *
 * A medida é num `useLayoutEffect`: com um efeito comum a caixa aparecia um
 * quadro no canto e "pulava" para o lugar. Enquanto `pronto` for `false`, quem
 * desenha esconde a caixa (`visibility: hidden`, que ainda deixa medir).
 */
export function usePosicaoFlutuante(
  aberto: boolean,
  ancora: AncoraDoPopout,
  caixa: RefObject<HTMLElement | null>,
  lado: LadoDoPopout = "bottom",
  distancia = 8,
  opcoes: OpcoesDePosicao = {},
): PosicaoFlutuante & { reposicionar: () => void } {
  const { alinhamento = "start", deslocamento = 0, margem = MARGEM_DA_JANELA } = opcoes;
  const [pos, setPos] = useState<PosicaoFlutuante>(NAO_POSICIONADO);

  // a âncora é lida no momento da conta; retângulo novo a cada render do pai
  // não pode virar laço de efeito, então a dependência é o valor, não o objeto
  const ancoraAtual = useRef(ancora);
  ancoraAtual.current = ancora;
  const chaveDaAncora: unknown = ehRef(ancora)
    ? ancora
    : `${ancora.x}|${ancora.y}|${ancora.width}|${ancora.height}`;

  const calcular = useCallback(() => {
    const el = caixa.current;
    const alvo = retanguloDa(ancoraAtual.current);
    // âncora que saiu do DOM: a caixa fica onde estava, em vez de ir ao canto
    if (!el || !alvo) return;
    const nova = calcularPosicaoFlutuante(
      alvo,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      lado,
      distancia,
      { alinhamento, deslocamento, margem },
    );
    setPos((atual) =>
      atual.pronto &&
      atual.x === nova.x &&
      atual.y === nova.y &&
      atual.ladoFinal === nova.ladoFinal &&
      atual.origem === nova.origem
        ? atual
        : { ...nova, pronto: true },
    );
  }, [caixa, lado, distancia, alinhamento, deslocamento, margem]);

  useLayoutEffect(() => {
    if (!aberto) {
      setPos((atual) => (atual.pronto ? NAO_POSICIONADO : atual));
      return;
    }
    calcular();

    // um quadro por vez: scroll e resize disparam dezenas de vezes por quadro
    let quadro = 0;
    const agendar = () => {
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        calcular();
      });
    };
    // a lista de dentro da caixa rolando não move nada; o resto, sim
    const aoRolar = (e: Event) => {
      if (e.target instanceof Node && caixa.current?.contains(e.target)) return;
      agendar();
    };
    window.addEventListener("resize", agendar);
    window.addEventListener("scroll", aoRolar, true);

    let observador: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observador = new ResizeObserver(agendar);
      if (caixa.current) observador.observe(caixa.current);
      const ancoraEl = ehRef(ancoraAtual.current) ? ancoraAtual.current.current : null;
      if (ancoraEl) observador.observe(ancoraEl);
    }

    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", agendar);
      window.removeEventListener("scroll", aoRolar, true);
      observador?.disconnect();
    };
  }, [aberto, chaveDaAncora, calcular, caixa]);

  return { ...pos, reposicionar: calcular };
}

/* ------------------------------------------------------------------ */
/* Pilha de popouts abertos                                            */
/* ------------------------------------------------------------------ */

/**
 * Quem está aberto agora, do mais baixo para o mais alto. É do documento, não
 * de um componente: é por ela que o Esc fecha só o de cima e que um clique
 * dentro de um popout filho (um `Select` aberto dentro de um popout, um
 * submenu) não conta como "fora" para o pai — os dois moram em portais
 * irmãos, e o DOM não sabe que um é filho do outro.
 */
interface Camada {
  /** Tudo que é do popout na tela: a caixa no desktop, o véu na folha. */
  raiz: () => HTMLElement | null;
}

let pilha: Camada[] = [];

function ehTopo(camada: Camada): boolean {
  return pilha[pilha.length - 1] === camada;
}

function dentroDeCamadaAcima(camada: Camada, alvo: Node): boolean {
  const i = pilha.indexOf(camada);
  return pilha.slice(i + 1).some((c) => c.raiz()?.contains(alvo) ?? false);
}

/* ------------------------------------------------------------------ */
/* Foco                                                                */
/* ------------------------------------------------------------------ */

function focaveis(dentro: HTMLElement | null): HTMLElement[] {
  if (!dentro) return [];
  return Array.from(dentro.querySelectorAll<HTMLElement>(FOCALIZAVEL)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

function semMovimento(): boolean {
  if (typeof window === "undefined") return true;
  if (document.documentElement.classList.contains("reduzir-movimento")) return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------------------ */
/* Popout                                                              */
/* ------------------------------------------------------------------ */

type FaseDeEntrada = "inicio" | "entrando" | "parado";

export function Popout({
  aberto,
  aoFechar,
  ancora,
  lado = "bottom",
  alinhamento = "start",
  distancia = 8,
  deslocamento = 0,
  largura,
  rotulo,
  papel = "dialog",
  prenderFoco = true,
  focarAoAbrir = true,
  devolverFoco = true,
  ehSubmenu = false,
  fecharAoClicarFora = !ehSubmenu,
  fecharAoRolar = false,
  ehDeDentro,
  folhaNoCelular = true,
  semRespiro = true,
  aoTeclar,
  aoEntrarComPonteiro,
  aoSairComPonteiro,
  className = "",
  classeNaFolha,
  children,
}: PopoutProps) {
  const ehMobile = useEhMobile();
  const comoFolha = folhaNoCelular && ehMobile;

  const caixa = useRef<HTMLDivElement>(null);
  const veu = useRef<HTMLDivElement>(null);

  // na folha não há conta de posição: ela é presa ao fundo pelo CSS
  const pos = usePosicaoFlutuante(aberto && !comoFolha, ancora, caixa, lado, distancia, {
    alinhamento,
    deslocamento,
  });
  const pronto = comoFolha || pos.pronto;

  // as funções do chamador mudam a cada render; os ouvintes leem a última
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const ancoraAtual = useRef(ancora);
  ancoraAtual.current = ancora;
  const dentro = useRef(ehDeDentro);
  dentro.current = ehDeDentro;

  /*
    O "voltar" do Android desfaz a folha, como desfaz qualquer camada do
    celular. Sem ele o voltar atravessava a folha aberta e desfazia a tela de
    baixo.
  */
  useVoltarNoCelular(comoFolha && aberto, aoFechar);

  // ── pilha ────────────────────────────────────────────────────────────
  const naFolha = useRef(comoFolha);
  naFolha.current = comoFolha;
  const [camada] = useState<Camada>(() => ({
    raiz: () => (naFolha.current ? veu.current : caixa.current),
  }));
  const [nivel, setNivel] = useState(0);

  useLayoutEffect(() => {
    if (!aberto) return;
    setNivel(pilha.length);
    pilha = [...pilha, camada];
    return () => {
      pilha = pilha.filter((c) => c !== camada);
    };
  }, [aberto, camada]);

  // ── Esc, clique fora, rolagem ────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;

    const aoTeclarNaJanela = (e: KeyboardEvent) => {
      // Esc no meio de uma composição (IME) cancela a composição, não a caixa
      if (e.key !== "Escape" || e.isComposing || !ehTopo(camada)) return;
      // o Esc global do app também fecha coisas; parar aqui evita fechar duas
      // de uma vez (o painel de thread atrás do popout, por exemplo)
      e.stopPropagation();
      fechar.current();
    };

    // captura: um clique num item que remonta a árvore ainda é lido como de
    // dentro — no borbulhar o nó já pode ter saído do DOM e o `contains` erra
    const aoApertar = (e: MouseEvent) => {
      if (!fecharAoClicarFora) return;
      const alvo = e.target;
      if (!(alvo instanceof Node)) return;
      if (caixa.current?.contains(alvo)) return;
      const a = ancoraAtual.current;
      // o botão que abriu alterna o popout no próprio `click`; se o
      // `mousedown` fechasse antes, o `click` reabriria
      if (ehRef(a) && a.current?.contains(alvo)) return;
      if (dentroDeCamadaAcima(camada, alvo)) return;
      // o véu da folha fecha pelo próprio `onMouseDown` (ver abaixo)
      if (alvo === veu.current) return;
      if (alvo instanceof Element) {
        // submenu em portal não é descendente da caixa. `data-submenu-de-popover`
        // é o nome antigo, ainda usado pelo `Submenu` de `menus-de-audio`
        if (alvo.closest("[data-submenu-de-popout],[data-submenu-de-popover]")) return;
        if (dentro.current?.(alvo)) return;
      }
      fechar.current();
    };

    const aoRolar = (e: Event) => {
      const alvo = e.target;
      // a lista de dentro da caixa rolando não é a âncora saindo do lugar
      if (alvo instanceof Node && (caixa.current?.contains(alvo) || dentroDeCamadaAcima(camada, alvo))) return;
      fechar.current();
    };
    const aoRedimensionar = () => fechar.current();

    window.addEventListener("keydown", aoTeclarNaJanela, true);
    window.addEventListener("mousedown", aoApertar, true);
    // na folha o que rola é a própria folha: fechar não faz sentido lá
    const rolagem = fecharAoRolar && !comoFolha;
    if (rolagem) {
      window.addEventListener("scroll", aoRolar, true);
      window.addEventListener("resize", aoRedimensionar);
    }
    return () => {
      window.removeEventListener("keydown", aoTeclarNaJanela, true);
      window.removeEventListener("mousedown", aoApertar, true);
      if (rolagem) {
        window.removeEventListener("scroll", aoRolar, true);
        window.removeEventListener("resize", aoRedimensionar);
      }
    };
  }, [aberto, camada, fecharAoClicarFora, fecharAoRolar, comoFolha]);

  // ── foco ─────────────────────────────────────────────────────────────
  // quem tinha o foco ao abrir recebe de volta ao fechar — mas só se o foco
  // ainda estiver na caixa (ou tiver caído no `body` com ela desmontada): se o
  // clique fora foi num campo, o foco é dele
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const caixaEl = caixa.current;
    return () => {
      if (!devolverFoco || !anterior || !anterior.isConnected) return;
      const agora = document.activeElement;
      const perdido = !agora || agora === document.body || (caixaEl?.contains(agora) ?? false);
      if (perdido) anterior.focus({ preventScroll: true });
    };
  }, [aberto, devolverFoco]);

  // só depois de posicionada: enquanto `visibility: hidden`, `focus()` não pega
  const focou = useRef(false);
  useEffect(() => {
    if (!aberto) {
      focou.current = false;
      return;
    }
    if (!pronto || focou.current || !focarAoAbrir) return;
    focou.current = true;
    const el = caixa.current;
    if (!el) return;
    /*
      Na folha o foco vai para a alça ("Fechar"), não para um campo: um
      `[data-autofocus]` de busca levantaria o teclado virtual por cima da
      folha que acabou de subir. No desktop vale a regra do diálogo.
    */
    const alvo = comoFolha
      ? focaveis(el)[0]
      : (el.querySelector<HTMLElement>("[data-autofocus]") ?? focaveis(el)[0]);
    (alvo ?? el).focus({ preventScroll: true });
  }, [aberto, pronto, focarAoAbrir, comoFolha]);

  function aoTeclarNaCaixa(e: KeyboardEventDoReact<HTMLDivElement>) {
    aoTeclar?.(e);
    if (e.defaultPrevented || !prenderFoco || e.key !== "Tab") return;
    // tecla de um popout filho em portal borbulha pela árvore do React até
    // aqui; a armadilha é só de quem está no DOM desta caixa
    if (!(e.target instanceof Node) || !caixa.current?.contains(e.target)) return;
    const nos = focaveis(caixa.current);
    if (nos.length === 0) {
      e.preventDefault();
      return;
    }
    const primeiro = nos[0];
    const ultimo = nos[nos.length - 1];
    const ativo = document.activeElement;
    if (e.shiftKey && (ativo === primeiro || ativo === caixa.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && ativo === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  // ── entrada ──────────────────────────────────────────────────────────
  const [fase, setFase] = useState<FaseDeEntrada>("inicio");
  useEffect(() => {
    if (!aberto) {
      setFase("inicio");
      return;
    }
    if (comoFolha || !pos.pronto) return;
    if (fase === "inicio") {
      if (semMovimento()) {
        setFase("parado");
        return;
      }
      // dois quadros: o estado inicial precisa ter sido calculado pelo
      // navegador, senão não há de onde transicionar e a caixa surge de estalo
      let quadro = requestAnimationFrame(() => {
        quadro = requestAnimationFrame(() => setFase("entrando"));
      });
      return () => cancelAnimationFrame(quadro);
    }
    if (fase === "entrando") {
      // rede de segurança: o `transitionend` não chega se a transição for
      // interrompida (a caixa reposicionada no meio, a aba escondida). Os 50ms
      // são folga de implementação, não medida de tela
      const t = window.setTimeout(() => setFase("parado"), DURACAO_DO_DESLIZE + 50);
      return () => window.clearTimeout(t);
    }
  }, [aberto, comoFolha, pos.pronto, fase]);

  if (!aberto || typeof document === "undefined") return null;

  const zIndex = Z_BASE + nivel;
  const comum = {
    role: papel,
    "aria-label": rotulo,
    "aria-modal": papel === "dialog" && prenderFoco ? true : undefined,
    tabIndex: -1,
    "data-popout": "",
    "data-submenu-de-popout": ehSubmenu ? "" : undefined,
    onKeyDown: aoTeclarNaCaixa,
    onPointerEnter: aoEntrarComPonteiro,
    onPointerLeave: aoSairComPonteiro,
  } as const;

  if (comoFolha) {
    return createPortal(
      <div
        ref={veu}
        style={{ zIndex }}
        // handler no próprio véu, e não só o `mousedown` da janela: o Safari do
        // iPhone não dispara evento de mouse ao tocar num `div` sem ouvinte
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) aoFechar();
        }}
        className="anim-overlay fixed inset-0 flex flex-col justify-end bg-background-scrim"
      >
        <div
          ref={caixa}
          {...comum}
          className="anim-folha max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-background-surface-higher pb-[env(safe-area-inset-bottom)] shadow-popout outline-none"
        >
          {/*
            A alça é **botão de verdade**, com rótulo "Fechar": quem não
            conhece o gesto de tocar no véu (e quem usa leitor de tela) ficaria
            com o "voltar" do Android como única saída, e no navegador do
            iPhone esse botão não existe. `sticky` porque a folha rola por
            dentro e a saída não pode subir junto com o conteúdo.

            A folha é a do `PopoverFlutuante` de antes (véu, raio 16 em cima,
            85% da altura, alça de 28 com barra de 36×4); o Discord mobile não
            foi medido.
          */}
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="sticky top-0 z-10 flex h-[28px] w-full shrink-0 items-center justify-center bg-background-surface-higher"
          >
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border-normal" />
          </button>
          <div className={`${semRespiro ? "" : "px-4 pb-4"} ${classeNaFolha ?? className}`}>{children}</div>
        </div>
      </div>,
      document.body,
    );
  }

  const estiloDeEntrada: CSSProperties =
    fase === "inicio"
      ? { translate: ENTRADA[pos.ladoFinal], scale: "0.95", opacity: 0 }
      : fase === "entrando"
        ? {
            translate: "0px 0px",
            scale: "1",
            opacity: 1,
            transition: `translate ${DURACAO_DO_DESLIZE}ms ease-out, scale ${DURACAO_DA_ESCALA}ms ease-out, opacity ${DURACAO_DA_ESCALA}ms ease-out`,
          }
        : // parado: sem `translate`/`scale` no estilo. Qualquer transformação
          // deixada aqui faria da caixa o bloco de contenção dos `fixed` de
          // dentro, e um tooltip sem portal abriria deslocado
          {};

  return createPortal(
    <div
      ref={caixa}
      {...comum}
      data-lado={pos.ladoFinal}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === "translate") setFase("parado");
      }}
      style={{
        left: pos.x,
        top: pos.y,
        width: largura,
        zIndex,
        transformOrigin: pos.origem,
        visibility: pos.pronto ? "visible" : "hidden",
        ...estiloDeEntrada,
      }}
      className={`fixed rounded-lg bg-background-surface-high shadow-popout outline-none ${
        semRespiro ? "" : "p-4"
      } ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
