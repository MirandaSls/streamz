/**
 * Leitura das meta tags de uma página, em varredura linear.
 *
 * A versão antiga rodava, para CADA campo (8 deles), uma regex com dois `[^>]*`
 * sobre o HTML inteiro. Numa página com muitos `<meta` e nenhum `>` — basta o
 * atacante servir `"<meta".repeat(n)` — o motor tentava casar a partir de cada
 * um desses `n` pontos, varrendo até o fim da string e voltando por backtracking
 * em cada tentativa: O(n²). Com o teto de leitura em 512 KB isso é tempo demais
 * (40 KB já custavam ~2 s), e como o Node tem um event loop só, a API inteira
 * congela junto — ReDoS a partir de um único GET /api/embeds.
 *
 * Aqui cada byte do HTML é olhado um número constante de vezes: as tags são
 * achadas por `indexOf` (que avança sempre para frente, nunca volta) e só os
 * atributos de cada tag — curta, por construção — passam por regex.
 */

/** Acima disto não é meta tag de verdade, é lixo; pular sai mais barato que ler. */
const MAX_TAG = 4096;

/** Atributos lidos dentro de UMA tag: sem quantificador aninhado, sem backtracking. */
const CHAVE = /(?:property|name)\s*=\s*["']([^"']*)["']/i;
const CONTEUDO = /content\s*=\s*["']([^"']*)["']/i;

export interface TagsDaPagina {
  /** `property`/`name` em minúsculas → `content`, o primeiro da página. */
  metas: Map<string, string>;
  /** Conteúdo cru do `<title>`, ainda sem decodificar. */
  titulo: string | null;
}

/**
 * Varre o HTML uma vez e devolve o que as prévias precisam.
 *
 * A busca é feita sobre uma cópia em minúsculas (as tags podem vir `<META`,
 * como a regex antiga, que era `i`, aceitava) mas os valores saem do original,
 * senão o título viria todo em caixa baixa.
 */
export function extrairTags(html: string): TagsDaPagina {
  const alvo = html.toLowerCase();
  return { metas: lerMetas(html, alvo), titulo: lerTitulo(html, alvo) };
}

function lerMetas(html: string, alvo: string): Map<string, string> {
  const metas = new Map<string, string>();
  let de = 0;
  for (;;) {
    const inicio = alvo.indexOf("<meta", de);
    if (inicio < 0) break;
    const fim = alvo.indexOf(">", inicio);
    // Sem `>` até o fim da página não há mais tag nenhuma para achar depois.
    if (fim < 0) break;
    de = fim + 1;
    // `<metadados ...>` não é `<meta ...>`; a regex antiga confundia os dois.
    if (/[a-z0-9]/.test(alvo[inicio + 5] ?? "")) continue;
    if (fim - inicio > MAX_TAG) continue;
    const tag = html.slice(inicio, fim + 1);
    const chave = CHAVE.exec(tag)?.[1]?.trim().toLowerCase();
    const conteudo = CONTEUDO.exec(tag)?.[1];
    // Fica a primeira ocorrência: é o que o `String.match` de antes devolvia.
    if (chave && conteudo !== undefined && !metas.has(chave)) metas.set(chave, conteudo);
  }
  return metas;
}

function lerTitulo(html: string, alvo: string): string | null {
  let de = 0;
  for (;;) {
    const inicio = alvo.indexOf("<title", de);
    if (inicio < 0) return null;
    const abre = alvo.indexOf(">", inicio);
    if (abre < 0) return null;
    de = abre + 1;
    if (/[a-z0-9]/.test(alvo[inicio + 6] ?? "")) continue;
    // O texto do título vai até o próximo `<`, que precisa ser o `</title>`.
    const menor = alvo.indexOf("<", abre + 1);
    if (menor < 0) return null;
    if (alvo.startsWith("</title", menor)) return html.slice(abre + 1, menor);
  }
}

/** As entidades que aparecem em título e descrição; o resto passa direto. */
export function decodificarEntidades(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
