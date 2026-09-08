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
