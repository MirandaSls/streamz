"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Arrasto horizontal de uma camada do celular: a conversa que desliza para
 * revelar a coluna de canais, o painel de membros que entra pela direita.
 *
 * O Discord do celular navega por **arrasto**, não só por toque. O que este
 * arquivo resolve é a parte difícil e comum a todos esses gestos — decidir se o
 * dedo quis arrastar para o lado ou rolar, medir a velocidade da soltura e não
 * brigar com os outros três gestos que moram no mesmo lugar:
 *
 * - **a rolagem vertical** da lista: o eixo é decidido nos primeiros
 *   `LIMIAR_DE_EIXO` px, e empate vai para a rolagem. Quem chama põe
 *   `touch-action: pan-y` na área, para o navegador continuar dono do eixo Y e
 *   entregar os `pointermove` do eixo X em vez de um `pointercancel`;
 * - **o toque longo** (`AreaDeToqueLongo`): ele desiste com mais de 10px de
 *   movimento, e aqui o eixo trava com mais de 10px — os dois gestos trocam de
 *   mão no mesmo pixel. E um dedo parado por mais de `TEMPO_DO_TOQUE_LONGO` ms
 *   sem travar é do toque longo: o arrasto não começa mais;
 * - **o voltar da borda do sistema**: o Android com navegação por gestos e o
 *   iOS tomam o toque da borda antes da página, e o que chega aqui é um
 *   `pointercancel`. Nada é cancelado de propósito (`preventDefault` não impede
 *   gesto de sistema), e o cancelamento devolve a camada para onde estava.
 *
 * Também não rouba o arrasto de quem rola na horizontal por conta própria (a
 * fileira de abas de Amigos, um bloco de código): se um ancestral do alvo ainda
 * pode rolar no sentido do dedo, o gesto é dele.
 *
 * ## Os números
 *
 * **Nenhum número de gesto daqui saiu do Discord**: limiar de distância,
 * velocidade de arremesso e duração não se medem numa captura parada, e o
 * acervo não tem vídeo com escala conhecida. São constantes nossas, escolhidas
 * por uma regra que dá para dizer em voz alta — metade do caminho decide, e um
 * arremesso decide antes — e estão todas aqui, num lugar só, para quem tiver
 * uma gravação trocar. A duração e a curva são as da `anim-empilhar`
 * (`app/globals.css`), para a tela que entra por toque e a que entra por
 * arrasto terminarem do mesmo jeito.
 */

/** Movimento, em px, a partir do qual o eixo do gesto é decidido. */
export const LIMIAR_DE_EIXO = 10;
/** Fração do caminho a partir da qual soltar completa o gesto. Não medido. */
export const FRACAO_PARA_COMPLETAR = 0.5;
/** Velocidade (px/ms) a partir da qual o sentido do arremesso decide sozinho. Não medido. */
export const VELOCIDADE_DE_ARREMESSO = 0.4;
/** Janela (ms) das últimas amostras usadas para medir a velocidade da soltura. */
export const JANELA_DE_VELOCIDADE = 100;
/** O mesmo temporizador do `AreaDeToqueLongo` (`telas-de-conversa.tsx`). */
export const TEMPO_DO_TOQUE_LONGO = 450;
/** Duração e curva da `anim-empilhar` de `app/globals.css`. */
export const DURACAO_DO_ASSENTAMENTO = 220;
export const CURVA_DO_ASSENTAMENTO = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export type Eixo = "x" | "y";

/**
 * Qual eixo o dedo escolheu, ou `null` enquanto ele não saiu do limiar.
 *
 * O empate vai para o `y`: na dúvida a lista rola, que é o gesto mais comum e o
 * mais irritante de perder.
 */
export function decidirEixo(dx: number, dy: number, limiar = LIMIAR_DE_EIXO): Eixo | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= limiar && ay <= limiar) return null;
  return ax > ay ? "x" : "y";
}

export interface Amostra {
  /** instante, em ms (o `timeStamp` do evento). */
  t: number;
  /** posição no eixo do gesto, em px. */
  v: number;
}

