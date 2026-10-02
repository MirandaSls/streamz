/**
 * Escolha da melhor candidata numa busca por texto.
 *
 * Sem YouTube, a busca vem do SoundCloud e do JioSaavn, que misturam versão
 * oficial com cover, remix e karaokê. Pegar a primeira toca a faixa errada com
 * frequência; aqui pontuamos todas e escolhemos a que mais parece o pedido.
 * Lógica pura, sem rede: quem consulta é o `servico.ts`.
 */
import { limparTitulo } from "./fontes-alternativas";

export interface Candidata {
  title?: string | null;
  author?: string | null;
  duration?: number | null;
  sourceName?: string | null;
}

export interface Alvo {
  titulo: string;
  artista?: string;
  duracaoMs?: number;
}

/** Fração mínima dos termos do título pedido que a candidata precisa ter. */
const TITULO_MINIMO = 0.6;
/** Duração além disto (relativa ao alvo) descarta a candidata: costuma ser outra versão. */
const DURACAO_MAXIMA = 0.4;
const DURACAO_BONUS = 0.1;

/** Marcas de versão que não são a original; só pesam quando o pedido não as tem. */
const MARCAS = [
  "remix",
  "cover",
  "karaoke",
  "sped up",
  "slowed",
  "nightcore",
  "8d",
  "instrumental",
  "live",
  "tribute",
  "made famous",
];

/** Minúsculas, sem acento, sem ruído de upload e sem pontuação. */
export function normalizar(texto: string): string {
  return limparTitulo(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function termos(normalizado: string): string[] {
  return normalizado.split(" ").filter(Boolean);
}

function fracaoPresente(procurados: string[], onde: Set<string>): number {
  if (procurados.length === 0) return 1;
  return procurados.filter((t) => onde.has(t)).length / procurados.length;
}

function temMarca(normalizado: string, marca: string): boolean {
  return ` ${normalizado} `.includes(` ${marca} `);
}

/**
 * Índice da melhor candidata, ou `null` quando nenhuma serve (título que não
 * bate ou duração absurda). Melhor ter nada do que tocar a música errada.
 */
export function escolherMelhor(candidatas: readonly Candidata[], alvo: Alvo): number | null {
  const ranking = ordenarPorPontuacao(candidatas, alvo);
  return ranking.length > 0 ? ranking[0]!.indice : null;
}

/** Candidatas aceitas, da melhor para a pior (índices da lista original). */
export function ordenarPorPontuacao(
  candidatas: readonly Candidata[],
  alvo: Alvo,
): { indice: number; pontos: number }[] {
  const alvoNorm = normalizar(alvo.titulo);
  const termosTitulo = termos(alvoNorm);
  if (termosTitulo.length === 0) return [];
  const alvoArtista = normalizar(alvo.artista ?? "");
  const termosArtista = termos(alvoArtista);
  const contexto = `${alvoNorm} ${alvoArtista}`;

  const aceitas: { indice: number; pontos: number }[] = [];
  candidatas.forEach((c, indice) => {
    const titulo = normalizar(c.title ?? "");
    const autor = normalizar(c.author ?? "");
    const noTitulo = new Set(termos(titulo));
    const noTituloOuAutor = new Set([...noTitulo, ...termos(autor)]);

    const fracaoTitulo = fracaoPresente(termosTitulo, noTitulo);
    if (fracaoTitulo < TITULO_MINIMO) return;

    let pontos = fracaoTitulo * 10;
    // O artista pode estar no título ("Trapt - Headstrong") ou no autor.
    if (termosArtista.length > 0) pontos += fracaoPresente(termosArtista, noTituloOuAutor) * 4;

    // Termos a mais no título (além do pedido e do artista) sugerem outra versão.
    const esperados = new Set([...termosTitulo, ...termosArtista]);
    const extras = [...noTitulo].filter((t) => !esperados.has(t)).length;
    pontos -= Math.min(extras, 6) * 0.3;

    const duracao = c.duration ?? 0;
    const pedida = alvo.duracaoMs ?? 0;
    if (pedida > 0 && duracao > 0) {
      const desvio = Math.abs(duracao - pedida) / pedida;
      if (desvio > DURACAO_MAXIMA) return;
      if (desvio <= DURACAO_BONUS) pontos += 2;
    }

    const dela = `${titulo} ${autor}`;
    for (const marca of MARCAS) {
      if (temMarca(dela, marca) && !temMarca(contexto, marca)) pontos -= 5;
    }

    aceitas.push({ indice, pontos });
  });
  // Estável: empate fica com a ordem da fonte.
  return aceitas.sort((a, b) => b.pontos - a.pontos || a.indice - b.indice);
}
