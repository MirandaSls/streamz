/**
 * Formatação das mensagens do bot de música. Tudo função pura, de propósito:
 * é a única parte deste bot que dá para testar sem Lavalink, sem gateway e sem
 * ponte de voz — e é onde moram os erros bobos (o `1:5` em vez de `1:05`).
 */

/** `225000` → `3:45`; passando de uma hora, `1:02:03`. */
export function formatarDuracao(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const dois = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${m}:${dois(s)}`;
}

/** Duração de uma transmissão ao vivo não é número — é "ao vivo". */
export function formatarDuracaoOuAoVivo(ms: number, aoVivo: boolean): string {
  return aoVivo ? "ao vivo" : formatarDuracao(ms);
}

/**
 * A barra de progresso do `/agora`.
 *
 * Um marcador `🔘` numa trilha `▬`, como todo bot de música faz. A posição é
 * grampeada em `[0, largura-1]`: um `position` maior que a duração (acontece
 * no fim da faixa, o Lavalink reporta com atraso) empurraria o marcador para
 * fora e a barra sairia com um caractere a mais.
 */
export function barraDeProgresso(posicaoMs: number, duracaoMs: number, largura = 20): string {
  const trilha = "▬";
  const marcador = "🔘";
  if (!Number.isFinite(duracaoMs) || duracaoMs <= 0) return trilha.repeat(largura);
  const fracao = Math.min(Math.max(posicaoMs / duracaoMs, 0), 1);
  const indice = Math.min(Math.floor(fracao * largura), largura - 1);
  return `${trilha.repeat(indice)}${marcador}${trilha.repeat(largura - indice - 1)}`;
}

/**
 * Corta um título comprido sem estourar o campo do embed.
 *
 * Corta em caracteres e não em bytes: os limites do Discord são em caracteres,
 * e um título com acento não pode encolher por causa do UTF-8.
 */
export function truncar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  return `${texto.slice(0, Math.max(limite - 1, 0))}…`;
}

/**
 * Escapa o markdown de um título vindo da internet.
 *
 * Sem isto, um vídeo chamado `**oferta**` sai em negrito no chat — e um com
 * `[texto](http://…)` vira um **link clicável** que o bot não escreveu. É o
 * mesmo motivo pelo qual nenhum título de terceiro entra cru numa mensagem.
 */
export function escaparMarkdown(texto: string): string {
  return texto.replace(/([\\`*_~|>[\]()])/g, "\\$1");
}

/** `[3:45] Título — Autor`, já escapado e cortado. */
export function linhaDaFaixa(faixa: {
  titulo: string;
  autor: string;
  duracaoMs: number;
  aoVivo: boolean;
}): string {
  const duracao = formatarDuracaoOuAoVivo(faixa.duracaoMs, faixa.aoVivo);
  const titulo = escaparMarkdown(truncar(faixa.titulo, 70));
  const autor = escaparMarkdown(truncar(faixa.autor, 40));
  return `\`[${duracao}]\` ${titulo} — ${autor}`;
}

/** `off` → "desligado", para a mensagem do `/repetir`. */
export function nomeDoModoDeRepeticao(modo: string): string {
  if (modo === "track") return "a faixa atual";
  if (modo === "queue") return "a fila inteira";
  return "desligado";
}

/**
 * Link do Spotify vira **busca**, e o usuário precisa saber disso.
 *
 * O Spotify não entrega áudio a terceiros: todo bot de música lê os metadados
 * e procura o equivalente no YouTube. Prometer "toca Spotify" e entregar outra
 * gravação é o tipo de mentira pequena que gera "esse bot é ruim".
 */
export function ehLinkDoSpotify(consulta: string): boolean {
  return /(^|\/\/)(open\.)?spotify\.com\//i.test(consulta) || consulta.startsWith("spotify:");
}