/**
 * Velocidade no fim do gesto, em px/ms, com sinal.
 *
 * Usa só as amostras dos últimos `janela` ms: o que conta é como o dedo estava
 * se mexendo **ao soltar**, não a média do gesto inteiro. Um dedo que parou
 * antes de soltar dá 0 — ele não arremessou nada, só largou.
 */
export function velocidadeDoGesto(amostras: readonly Amostra[], janela = JANELA_DE_VELOCIDADE): number {
  if (amostras.length < 2) return 0;
  const ultima = amostras[amostras.length - 1];
  let primeira = ultima;
  for (const a of amostras) {
    if (ultima.t - a.t <= janela) {
      primeira = a;
      break;
    }
  }
  const dt = ultima.t - primeira.t;
  if (dt <= 0) return 0;
  return (ultima.v - primeira.v) / dt;
}

/**
 * Soltar completa o gesto?
 *
 * `progresso` é a fração do caminho já andada rumo ao destino (0 = onde
 * começou, 1 = no destino). `velocidade` é a do `velocidadeDoGesto`, e `sentido`
 * diz qual sinal de velocidade aponta para o destino.
 *
 * Um arremesso decide antes da distância, **nos dois sentidos**: puxar a
 * conversa até 80% e devolvê-la com um peteleco a traz de volta, que é o que a
 * mão quis dizer.
 */
export function decidirSoltura({
  progresso,
  velocidade,
  sentido,
}: {
  progresso: number;
  velocidade: number;
  sentido: 1 | -1;
}): boolean {
  const rumo = velocidade * sentido;
  if (rumo >= VELOCIDADE_DE_ARREMESSO) return true;
  if (rumo <= -VELOCIDADE_DE_ARREMESSO) return false;
  return progresso >= FRACAO_PARA_COMPLETAR;
}

export function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

/** Guarda só as amostras que ainda podem entrar na conta da velocidade. */
export function aparar(amostras: Amostra[], agora: number, janela = JANELA_DE_VELOCIDADE): Amostra[] {
  // uma a mais que a janela: é a âncora de quem chega logo depois dela
  const i = amostras.findIndex((a) => agora - a.t <= janela);
  if (i <= 0) return amostras;
  return amostras.slice(i - 1);
}

/**
 * O usuário pediu menos movimento — no sistema ou nas configurações do app
 * (`reduzir-movimento` no `<html>`, ver `stores/settings.ts`)?
 *
 * Com isso ligado o arrasto não acompanha o dedo: soltar só decide, e a camada
 * troca de estado sem animação.
 */
export function movimentoReduzido(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.classList.contains("reduzir-movimento")) return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Leva `el` até `transform`, com a transição da `anim-empilhar` ou de estalo
 * (movimento reduzido, ou `animar` falso), e chama `depois` quando chegar.
 *
 * Um temporizador, e não `transitionend`: a transição não dispara quando o
 * valor não muda, nem com movimento reduzido — e aí quem esperasse o evento
 * ficaria esperando para sempre.
 */
export function assentar(
  el: HTMLElement | null,
  transform: string,
  animar: boolean,
  depois?: () => void,
): void {
  const duracao = animar && !movimentoReduzido() ? DURACAO_DO_ASSENTAMENTO : 0;
  if (el) {
    el.style.transition = duracao ? `transform ${duracao}ms ${CURVA_DO_ASSENTAMENTO}` : "none";
    el.style.transform = transform;
  }
  if (!depois) return;
  if (duracao) window.setTimeout(depois, duracao);
  else depois();
}

/**
 * Pinta o véu com `fracao` (0 a 1) da opacidade do token `background-scrim`.
 *
 * O véu escurece junto com o dedo, e `opacity` no véu não serve: a camada que
 * se arrasta é filha dele e esmaeceria junto. O que muda é só o alfa da cor, lido
 * das variáveis `--background-scrim-rgb` e `--background-scrim-a` que o
 * `app/tokens.css` já publica. `null` devolve o véu à classe.
 */
