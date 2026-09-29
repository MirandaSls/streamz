/**
 * A conta do zoom e do arrasto do vídeo em tela cheia no celular.
 *
 * Está aqui fora do componente porque é **só aritmética** — e porque foi
 * errando essa aritmética que a primeira versão deixava a imagem escapar da
 * tela: sem limite no deslocamento, dois dedos afastados e um arrasto rápido
 * jogavam a transmissão para fora do viewport e não havia gesto de volta.
 *
 * O modelo é o do `transform` do CSS, nesta ordem: `translate(x, y) scale(s)`.
 * A escala é em torno do **centro** do elemento (o `transform-origin` padrão),
 * então o quanto dá para arrastar em cada eixo é a metade do que sobra:
 * `(escala - 1) * lado / 2`. Com escala 1 não sobra nada, e o deslocamento é
 * zerado — é o que faz a imagem voltar sozinha ao lugar quando se fecha a
 * pinça.
 *
 * O vídeo é desenhado com `object-fit: contain`, então girar o telefone não
 * corta nem estica: o que muda é a caixa, e a imagem continua inteira dentro
 * dela. O zoom acontece **depois** disso, por cima do quadro já ajustado.
 *
 * A mesma aritmética serve a transmissão de tela no desktop/web: roda do
 * mouse e cápsula −/100%/+ chegam aqui como um fator multiplicativo, do
 * mesmo jeito que a pinça, e passam pelo mesmo `comZoom`/`limitar`.
 */

export interface Ajuste {
  escala: number;
  x: number;
  y: number;
}

export interface Viewport {
  largura: number;
  altura: number;
}

/** Ponto de um dedo na tela. */
export interface Ponto {
  x: number;
  y: number;
}

export const AJUSTE_INICIAL: Ajuste = { escala: 1, x: 0, y: 0 };

/** Piso: 1 é "a imagem inteira cabendo", que é o estado de repouso. */
export const ESCALA_MIN = 1;
/**
 * Teto: 5×. Acima disso uma transmissão de 1080p num telefone já é só o pixel
 * ampliado, e o gesto passa a parecer quebrado porque nada mais fica nítido.
 */
export const ESCALA_MAX = 5;

/** Distância entre dois dedos — o que a pinça mede. */
export function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ponto médio entre dois dedos — é em torno dele que a pinça amplia. */
export function centro(a: Ponto, b: Ponto): Ponto {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function limitarEscala(escala: number): number {
  if (!Number.isFinite(escala)) return ESCALA_MIN;
  return Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escala));
}

/**
 * Prende o deslocamento dentro do que a escala permite.
 *
 * Sem isto o arrasto seria infinito e a imagem sairia de cena. Com escala 1 o
 * limite é zero nos dois eixos, então soltar a pinça **recentraliza sozinho**.
 */
export function limitar(ajuste: Ajuste, viewport: Viewport): Ajuste {
  const escala = limitarEscala(ajuste.escala);
  const folgaX = Math.max(0, (escala - 1) * viewport.largura) / 2;
  const folgaY = Math.max(0, (escala - 1) * viewport.altura) / 2;
  return {
    escala,
    // `+ 0` normaliza o `-0` que sai de prender um valor negativo em zero: ele
    // é invisível no `transform` e visível em qualquer comparação
    x: Math.min(folgaX, Math.max(-folgaX, ajuste.x)) + 0,
    y: Math.min(folgaY, Math.max(-folgaY, ajuste.y)) + 0,
  };
}

/**
 * Amplia por um fator mantendo fixo o ponto entre os dedos.
 *
 * `foco` é em coordenadas da **caixa** (0,0 no canto superior esquerdo dela).
 * A conta desloca a imagem para que o pixel que estava sob o ponto médio
 * continue lá depois da mudança de escala — é o que dá a sensação de que os
 * dedos estão segurando a imagem, e não empurrando uma lupa.
 */
export function comZoom(base: Ajuste, fator: number, foco: Ponto, viewport: Viewport): Ajuste {
  const escala = limitarEscala(base.escala * fator);
  // fator efetivo depois do teto/piso: sem isto, insistir na pinça no limite
  // continuaria arrastando a imagem para o lado
  const efetivo = base.escala === 0 ? 1 : escala / base.escala;
  // distância do foco ao centro da caixa, que é a origem do `scale`
  const dx = foco.x - viewport.largura / 2;
  const dy = foco.y - viewport.altura / 2;
  return limitar(
    {
      escala,
      x: dx - (dx - base.x) * efetivo,
      y: dy - (dy - base.y) * efetivo,
    },
    viewport,
  );
}

/** Arrasta a imagem ampliada. Com escala 1 não sai do lugar (ver `limitar`). */
export function comPan(base: Ajuste, dx: number, dy: number, viewport: Viewport): Ajuste {
  return limitar({ escala: base.escala, x: base.x + dx, y: base.y + dy }, viewport);
}

/** A string que vai para o `style.transform`. */
export function transformDe(a: Ajuste): string {
  return `translate(${a.x.toFixed(2)}px, ${a.y.toFixed(2)}px) scale(${a.escala.toFixed(4)})`;
}

/** Já está no ajuste original? (o duplo-toque só vale quando não está). */
export function ehOriginal(a: Ajuste): boolean {
  return Math.abs(a.escala - 1) < 0.01 && Math.abs(a.x) < 0.5 && Math.abs(a.y) < 0.5;
}

/** Intervalo máximo entre dois toques para valerem como duplo-toque. */
export const DUPLO_TOQUE_MS = 300;

