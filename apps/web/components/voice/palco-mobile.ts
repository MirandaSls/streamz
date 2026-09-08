/**
 * Quem fica no destaque do palco do celular, e quem fica na faixa.
 *
 * No telefone **não existe grade**: a tela é estreita demais para dois tiles
 * lado a lado valerem alguma coisa, e o Discord do celular resolve isso com um
 * destaque grande e uma tira rolável embaixo (ver `docs/Reference/mobile/`).
 * Como o destaque nunca pode estar vazio, esta função tem de devolver **sempre**
 * um principal quando há alguém na sala — a diferença para o desktop, onde
 * `focado === null` é um estado legítimo (a grade).
 *
 * A ordem de preferência abaixo é a resposta à pergunta "o que a pessoa veio
 * ver": uma transmissão aberta ganha de uma câmera, que ganha de um avatar.
 * Escolha explícita (um toque na faixa) ganha de tudo.
 */

/** O mínimo que esta escolha precisa saber de um tile. */
export interface TileDoPalco {
  key: string;
  tela: boolean;
  assistindo: boolean;
  /** há faixa de vídeo viva (câmera ligada ou tela já baixando). */
  comVideo: boolean;
  /** id do dono, para casar um `focado` guardado como pessoa. */
  userId: string;
}

export interface Palco<T extends TileDoPalco> {
  principal: T | null;
  faixa: T[];
}

export function dividirPalco<T extends TileDoPalco>(tiles: readonly T[], focado: string | null): Palco<T> {
  const principal = escolherPrincipal(tiles, focado);
  return {
    principal,
    faixa: principal ? tiles.filter((t) => t.key !== principal.key) : [...tiles],
  };
}

function escolherPrincipal<T extends TileDoPalco>(tiles: readonly T[], focado: string | null): T | null {
  if (tiles.length === 0) return null;
  if (focado) {
    // a chave do tile primeiro (quem assiste a duas telas tem dois tiles do
    // mesmo dono), o id da pessoa como reserva — igual ao desktop
    const porChave = tiles.find((t) => t.key === focado);
    if (porChave) return porChave;
    const porPessoa = tiles.find((t) => t.userId === focado);
    if (porPessoa) return porPessoa;
  }
  return (
    tiles.find((t) => t.tela && t.assistindo) ??
    tiles.find((t) => t.tela) ??
    tiles.find((t) => !t.tela && t.comVideo) ??
    tiles[0]
  );
}

/**
 * Um toque no tile do destaque abre a tela cheia — mas só quando **há imagem**.
 *
 * Ampliar um avatar não é nada, e um toque que às vezes faz e às vezes não faz
 * é pior que um toque que nunca faz: por isso a resposta é explícita, e o botão
 * de expandir só é desenhado quando ela é `true`.
 */
export function podeAbrirEmTelaCheia(tile: Pick<TileDoPalco, "comVideo">): boolean {
  return tile.comVideo;
}

// ── medidas ────────────────────────────────────────────────────────────────

/**
 * Medidas da barra de controles, de `docs/Reference/mobile/MEDIDAS.md` §12
 * (`discord-mobile-call.png`, 1,8779 px/pt):
 *
 * | o quê | px | pt |
 * |---|---|---|
 * | altura da barra | 128 | **68** |
 * | largura | 686 | 365 (de 390 → margem de 13 de cada lado) |
 * | base da barra → base da tela | 64 | **34** (área segura) |
 * | botão | 77–80 | **42** |
 *
 * O nosso alvo de toque é **44**, e não 42: é o piso do HIG e do Material, e é
 * o mesmo número que o resto do leiaute de celular já usa (`BotaoDeToque`).
 * Dois pontos a mais que o Discord em cima de uma barra de 68 não mudam o
 * desenho e mudam o acerto do polegar.
 *
 * **Estes números são px, e por isso são números.** A raiz do app é
 * `font-size: 15.5px` (ver `globals.css`) e toda classe de tamanho do Tailwind
 * é `rem`: `h-11` vale **42,6** e não 44; `h-12` vale **46,5** e não 48.
 * Escrever uma medida como classe de escala é escrever um valor 3% menor que o
 * do comentário ao lado. Então o que é **medida ou piso** sai daqui, por
 * `style`, e não de `h-11`. Conferido com `getBoundingClientRect` no aparelho
 * emulado, que é o único jeito de saber — ler a classe não é medir.
 */
export const BARRA_ALTURA = 68;
export const BARRA_MARGEM = 13;
/** O círculo desenhado dos botões da barra; cabe nos 68 com 10 de folga. */
export const BOTAO = 48;
/** Piso de alvo de toque (Apple HIG e Material); vale para todo botão do palco. */
export const ALVO_MINIMO = 44;
/** Folga lateral do palco. Ver `PalcoMobile` — não é a margem do print. */
export const PALCO_MARGEM = 12;

/**
 * A faixa de miniaturas. Não há print do Discord com ela no telefone (a captura
 * de 2024 mostra a grade de dois, a de 2026 mostra dois tiles empilhados), então
 * estes números **não são medição**: são a faixa do desktop (188×106, 16:9, ver
 * `grid-layout.ts`) reduzida para caber ~3 miniaturas nos 390pt de um iPhone,
 * mantendo a proporção.
 */
export const FAIXA_LARGURA_MOBILE = 116;
export const FAIXA_ALTURA_MOBILE = 78;
export const FAIXA_GAP_MOBILE = 8;