export function pintarVeu(veu: HTMLElement | null, fracao: number | null, animar = false): void {
  if (!veu) return;
  veu.style.animation = "none";
  const duracao = animar && !movimentoReduzido() ? DURACAO_DO_ASSENTAMENTO : 0;
  veu.style.transition = duracao ? `background-color ${duracao}ms ${CURVA_DO_ASSENTAMENTO}` : "none";
  if (fracao === null) {
    veu.style.backgroundColor = "";
    return;
  }
  const base = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--background-scrim-a"),
  );
  const alfa = (Number.isFinite(base) ? base : 0) * limitar(fracao, 0, 1);
  veu.style.backgroundColor = `rgb(var(--background-scrim-rgb) / ${alfa.toFixed(4)})`;
}

/** Onde o dedo tem gesto próprio (cursor, seleção, controle deslizante). */
const COM_GESTO_PROPRIO =
  "input, textarea, select, [contenteditable='true'], [contenteditable=''], [data-sem-arrasto]";

/**
 * Algum ancestral do alvo (até `limite`, exclusive) ainda rola na horizontal
 * no sentido do dedo? Dedo para a direita (`sentido` 1) quer ver o que está à
 * esquerda: só rola se `scrollLeft > 0`.
 */
export function rolaNoSentido(alvo: Element | null, limite: Element | null, sentido: 1 | -1): boolean {
  for (let el = alvo; el && el !== limite; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const overflow = getComputedStyle(el).overflowX;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    if (sentido === 1 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) {
      return true;
    }
  }
  return false;
}

/**
 * Engole o `click` que o navegador ainda pode entregar depois de um arrasto:
 * soltar o dedo em cima de uma linha de canal, depois de ter arrastado a
 * conversa, não pode abrir o canal. 400ms é folga para o `click` chegar, não
 * medida de nada.
 */
