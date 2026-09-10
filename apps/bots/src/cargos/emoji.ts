/**
 * O emoji, do jeito que este bot precisa dele — puro, sem rede.
 *
 * Um painel de cargos guarda `emoji → cargo`, e por isso a **chave** é a parte
 * mais importante do bot inteiro: se a chave que sai do texto que o
 * administrador digitou (`<:festa:1414…>`) não for **idêntica** à que sai do
 * evento `MESSAGE_REACTION_ADD`, o bot fica calado para sempre e ninguém
 * descobre por quê. Por isso as duas conversões moram no mesmo arquivo, e por
 * isso elas têm teste.
 *
 * O formato do evento é o do Discord (§7 do
 * `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`), e a diferença entre os dois casos
 * é o `id`:
 *
 * ```json
 * { "id": null,     "name": "👍",    "animated": false }  // unicode
 * { "id": "1414…",  "name": "festa", "animated": true  }  // personalizado
 * ```
 *
 * **No personalizado a identidade é o `id`, não o `name`.** Renomear o emoji do
 * servidor não pode desligar o painel — e é exatamente o que aconteceria se a
 * chave fosse o nome.
 */

/** A chave de um emoji num painel. `u:👍` ou `id:1414…`. */
export type ChaveDeEmoji = string;

/** Um emoji parcial, no formato dos eventos do Discord. */
export interface EmojiDoDiscord {
  id?: string | null;
  name?: string | null;
  animated?: boolean;
}

/** O emoji já entendido: como guardar, como reagir e como mostrar. */
export interface EmojiLido {
  chave: ChaveDeEmoji;
  /**
   * O que mandar para `message.react()` / para a rota de reação: o caractere no
   * unicode, `nome:snowflake` no personalizado (é o formato que a nossa casca
   * REST aceita, §12 F5).
   */
  paraReagir: string;
  /** Como escrever o emoji numa mensagem: `👍` ou `<:festa:1414…>`. */
  exibicao: string;
}

/**
 * `<:festa:1414…>`, `<a:festa:1414…>`, `:festa:1414…` ou `festa:1414…`.
 *
 * As quatro formas circulam: a primeira é o que o cliente cola no composer, a
 * segunda é a do animado, e as duas últimas são o que algumas libs mandam.
 * Aceitar todas é de graça e evita uma recusa gratuita.
 */
const PERSONALIZADO = /^<?a?:?([A-Za-z0-9_~]{2,32}):(\d{1,20})>?$/;

/**
 * "Isto parece um emoji unicode?"
 *
 * `Extended_Pictographic` cobre a esmagadora maioria. As duas exceções que
 * doem: o `⃣` (*combining enclosing keycap*), que é o que faz `1️⃣` ser um
 * emoji sem que nenhum dos seus caracteres seja pictográfico, e os
 * `Regional_Indicator`, que são as bandeiras (`🇧🇷` são duas letras
 * especiais, não um pictograma). Sem esta checagem, `/painel adicionar 123
 * qualquercoisa @cargo` viraria um item que nenhuma reação jamais casa.
 */
const PARECE_UNICODE = /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u;

/** A chave de um emoji vindo de um evento do gateway. */
export function chaveDoEmoji(emoji: EmojiDoDiscord): ChaveDeEmoji | null {
  if (emoji?.id) return `id:${emoji.id}`;
  const nome = emoji?.name;
  if (!nome) return null;
  return `u:${nome}`;
}

/** O evento do gateway → tudo que o painel precisa saber do emoji. */
export function lerEmojiDoEvento(emoji: EmojiDoDiscord): EmojiLido | null {
  const chave = chaveDoEmoji(emoji);
  if (!chave) return null;
  if (emoji.id) {
    const nome = emoji.name ?? "emoji";
    return {
      chave,
      paraReagir: `${nome}:${emoji.id}`,
      exibicao: `<${emoji.animated ? "a" : ""}:${nome}:${emoji.id}>`,
    };
  }
  return { chave, paraReagir: emoji.name!, exibicao: emoji.name! };
}

/**
 * O que o administrador digitou → o mesmo `EmojiLido`.
 *
 * Devolve `null` para texto que não é emoji (`banana`, `:festa:` sem id, uma
 * frase inteira). Recusar aqui é o ponto: um item de painel com um "emoji" que
 * não existe nunca receberia reação nenhuma, e o bot pareceria quebrado.
 */
export function lerEmojiDigitado(bruto: string): EmojiLido | null {
  const texto = bruto.trim();
  if (texto === "") return null;

  const personalizado = PERSONALIZADO.exec(texto);
  if (personalizado) {
    const [, nome, id] = personalizado;
    return {
      chave: `id:${id}`,
      paraReagir: `${nome}:${id}`,
      // O `a:` da entrada não é preservado: só o servidor sabe se o emoji é
      // animado, e escrever `<a:…>` num emoji estático mostra um quadrado.
      exibicao: `<:${nome}:${id}>`,
    };
  }

  // Um emoji unicode tem no máximo uns 8 code points (bandeira, família com
  // ZWJ). Mais que isso é frase, não emoji.
  if ([...texto].length > 12) return null;
  if (!PARECE_UNICODE.test(texto)) return null;
  return { chave: `u:${texto}`, paraReagir: texto, exibicao: texto };
}
