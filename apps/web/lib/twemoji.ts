/**
 * Twemoji: o desenho de emoji do Discord (ADR-0009, onda 0.6).
 *
 * ## Pacote: `@discordapp/twemoji@16.0.1`, SVG por emoji, servido de `/twemoji/`
 *
 * Os arquivos são copiados do `node_modules` para `apps/web/public/twemoji/`
 * por `apps/web/scripts/copiar-twemoji.mjs`. Nada vem de CDN: o desktop (Tauri) e o
 * Android empacotam o export estático e rodam offline, e as duas CSPs só deixam
 * imagem de `'self'` sem lista de CDN.
 *
 * Por que este pacote e este formato — pesos do registro do npm (listagem de
 * arquivos do jsDelivr, 2026-09-11):
 *
 * | pacote                              | o que vai para o `public/`      | arquivos | bytes      |
 * |-------------------------------------|---------------------------------|---------:|-----------:|
 * | `@discordapp/twemoji@16.0.1`        | `dist/svg/*.svg`                |    3.846 |  9.163.925 |
 * | `@twemoji/svg@15.0.0`               | `*.svg`                         |    3.723 |  8.149.432 |
 * | `emoji-datasource-twitter@16.0.0`   | `img/twitter/64/*.png`          |    3.786 | 10.409.368 |
 * | `emoji-datasource-twitter@16.0.0`   | `sheets/64.png` + `emoji.json`  |        2 | 11.283.284 + 1.313.457 |
 *
 * - **`@discordapp/twemoji`** é o fork que o próprio Discord publica
 *   (github.com/discord/twemoji), derivado do `jdecked/twemoji`: é o desenho
 *   que o cliente dele mostra, e cobre o Emoji 16.0. Licença do pacote:
 *   `MIT AND CC-BY-4.0`: código MIT, gráficos CC-BY 4.0, que exige atribuição
 *   visível. O script grava `public/twemoji/CREDITOS.txt` junto dos arquivos;
 *   a linha na interface é da tela de créditos, que ainda não existe.
 * - `@twemoji/svg` (jdecked) parou no 15.0.0 no npm: das 3.773 formas do
 *   catálogo do seletor (`emoji-picker-react/dist/data/emojis.json`, com tons),
 *   133 não têm arquivo ali (`🙂‍↔️`, `🚶‍➡️`…). O `@twemoji/api@17` é só o JS
 *   (197.789 bytes, 11 arquivos): os gráficos dele moram na CDN.
 * - **SVG e não PNG**: o mesmo arquivo serve o emoji de 22 px no texto, o de
 *   40 px da grade do seletor e o jumbo de 48 px, nítido em tela 2x/3x. O PNG
 *   de 64 px fica borrado no jumbo em 2x (precisaria de 96 px) e ainda pesa mais.
 * - **Arquivo por emoji e não sprite**: a folha de 64 px é um PNG só de
 *   11.283.284 bytes que o navegador decodifica inteiro em memória para mostrar
 *   um 👍, e exige o `emoji.json` de posições; as folhas de 128/256 cores, mais
 *   leves (2.544.679 / 3.008.248 bytes), perdem cor. Arquivo por emoji só lê
 *   (do disco, no desktop) o que aparece na tela.
 *
 * Tamanho comprimido no instalador: não medido.
 *
 * Cobertura conferida contra a lista do pacote: com `arquivoTwemoji` e a
 * segunda tentativa de `arquivosTwemoji`, as 3.773 formas do catálogo do
 * seletor têm arquivo (a única que precisa da segunda é `👁️‍🗨️`).
 */

/** Pasta pública onde o script de cópia deixa os SVG. */
export const PASTA_TWEMOJI = "/twemoji";

const ZWJ = "\u200D";
const VS16 = /\uFE0F/g;

/** Codepoints em hexadecimal minúsculo, sem zero à esquerda, separados por "-". */
function paraCodepoints(texto: string): string {
  // `Array.from` anda por codepoint (junta os pares substitutos), que é o que o
  // `toCodePoint` do twemoji faz à mão; e `toString(16)` não completa com zero:
  // o arquivo do © é `a9.svg`, não `00a9.svg` — o `u` do catálogo do seletor
  // vem com zero à esquerda e por isso não serve de nome de arquivo
  return Array.from(texto, (c) => c.codePointAt(0)!.toString(16)).join("-");
}

/**
 * Nome do arquivo do Twemoji (sem extensão) para um emoji.
 *
 * É a regra do `grabTheRightIcon` do twemoji (`dist/twemoji.npm.js` do pacote):
 * o seletor de variação U+FE0F sai **só quando a sequência não tem ZWJ**
 * (U+200D). Emoji simples é gravado sem ele (❤️ = `2764.svg`, #️⃣ = `23-20e3.svg`),
 * mas as sequências ZWJ foram desenhadas com o FE0F no nome
 * (🏳️‍🌈 = `1f3f3-fe0f-200d-1f308.svg`) — tirar sempre, ou nunca, erra metade.
 */
