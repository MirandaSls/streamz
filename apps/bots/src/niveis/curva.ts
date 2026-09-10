/**
 * A curva de nível do **Streamz Níveis** — a única parte deste bot que
 * qualquer pessoa vai querer conferir na mão, e por isso a mais isolada.
 *
 * Tudo aqui é função pura de `number` para `number`: sem relógio, sem estado,
 * sem rede. É o que permite testar a curva inteira em milissegundos e é onde
 * moram os erros que ninguém vê rodando (o nível que dá 4 quando devia dar 5
 * exatamente na virada).
 *
 * ## A fórmula
 *
 * ```
 * xpDoNivel(n) = 5n² + 50n + 100
 * ```
 *
 * é o **custo de sair do nível `n` e chegar ao `n+1`**, e não o total. É a
 * curva quadrática clássica dos bots de nível: 100 XP para o primeiro nível,
 * 155 para o segundo, 220 para o terceiro. Quadrática e não exponencial porque
 * exponencial trava: no nível 30 de uma curva 1.5ⁿ ninguém sobe mais e o
 * ranking congela no primeiro mês.
 *
 * O **acumulado** — quanto XP no total é preciso para *estar* no nível `n` — é
 * a soma de `xpDoNivel(0..n-1)`, e tem forma fechada (`xpAcumuladoAte`). Vale a
 * pena: sem ela, `nivelDoXp` de alguém com 2 milhões de XP seria um laço de
 * cem iterações a cada mensagem do servidor.
 */

/** XP para **sair** do nível `n` e chegar ao `n+1`. */
export function xpDoNivel(nivel: number): number {
  const n = Math.max(0, Math.floor(nivel));
  return 5 * n * n + 50 * n + 100;
}

/**
 * XP acumulado necessário para **estar** no nível `n`.
 *
 * Forma fechada da soma `Σ(k=0..n-1) 5k² + 50k + 100`, usando
 * `Σk² = (n-1)n(2n-1)/6` e `Σk = (n-1)n/2`:
 *
 * ```
 * xpAcumuladoAte(n) = 5·(n-1)n(2n-1)/6 + 25·(n-1)n + 100n
 * ```
 *
 * `xpAcumuladoAte(0) = 0`, `xpAcumuladoAte(1) = 100`, `xpAcumuladoAte(2) = 255`.
 */
export function xpAcumuladoAte(nivel: number): number {
  const n = Math.max(0, Math.floor(nivel));
  if (n === 0) return 0;
  return (5 * (n - 1) * n * (2 * n - 1)) / 6 + 25 * (n - 1) * n + 100 * n;
}

/**
 * O nível de quem tem `xp` acumulado.
 *
 * Busca binária sobre `xpAcumuladoAte`, com o teto achado por dobras. Um laço
 * incremental daria o mesmo resultado e seria mais fácil de ler, mas isto roda
 * **a cada mensagem de cada servidor** e um `/dar-xp 999999999` deixaria o laço
 * com dezenas de milhares de voltas — a busca binária faz o mesmo em ~30.
 */
export function nivelDoXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 100) return 0;

  let alto = 1;
  while (xpAcumuladoAte(alto) <= xp) alto *= 2;

  let baixo = Math.floor(alto / 2);
  // Invariante: xpAcumuladoAte(baixo) <= xp < xpAcumuladoAte(alto).
  while (alto - baixo > 1) {
    const meio = Math.floor((baixo + alto) / 2);
    if (xpAcumuladoAte(meio) <= xp) baixo = meio;
    else alto = meio;
  }
  return baixo;
}

/** O retrato de alguém dentro do próprio nível — o que o `/nivel` desenha. */
export interface Progresso {
  nivel: number;
  /** XP total acumulado. */
  xp: number;
  /** Quanto do nível atual já foi feito. */
  xpNoNivel: number;
  /** Quanto o nível atual custa por inteiro. */
  xpDoNivel: number;
  /** Quanto falta para o próximo. */
  falta: number;
  /** `xpNoNivel / xpDoNivel`, grampeado em [0, 1] — a barra. */
  fracao: number;
}

/** Tudo que o `/nivel` precisa, a partir só do XP acumulado. */
export function progressoDoXp(xp: number): Progresso {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const nivel = nivelDoXp(total);
  const base = xpAcumuladoAte(nivel);
  const custo = xpDoNivel(nivel);
  const dentro = total - base;
  return {
    nivel,
    xp: total,
    xpNoNivel: dentro,
    xpDoNivel: custo,
    falta: Math.max(0, custo - dentro),
    fracao: custo > 0 ? Math.min(Math.max(dentro / custo, 0), 1) : 0,
  };
}
