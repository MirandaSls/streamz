/**
 * Estado do player que a `lavalink-client` **não** zera quando a fila acaba.
 *
 * ## Por que isto existe
 *
 * Quando a última faixa termina, `LavalinkNode.queueEnd` só faz
 * `queue.current = null` e `playing = false`; o player continua vivo até o
 * `onEmptyQueue.destroyAfterMs` (30 s) — ou **para sempre** com o 24/7 ligado,
 * porque `aoAcabarAFila` cancela o timer. Um `/tocar` nesse intervalo reaproveita
 * o player (`createPlayer` devolve o que já existe), e com ele herdava:
 *
 * - `paused` (o `play()` da lib não manda `paused` quando não recebe a opção, então
 *   o Lavalink segue pausado e a faixa nova "toca" muda);
 * - `repeatMode` (`track`/`queue` faz a faixa antiga voltar no `trackEnd`);
 * - `queue.previous` (o `/anterior` e o autoplay enxergavam o histórico de
 *   outra sessão);
 * - o timer `internal_queueempty` e as marcas `internal_*` de parada.
 *
 * O resto (`queue.current`, `tracks`) já vem limpo; aqui só se zera o que sobrou.
 */

/** O recorte do `Player` de que a lógica precisa — estrutural, para testar sem a lib. */
export interface JogadorReiniciavel {
  paused: boolean;
  playing: boolean;
  repeatMode: string;
  lastPosition: number;
  lastPositionChange: number | null;
  queue: { current: unknown; tracks: unknown[]; previous: unknown[] };
  getData(chave: string): unknown;
  setData(chave: string, valor: unknown): unknown;
}

/** Nada tocando e nada na fila: o player só está ocupando a call. */
export function estaOcioso(jogador: Pick<JogadorReiniciavel, "queue">): boolean {
  return !jogador.queue.current && jogador.queue.tracks.length === 0;
}

/**
 * Devolve um player ocioso ao estado de recém-criado, **sem** desconectar
 * (reconectar custaria o `VOICE_SERVER_UPDATE` de novo, que é o maior pedaço da
 * latência do `/tocar`). Não mexe em volume nem em conexão.
 */
export function zerarJogadorOcioso(jogador: JogadorReiniciavel): void {
  const timer = jogador.getData("internal_queueempty") as ReturnType<typeof setTimeout> | undefined;
  if (timer) clearTimeout(timer);
  jogador.setData("internal_queueempty", undefined);
  jogador.setData("internal_stopPlaying", undefined);
  jogador.setData("internal_skipped", false);
  jogador.setData("internal_autoplayStopPlaying", undefined);
  jogador.paused = false;
  jogador.playing = false;
  jogador.repeatMode = "off";
  jogador.lastPosition = 0;
  jogador.lastPositionChange = null;
  jogador.queue.previous.length = 0;
}

/** O player está no meio do `destroy()` (a lib só o tira do mapa no fim dele). */
export function estaSendoDestruido(jogador: Pick<JogadorReiniciavel, "getData">): boolean {
  return jogador.getData("internal_destroystatus") === true;
}

/**
 * Espera `condicao` ficar verdadeira, de `passoMs` em `passoMs`, até `limiteMs`.
 * Devolve se chegou a ser verdadeira.
 */
export async function esperarAte(
  condicao: () => boolean,
  limiteMs: number,
  passoMs = 50,
): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (!condicao()) {
    if (Date.now() >= fim) return false;
    await new Promise((r) => setTimeout(r, passoMs));
  }
  return true;
}