export function arquivoTwemoji(emoji: string): string {
  return paraCodepoints(emoji.includes(ZWJ) ? emoji : emoji.replace(VS16, ""));
}

/**
 * Nomes a tentar, em ordem: o da regra do twemoji e, se for diferente, o mesmo
 * sem nenhum FE0F.
 *
 * A segunda tentativa existe porque a regra erra num caso que o pacote tem:
 * 👁️‍🗨️ totalmente qualificado (`1f441-fe0f-200d-1f5e8-fe0f`) está gravado sem
 * os FE0F (`1f441-200d-1f5e8.svg`). O mesmo resgata sequência ZWJ digitada por
 * teclado que põe FE0F onde o Unicode não põe. Custa um 404 a mais só nesses.
 */
export function arquivosTwemoji(emoji: string): string[] {
  const principal = arquivoTwemoji(emoji);
  const semVariacao = paraCodepoints(emoji.replace(VS16, ""));
  return semVariacao === principal ? [principal] : [principal, semVariacao];
}

/** URL servida do arquivo do Twemoji (o primeiro de `arquivosTwemoji`). */
export function urlTwemoji(arquivo: string): string {
  return `${PASTA_TWEMOJI}/${arquivo}.svg`;
}

/**
 * Um emoji Unicode inteiro, com o que o compõe:
 *
 * 1. **bandeira**: par de indicadores regionais (🇧🇷). Um indicador sozinho
 *    também tem desenho no Twemoji (`1f1e7.svg`) — `{1,2}` guloso junta os pares
 *    da esquerda para a direita, como o twemoji;
 * 2. **tecla**: `#`, `*` ou dígito, FE0F opcional, U+20E3 (#️⃣);
 * 3. **©, ®, ™ e ♟ só com FE0F**: sem ele são texto comum, e é assim que o
 *    twemoji os trata (`(?:[©®\u2122\u265f]\ufe0f)` na expressão dele) — senão
 *    todo "©" de rodapé colado virava imagem;
 * 4. **pictograma**: `\p{Extended_Pictographic}` que também seja `\p{Emoji}`
 *    (o primeiro sozinho inclui ★ U+2605 e faixas reservadas, que não têm
 *    desenho), seguido de tom de pele ou FE0F, das tags de subdivisão
 *    (🏴󠁧󠁢󠁥󠁮󠁧󠁿) e de quantos `ZWJ + pictograma` vierem (👩🏽‍💻, 🧑‍🧑‍🧒).
 *    Seguido de U+FE0E (pedido explícito de apresentação de texto), não é emoji;
 * 5. **tom de pele sozinho** (🏻), que o Twemoji também desenha.
 *
 * Os grupos são todos não capturantes: `separarEmojis` usa só o casamento
 * inteiro.
 */
const EMOJI_RE =
  /[\u{1F1E6}-\u{1F1FF}]{1,2}|[#*0-9]\uFE0F?\u20E3|[\u00A9\u00AE\u2122\u265F]\uFE0F|(?![\u00A9\u00AE\u2122\u265F])(?=\p{Emoji})\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F)?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D(?=\p{Emoji})\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F)?)*(?!\uFE0E)|\p{Emoji_Modifier}/gu;

export type ParteDeTexto =
  | { tipo: "texto"; valor: string }
  | { tipo: "emoji"; valor: string };

/**
 * Parte o texto em trechos de texto e emoji, na ordem. Concatenar os `valor`
 * devolve o texto original — nada é descartado, nem o FE0F.
 */
export function separarEmojis(texto: string): ParteDeTexto[] {
  const partes: ParteDeTexto[] = [];
  let desde = 0;
  // `matchAll` trabalha numa cópia da expressão: o `lastIndex` da global
  // compartilhada não vaza entre chamadas (nem entre renders concorrentes)
  for (const m of texto.matchAll(EMOJI_RE)) {
    const inicio = m.index ?? 0;
    if (inicio > desde) partes.push({ tipo: "texto", valor: texto.slice(desde, inicio) });
    partes.push({ tipo: "emoji", valor: m[0] });
    desde = inicio + m[0].length;
  }
  if (desde < texto.length) partes.push({ tipo: "texto", valor: texto.slice(desde) });
  return partes;
}

/** true quando o texto tem ao menos um emoji Unicode. */
export function temEmoji(texto: string): boolean {
  // `search` ignora o `lastIndex` e o `g`, então a expressão global serve
  return texto.search(EMOJI_RE) >= 0;
}
