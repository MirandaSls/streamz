/**
 * Fontes alternativas ao YouTube para a música do bot.
 *
 * O YouTube bloqueia o IP do servidor: a busca funciona e o áudio não sai.
 * Quando uma faixa falha por bloqueio, o bot procura a mesma música no
 * SoundCloud e no JioSaavn (plugins do Lavalink, prefixos `scsearch` e
 * `jssearch`). Aqui só a lógica pura, sem rede: quem consulta é o `servico.ts`.
 */

export const PREFIXOS_ALTERNATIVOS = ["scsearch", "jssearch"] as const;

/**
 * Colchetes/parênteses com ruído de upload ("Official Video", "Lyrics", "4K"…)
 * atrapalham a busca em outra fonte, onde o título quase nunca os tem.
 * "ft."/"feat." ficam: ajudam a achar a versão certa.
 */
const RUIDO = /[([][^)\]]*\b(official|lyrics?|audio|video|4k|hd)\b[^)\]]*[)\]]/gi;

function limpar(texto: string): string {
  return texto.replace(RUIDO, " ").replace(/\s+/g, " ").trim();
}

/** Título sem ruído de upload; usado também nas consultas vindas do embed do Spotify. */
export function limparTitulo(texto: string): string {
  return limpar(texto);
}

/** Uma consulta por fonte alternativa; `[]` quando a faixa não tem título. */
export function consultasAlternativas(faixa: {
  title?: string | null;
  author?: string | null;
}): string[] {
  const titulo = limpar(faixa.title ?? "");
  if (!titulo) return [];
  const autor = limpar(faixa.author ?? "");
  // Muito título de upload já traz o autor ("Trapt - Headstrong"): prefixar de
  // novo gera "Trapt Trapt - Headstrong", que não acha nada na outra fonte.
  const jaTemAutor = autor !== "" && titulo.toLowerCase().includes(autor.toLowerCase());
  const completa = jaTemAutor ? titulo : `${autor} ${titulo}`.trim();
  // Segunda variante só com o título: o autor do YouTube costuma ser o canal
  // ("TraptVEVO"), que atrapalha. Ordem preservada: scsearch antes de jssearch.
  const comPrefixo = (v: string) => PREFIXOS_ALTERNATIVOS.map((prefixo) => `${prefixo}:${v}`);
  // As completas vêm primeiro (sc, js); as só-título depois, como reserva.
  return completa === titulo ? comPrefixo(completa) : [...comPrefixo(completa), ...comPrefixo(titulo)];
}

/**
 * Lembra por um tempo que o YouTube bloqueou, para o bot pular o YouTube nas
 * buscas por texto em vez de falhar de novo a cada pedido.
 */
export class MemoriaDeBloqueio {
  private ate = Number.NEGATIVE_INFINITY;

  constructor(private readonly ttlMs = 10 * 60_000) {}

  marcar(agora = Date.now()): void {
    this.ate = agora + this.ttlMs;
  }

  ativo(agora = Date.now()): boolean {
    return agora <= this.ate;
  }
}

/** A faixa já veio de uma fonte alternativa (e não do YouTube)? */
export function ehFonteAlternativa(sourceName?: string | null): boolean {
  if (!sourceName) return false;
  const nome = sourceName.toLowerCase();
  return nome === "soundcloud" || nome === "jiosaavn";
}