export function engolirProximoClique() {
  const engolir = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("click", engolir, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", engolir, { capture: true }), 400);
}

export interface OpcoesDoArrastoHorizontal {
  ligado: boolean;
  /**
   * No `pointerdown`: este toque pode virar arrasto? Ainda não se sabe o
   * sentido — é a pergunta "a camada certa está na tela, e o dedo caiu nela?".
   */
  podeComecar: (e: PointerEvent) => boolean;
  /**
   * O eixo X travou. Devolve os limites do deslocamento (`min ≤ dx ≤ max`, em
   * px, a partir de onde travou) ou `null` para desistir deste sentido.
   */
  aoTravar: (sentido: 1 | -1) => { min: number; max: number } | null;
  aoMover: (dx: number) => void;
  aoSoltar: (dx: number, velocidade: number) => void;
  /** o sistema tomou o toque (voltar da borda, chamada recebida): desfazer. */
  aoCancelar: () => void;
}

/**
 * Liga o arrasto horizontal em `raiz` (ou na janela inteira, com `null` — para
 * camadas que sobem por portal e não moram dentro do shell).
 *
 * As opções são lidas no momento do evento (ficam numa `ref`), então podem
 * fechar sobre estado novo sem religar os ouvintes.
 */
export function useArrastoHorizontal(
  raiz: RefObject<HTMLElement> | null,
  opcoes: OpcoesDoArrastoHorizontal,
) {
  const op = useRef(opcoes);
  op.current = opcoes;
  const { ligado } = opcoes;

  useEffect(() => {
    if (!ligado) return;
    const elemento = raiz ? raiz.current : null;
    if (raiz && !elemento) return;
    // `EventTarget`, e não `HTMLElement | Window`: as duas assinaturas de
    // `addEventListener` são sobrecarregadas, e a união delas não é chamável
    const escuta: EventTarget = elemento ?? window;

    let gesto: {
      id: number;
      x0: number;
      y0: number;
      t0: number;
      alvo: Element | null;
      travado: boolean;
      min: number;
      max: number;
      amostras: Amostra[];
    } | null = null;

    const aoPressionar = (ev: Event) => {
      const e = ev as PointerEvent;
      if (gesto || e.pointerType === "mouse" || !e.isPrimary) return;
      const alvo = e.target instanceof Element ? e.target : null;
      if (!alvo || alvo.closest(COM_GESTO_PROPRIO)) return;
      // seleção viva: o dedo está ajustando a alça, como no toque longo
      const selecao = window.getSelection?.();
      if (selecao && !selecao.isCollapsed) return;
      if (!op.current.podeComecar(e)) return;
      gesto = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        t0: e.timeStamp,
        alvo,
        travado: false,
        min: 0,
        max: 0,
        amostras: [],
      };
    };

    const aoMover = (e: PointerEvent) => {
      const g = gesto;
      if (!g || e.pointerId !== g.id) return;
      if (!g.travado) {
        const dx = e.clientX - g.x0;
        const eixo = decidirEixo(dx, e.clientY - g.y0);
        if (eixo === null) {
          if (e.timeStamp - g.t0 > TEMPO_DO_TOQUE_LONGO) gesto = null;
          return;
        }
        if (eixo === "y" || e.timeStamp - g.t0 > TEMPO_DO_TOQUE_LONGO) {
          gesto = null;
          return;
        }
        const sentido = dx > 0 ? 1 : -1;
        if (rolaNoSentido(g.alvo, elemento, sentido)) {
          gesto = null;
          return;
        }
        const limites = op.current.aoTravar(sentido);
        if (!limites) {
          gesto = null;
          return;
        }
        g.travado = true;
        g.min = limites.min;
        g.max = limites.max;
        // o deslocamento conta **daqui**: contar da origem faria a camada dar
        // um salto dos 10px do limiar no primeiro quadro
        g.x0 = e.clientX;
        g.amostras = [{ t: e.timeStamp, v: e.clientX }];
        if (elemento) {
          try {
            elemento.setPointerCapture(e.pointerId);
          } catch {
            // o ponteiro já pode ter sido tomado pelo sistema; o cancel resolve
          }
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      g.amostras.push({ t: e.timeStamp, v: e.clientX });
      g.amostras = aparar(g.amostras, e.timeStamp);
      op.current.aoMover(limitar(e.clientX - g.x0, g.min, g.max));
    };

    const aoSoltar = (e: PointerEvent) => {
      const g = gesto;
      if (!g || e.pointerId !== g.id) return;
      gesto = null;
      if (!g.travado) return;
      g.amostras.push({ t: e.timeStamp, v: e.clientX });
      engolirProximoClique();
      op.current.aoSoltar(limitar(e.clientX - g.x0, g.min, g.max), velocidadeDoGesto(g.amostras));
    };

    const aoCancelar = (e: PointerEvent) => {
      const g = gesto;
      if (!g || e.pointerId !== g.id) return;
      gesto = null;
      if (g.travado) op.current.aoCancelar();
    };

    // O `touch-action: pan-y` da área não basta: o dedo quase sempre começa
    // dentro da lista de mensagens, que é um contêiner de rolagem próprio, e o
    // `touch-action` dos ancestrais acima dele não vale para o pan dela. Sem
    // isto, o `touchmove` que segue o `pointermove` do travamento começava a
    // rolagem nativa e o navegador mandava `pointercancel` — a conversa nunca
    // acompanhava o dedo (bancada, 2026-09-14: `pointercancel` 16px depois do
    // `pointerdown`). Só cancela depois do travamento no eixo X: a rolagem
    // vertical e o toque longo continuam do navegador. Não passivo de propósito.
    const aoTocarMover = (ev: Event) => {
      if (gesto?.travado && ev.cancelable) ev.preventDefault();
    };

    // `pointerdown` na captura: um filho que pare a propagação não pode
    // esconder o começo do gesto. Mover/soltar na janela: o alvo do toque pode
    // sair do DOM no meio do arrasto, e o evento segue chegando aqui.
    escuta.addEventListener("pointerdown", aoPressionar, true);
    window.addEventListener("pointermove", aoMover, true);
    window.addEventListener("pointerup", aoSoltar, true);
    window.addEventListener("pointercancel", aoCancelar, true);
    window.addEventListener("touchmove", aoTocarMover, { capture: true, passive: false });
    return () => {
      if (gesto?.travado) op.current.aoCancelar();
      gesto = null;
      escuta.removeEventListener("pointerdown", aoPressionar, true);
      window.removeEventListener("pointermove", aoMover, true);
      window.removeEventListener("pointerup", aoSoltar, true);
      window.removeEventListener("pointercancel", aoCancelar, true);
      window.removeEventListener("touchmove", aoTocarMover, { capture: true });
    };
  }, [ligado, raiz]);
}