/**
 * O duplo-toque tem dois destinos: do repouso ele **amplia** no ponto tocado
 * (2×, que é o que os visualizadores de foto fazem) e de qualquer zoom ele
 * **volta ao original**. Um só gesto para ir e voltar.
 */
export function aoDuploToque(base: Ajuste, ponto: Ponto, viewport: Viewport): Ajuste {
  if (!ehOriginal(base)) return AJUSTE_INICIAL;
  return comZoom(AJUSTE_INICIAL, 2, ponto, viewport);
}

/** Fator de um clique na cápsula de zoom (desktop): +/− este passo por vez. */
export const PASSO_DO_BOTAO = 1.25;

/**
 * Converte um evento `wheel` num fator multiplicativo para `comZoom`.
 *
 * `deltaMode` do navegador muda a unidade de `deltaY`: 0 é pixel, 1 é linha
 * (~16px) e 2 é página inteira (~800px) — sem essa conversão um trackpad que
 * manda "linhas" ampliaria 16× mais devagar que um mouse que manda pixels, ou
 * uma página inteira saltaria direto para o teto. Depois de normalizar para
 * pixel, `Math.exp(-px * 0.002)` dá uma curva suave: roda para cima (`deltaY`
 * negativo) amplia, para baixo reduz. O teto de 1.5×/evento existe porque
 * alguns trackpads mandam um `deltaY` enorme num só evento — sem prender aqui
 * um gesto isolado saltaria para perto do teto de `ESCALA_MAX` de uma vez.
 */
export function fatorDaRoda(deltaY: number, deltaMode = 0): number {
  return fatorDeDelta(deltaY, deltaMode, 0.002);
}

/** Converte `deltaY` para pixels segundo o `deltaMode` (0 px, 1 linha, 2 página). */
function emPixels(deltaY: number, deltaMode: number): number {
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 800 : deltaY;
}

function fatorDeDelta(deltaY: number, deltaMode: number, sensibilidade: number): number {
  if (!Number.isFinite(deltaY)) return 1;
  // `Math.exp` pode estourar para `Infinity` com um `deltaY` finito mas
  // enorme (trackpad) — o `deltaY` já está garantido finito acima, então o
  // que sobra aqui é só prender o resultado ao teto/piso, nunca descartá-lo.
  const fator = Math.exp(-emPixels(deltaY, deltaMode) * sensibilidade);
  return Math.min(1.5, Math.max(1 / 1.5, fator));
}

/**
 * Fator da pinça do touchpad no Windows (Chrome/Edge/WebView2), que chega como
 * `wheel` com `ctrlKey`.
 *
 * Outra constante que `fatorDaRoda` (0.01 contra 0.002) porque a pinça manda
 * deltas pequenos e contínuos (tipicamente 1 a 10px por evento), enquanto a
 * roda manda saltos de ~100px: com 0.002 a pinça ficaria lenta demais para
 * acompanhar os dedos. Mesma normalização de `deltaMode` e mesmo teto/piso.
 */
export function fatorDaPinca(deltaY: number, deltaMode = 0): number {
  return fatorDeDelta(deltaY, deltaMode, 0.01);
}

/**
 * Fator de um passo do `GestureEvent` do WebKit (macOS: Safari/WKWebView).
 *
 * `scale` chega **acumulado** desde o `gesturestart` (1 no começo), não como
 * delta — então o fator do passo é a razão entre a escala atual e a anterior.
 * Valor não-finito ou <= 0 em qualquer dos dois não tem razão possível: vira 1
 * (sem mudança). Preso a [1/1.5, 1.5] pelo mesmo motivo de `fatorDaRoda`.
 */
export function fatorDoGesto(escalaAnterior: number, escalaAtual: number): number {
  if (!Number.isFinite(escalaAnterior) || escalaAnterior <= 0) return 1;
  if (!Number.isFinite(escalaAtual) || escalaAtual <= 0) return 1;
  return Math.min(1.5, Math.max(1 / 1.5, escalaAtual / escalaAnterior));
}

/**
 * Amplia/reduz por `PASSO_DO_BOTAO` em torno do centro da caixa.
 *
 * A cápsula não tem foco — ao contrário da roda, que amplia sob o cursor —
 * então o ponto fixo é o centro do viewport, como o duplo-toque no repouso.
 * Perto do piso, `comZoom`/`limitar` já cravam a escala em exatamente 1 e
 * zeram o deslocamento (ver `limitar`), então reduzir de perto de 1 volta ao
 * ajuste original sem sobra de ponto flutuante.
 */
export function comBotao(base: Ajuste, direcao: 1 | -1, viewport: Viewport): Ajuste {
  const fator = direcao === 1 ? PASSO_DO_BOTAO : 1 / PASSO_DO_BOTAO;
  const foco = { x: viewport.largura / 2, y: viewport.altura / 2 };
  return comZoom(base, fator, foco, viewport);
}

/** Percentual exibido na cápsula (100% é o repouso). */
export function percentualDe(a: Ajuste): number {
  return Math.round(a.escala * 100);
}

/** Se o `+` da cápsula ainda faz algo (falso já no teto). */
export function podeAmpliar(a: Ajuste): boolean {
  return a.escala < ESCALA_MAX - 0.001;
}

/** Se o `−` da cápsula ainda faz algo (falso já no piso). */
export function podeReduzir(a: Ajuste): boolean {
  return a.escala > ESCALA_MIN + 0.001;
}
