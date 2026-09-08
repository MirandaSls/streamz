/**
 * Detecção do que está sendo digitado no composer — a parte pura do
 * autocomplete (`:` emoji, `@` membro, `#` canal, `/` comando).
 *
 * Fica separada do componente porque é aqui que mora a regra que erra fácil:
 * onde o gatilho começa, quando ele deixa de valer e o que exatamente será
 * substituído quando a pessoa escolher. O componente só desenha a lista.
 */

export type TipoGatilho = ":" | "@" | "#" | "/";

export interface Gatilho {
  tipo: TipoGatilho;
  /** o que foi digitado depois do sinal (sem ele). */
  termo: string;
  /** posição do sinal no texto. */
  inicio: number;
  /** posição logo após o último caractere do termo (onde está o cursor). */
  fim: number;
}

/** Mínimo de letras depois de `:` para o popup abrir (evita piscar em `10:`). */
export const MIN_LETRAS_EMOJI = 2;

/** Caracteres aceitos no termo de cada gatilho. */
const TERMO: Record<TipoGatilho, RegExp> = {
  ":": /^[a-z0-9_]*$/,
  "@": /^[A-Za-z0-9_.-]*$/,
  "#": /^[a-z0-9_-]*$/,
  // ── j-bots ── era `/^[a-z]*$/`, e alargou na F3.
  //
  // Os comandos nativos são todos de letras, mas o nome de um comando de barra
  // do Discord aceita `[-_a-z0-9]`, e um bot é livre para registrar `/play-next`
  // ou `/r6stats`. Com o padrão antigo o popup **sumia no meio da digitação** —
  // no instante do hífen ou do dígito — e o comando existia, era enviável, e o
  // autocomplete escondia.
  //
  // Alargar é seguro porque a regra do `i !== 0` continua valendo logo abaixo:
  // o `/` só é gatilho na primeira posição da mensagem. O que muda é apenas o
  // que conta como termo **depois** dessa barra inicial.
  "/": /^[a-z0-9_-]*$/,
};

/**
 * O gatilho ativo na posição do cursor, ou null.
 *
 * Regras (as do Discord): o sinal só conta no começo do texto ou depois de um
 * espaço — senão `email@dominio` e `a:b` virariam menu; `/` só conta como
 * comando na primeira posição da mensagem, porque no meio da frase é barra
 * mesmo; e o termo só pode conter os caracteres que aquele gatilho aceita, o
 * que fecha o popup no instante em que a pessoa digita um espaço.
 */
export function detectarGatilho(texto: string, caret: number): Gatilho | null {
  const antes = texto.slice(0, caret);
  // procura o último sinal de gatilho ainda "aberto"
  for (let i = antes.length - 1; i >= 0; i--) {
    const ch = antes[i] as TipoGatilho;
    if (ch !== ":" && ch !== "@" && ch !== "#" && ch !== "/") {
      // um espaço encerra qualquer termo em aberto
      if (/\s/.test(antes[i])) return null;
      continue;
    }
    const termo = antes.slice(i + 1);
    if (!TERMO[ch].test(termo)) return null;
    const anterior = i === 0 ? "" : antes[i - 1];
    if (anterior && !/\s/.test(anterior)) return null;
    if (ch === "/" && i !== 0) return null;
    if (ch === ":" && termo.length < MIN_LETRAS_EMOJI) return null;
    return { tipo: ch, termo, inicio: i, fim: caret };
  }
  return null;
}

/**
 * Aplica a escolha: troca o trecho do gatilho pelo valor e devolve onde o
 * cursor fica. `valor` já vem completo (com o sinal, quando faz parte dele —
 * `@fulano`, `#geral`) e ganha um espaço no fim, para a pessoa continuar
 * escrevendo sem apertar espaço.
 */
export function aplicarEscolha(
  texto: string,
  gatilho: Gatilho,
  valor: string,
): { texto: string; caret: number } {
  const depois = texto.slice(gatilho.fim);
  const sufixo = depois.startsWith(" ") ? "" : " ";
  const novo = texto.slice(0, gatilho.inicio) + valor + sufixo + depois;
  return { texto: novo, caret: gatilho.inicio + valor.length + sufixo.length };
}

/** Move a seleção circularmente dentro da lista (setas ↑ ↓). */
export function mover(indice: number, delta: number, total: number): number {
  if (total === 0) return 0;
  return (indice + delta + total) % total;
}
