import { formatCustomEmoji, parseCustomEmoji } from "@streamz/shared";
import type { LinhaDeEmojiPersonalizado } from "../tipos";

/**
 * ── j-bots F5 ── O emoji, nos dois sentidos.
 *
 * O Streamz guarda a reação como **um texto só**: o caractere unicode (`👍`)
 * ou o token `<:nome:cuid>` de um emoji personalizado do servidor
 * (`parseCustomEmoji`, em `@streamz/shared`). O Discord fala de emoji com um
 * objeto de três campos, e as libs dependem dele:
 *
 * ```json
 * { "id": null, "name": "👍" }                          // unicode
 * { "id": "1414…", "name": "festa", "animated": false }  // personalizado
 * ```
 *
 * `emoji.id` é o que separa os dois: `null` diz à lib "isto é unicode, o
 * `name` é o caractere"; preenchido, diz "isto é um emoji de servidor, o
 * `name` é o rótulo e o `id` é a identidade". Um bot de *reaction roles*
 * compara **o id** quando é personalizado e **o name** quando é unicode — sair
 * com o token cru (`<:festa:cm1x…>`) no `name` faria os dois falharem.
 *
 * Na rota REST o mesmo emoji viaja de outro jeito, e a tradução de volta está
 * aqui também (`lerEmojiDaRota`): unicode vem **percent-encoded**
 * (`%F0%9F%91%8D`) e personalizado vem como **`nome:snowflake`** — sem os
 * `<>`, e com o snowflake, não com o nosso cuid.
 *
 * As duas funções são puras. Quem vai ao banco atrás do emoji personalizado é
 * o `ReacoesDeCompatService`.
 */

/** Um emoji no formato do Discord (a forma "parcial", que é a dos eventos). */
export interface EmojiDoDiscord {
  /** snowflake do emoji personalizado, ou `null` quando é unicode. */
  id: string | null;
  name: string;
  animated: boolean;
}

/** O que o `:emoji` de uma rota do Discord pode ser. */
export type EmojiDaRota =
  | { tipo: "unicode"; token: string }
  | { tipo: "personalizado"; nome: string; snowflake: string };

/**
 * `nome:snowflake`, com as variações que as libs mandam.
 *
 * O discord.js manda `nome:id`; alguns bots (e o discord.py, quando recebem um
 * `PartialEmoji` já formatado) mandam `<:nome:id>` ou `<a:nome:id>`. Aceitar
 * as três é de graça e evita um 10014 gratuito.
 */
const PERSONALIZADO_NA_ROTA = /^([A-Za-z0-9_~]{2,32}):(\d{1,20})$/;

/** Tira o `<…>` e o `a:` de "animado", quando vierem. */
function semEnfeite(texto: string): string {
  let t = texto;
  if (t.startsWith("<") && t.endsWith(">")) t = t.slice(1, -1);
  if (t.startsWith(":")) t = t.slice(1);
  if (t.startsWith("a:")) t = t.slice(2);
  return t;
}

/**
 * Token interno → o `emoji` do Discord.
 *
 * `personalizado` é a linha de `CustomEmoji` já resolvida (o
 * `ReacoesDeCompatService` a busca). Quando o token é `<:nome:cuid>` mas o
 * emoji **não existe mais** (foi apagado do servidor depois de alguém reagir),
 * sai o nome sem id: é o que o Discord faz com emoji apagado, e é melhor que
 * inventar um snowflake.
 */
export function emojiParaDiscord(
  token: string,
  personalizado: LinhaDeEmojiPersonalizado | null,
): EmojiDoDiscord {
  const custom = parseCustomEmoji(token);
  if (!custom) return { id: null, name: token, animated: false };
  if (!personalizado) return { id: null, name: custom.name, animated: false };
  return {
    id: String(personalizado.snowflake),
    name: personalizado.name,
    animated: personalizado.animated,
  };
}

/**
 * O `:emoji` de uma rota → o que procurar.
 *
 * O Express já decodifica `req.params`; decodificar de novo o que já está
 * decodificado é inofensivo, e **não** decodificar deixaria a reação gravada
 * com o `%` (era o que a F1 fazia, e o motivo de o `lerEmoji` existir).
 */
export function lerEmojiDaRota(cru: string): EmojiDaRota {
  let texto = cru;
  try {
    texto = decodeURIComponent(cru);
  } catch {
    // percent-encoding quebrado: fica o que veio, e vira unicode (que não acha
    // reação nenhuma) em vez de derrubar a rota com um `URIError`
  }
  const m = PERSONALIZADO_NA_ROTA.exec(semEnfeite(texto));
  if (m) return { tipo: "personalizado", nome: m[1], snowflake: m[2] };
  return { tipo: "unicode", token: texto };
}

/** O token interno de um emoji personalizado já resolvido. */
export function tokenDoPersonalizado(emoji: LinhaDeEmojiPersonalizado): string {
  return formatCustomEmoji(emoji.name, emoji.id);
}
