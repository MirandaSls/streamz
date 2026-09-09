import { Injectable } from "@nestjs/common";
import { ehSnowflake, parseCustomEmoji } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { LinhaDeEmojiPersonalizado, LinhaDeUsuario } from "./tipos";
import {
  emojiParaDiscord,
  tokenDoPersonalizado,
  type EmojiDaRota,
  type EmojiDoDiscord,
} from "./traducao/emoji";

/**
 * ── j-bots F5 ── As idas ao banco que a reação precisa, e só elas.
 *
 * É o par impuro de `traducao/emoji.ts`: a tradução é aritmética de texto, e o
 * que ela não sabe fazer é (a) achar a linha de `CustomEmoji` por snowflake ou
 * por cuid e (b) listar quem reagiu com um emoji. As duas coisas moram aqui,
 * num service novo em vez de dentro do `DadosDeCompatService`, para não
 * disputar arquivo com quem está na mesma pasta (§2.4 do processo).
 *
 * Somente leitura, como todo o resto da casca: quem escreve reação continua
 * sendo o `MessagesService` (permissão, castigo, bloqueio de DM e
 * `ADD_REACTIONS` são de lá).
 */

/** O mesmo `select` de usuário do `DadosDeCompatService`. */
const SELECAO_DE_USUARIO = {
  id: true,
  snowflake: true,
  username: true,
  displayName: true,
  isBot: true,
} as const;

const SELECAO_DE_EMOJI = {
  id: true,
  snowflake: true,
  name: true,
  animated: true,
} as const;

/** `limit` do `GET .../reactions/:emoji`: o mesmo intervalo do Discord. */
const LIMITE_PADRAO = 25;
const LIMITE_MAXIMO = 100;

@Injectable()
export class ReacoesDeCompatService {
  constructor(private readonly prisma: PrismaService) {}

  /** O emoji personalizado pelo número que o bot conhece. */
  async emojiPorSnowflake(snowflake: string): Promise<LinhaDeEmojiPersonalizado | null> {
    if (!ehSnowflake(snowflake)) return null;
    return this.prisma.customEmoji.findUnique({
      where: { snowflake: BigInt(snowflake) },
      select: SELECAO_DE_EMOJI,
    });
  }

  /** O emoji personalizado pelo cuid que vive dentro do token `<:nome:cuid>`. */
  async emojiPorCuid(id: string): Promise<LinhaDeEmojiPersonalizado | null> {
    return this.prisma.customEmoji.findUnique({ where: { id }, select: SELECAO_DE_EMOJI });
  }

  /**
   * O `:emoji` de uma rota → o **token interno** com que a reação é gravada.
   *
   * `null` quer dizer "esse emoji personalizado não existe aqui" — e o
   * chamador devolve 10014 (`Unknown Emoji`), que é o que o Discord faz.
   * Unicode nunca dá `null`: qualquer texto é um emoji válido para nós (o
   * `MessagesService` é quem limita o tamanho).
   */
  async tokenDaRota(rota: EmojiDaRota): Promise<string | null> {
    if (rota.tipo === "unicode") return rota.token;
    const emoji = await this.emojiPorSnowflake(rota.snowflake);
    // o **nome** vem da linha, não da rota: o Discord ignora o nome que o bot
    // mandou (só o id identifica), e o nosso token guarda o nome de verdade
    return emoji ? tokenDoPersonalizado(emoji) : null;
  }

  /** Token interno → o `emoji` do Discord, com o snowflake quando é nosso. */
  async traduzirToken(token: string): Promise<EmojiDoDiscord> {
    const custom = parseCustomEmoji(token);
    if (!custom) return emojiParaDiscord(token, null);
    return emojiParaDiscord(token, await this.emojiPorCuid(custom.id));
  }

  /**
   * Quem reagiu com um emoji, no formato de `GET .../reactions/:emoji`.
   *
   * A ordenação é pelo **snowflake do usuário** — não pela ordem em que
   * reagiram — porque é o cursor que o Discord usa (`after`), e `Reaction` não
   * tem número próprio nem `createdAt`.
   */
  async quemReagiu(
    messageId: string,
    token: string,
    opcoes: { limit?: number; after?: string } = {},
  ): Promise<LinhaDeUsuario[]> {
    const limite = Math.min(
      LIMITE_MAXIMO,
      Math.max(1, Math.trunc(opcoes.limit ?? LIMITE_PADRAO)),
    );
    const depois =
      opcoes.after !== undefined && ehSnowflake(opcoes.after) ? BigInt(opcoes.after) : null;

    const linhas = await this.prisma.reaction.findMany({
      where: {
        messageId,
        emoji: token,
        ...(depois === null ? {} : { user: { snowflake: { gt: depois } } }),
      },
      select: { user: { select: SELECAO_DE_USUARIO } },
      orderBy: { user: { snowflake: "asc" } },
      take: limite,
    });
    return linhas.map((l) => l.user);
  }
}
