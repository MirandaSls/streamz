// ── j-bots ── A mensagem efêmera: `flags: 64`.
//
// Este arquivo é a parte **pura** da efemeridade — as formas e as duas
// conversões. Quem lê e escreve o banco é o `InteractionsService`; aqui não há
// Prisma, nem Nest, nem socket, e por isso o comportamento inteiro cabe num
// teste unitário.
//
// Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9 e o `CONTRATO-F3.md`.

import { FLAGS_DE_MENSAGEM, temFlag, type Message as MessageDTO, type PublicUser } from "@streamz/shared";
import type { LinhaDeMensagem } from "../discord-compat/tipos";
import type { LinhaDeMensagemDeBot } from "../discord-compat/traducao/mensagem";
import { camposDeBotDoDTO } from "../messages/payload-de-bot";

/**
 * Uma linha de `EphemeralMessage` com o que as duas conversões precisam.
 *
 * É de propósito um retrato pequeno: a linha guarda texto que **uma pessoa só**
 * podia ver, e quanto menos gente a carregar, menos lugares há de onde ela pode
 * escapar.
 */
export interface LinhaEfemera {
  id: string;
  snowflake: bigint;
  channelId: string;
  /** cuid de quem pode ver — o invocador do comando. */
  ephemeralFor: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  // ── onda 3 ── embeds, componentes e flags (colunas da própria efêmera). `Json`
  // cru do Prisma: quem lê passa por `lerEmbedsGuardados`/`lerComponentesGuardados`.
  embeds: unknown;
  components: unknown;
  /**
   * `FLAGS_GUARDADAS` **mais** `SUPPRESS_EMBEDS`: a efêmera não tem a coluna
   * `suppressEmbeds` da `Message`, então o bit mora aqui. `EPHEMERAL` nunca —
   * é implícito na tabela.
   */
  flags: number;
}

/** O contexto que a efêmera não guarda (porque a interação já guarda). */
export interface ContextoDaEfemera {
  /** o usuário-bot que respondeu. */
  bot: PublicUser;
  /** quem digitou o comando — o dono da faixa "usou /play". */
  invocador: PublicUser;
  /** cuid da interação e o nome do comando: a faixa. */
  interacaoId: string;
  /** ── onda 3 ── null quando a interação é de componente/modal: sem faixa. */
  comando: string | null;
  /** cuid do servidor, ou null em conversa direta. */
  guildId: string | null;
}

/**
 * A efêmera no formato `Message` de `@streamz/shared` — o que vai no socket.
 *
 * **É a mesma forma da mensagem comum, e isso é escolha.** O cliente já sabe
 * desenhar um `Message`: agrupamento, markdown, a faixa "usou /play", a hora.
 * Inventar um segundo formato só para a efêmera dobraria a tela. O que a
 * distingue é um campo, `efemera: true`, que o `MessageItem` lê para pôr o
 * rodapé "Somente você pode ver isso · Dispensar mensagem" e o
 * `onMessageArrived` lê para **não** contá-la como não lida.
 *
 * Os campos que só uma mensagem de verdade tem saem no valor neutro: uma
 * efêmera não tem reação, anexo, figurinha, enquete, thread nem fixação —
 * nenhuma dessas coisas teria onde ser gravada, e mostrar o botão seria mentir.
 */
export function efemeraParaDTO(linha: LinhaEfemera, ctx: ContextoDaEfemera): MessageDTO {
  return {
    id: linha.id,
    channelId: linha.channelId,
    guildId: ctx.guildId,
    content: linha.content,
    parentId: null,
    replyCount: 0,
    createdAt: linha.createdAt.toISOString(),
    editedAt: linha.editedAt ? linha.editedAt.toISOString() : null,
    author: ctx.bot,
    type: "DEFAULT",
    reactions: [],
    attachments: [],
    sticker: null,
    suppressEmbeds: false,
    replyTo: null,
    replyMention: false,
    pinned: false,
    thread: null,
    poll: null,
    // a faixa "@fulano usou /play": uma efêmera chega ao chat sozinha, como
    // qualquer resposta de comando, e sem ela o bot pareceria falar sozinho
    interacao:
      ctx.comando === null ? null : { id: ctx.interacaoId, name: ctx.comando, user: ctx.invocador },
    efemera: true,
    // ── onda 3 ── embeds/componentes/flags, com `EPHEMERAL` ligado. Sem anexos
    // para resolver: a efêmera não tem anexo.
    ...camposDeBotDoDTO(
      {
        suppressEmbeds: temFlag(linha.flags, FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS),
        payload: { embeds: linha.embeds, components: linha.components, flags: linha.flags & ~FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS },
        efemera: true,
      },
      [],
    ),
  };
}

/**
 * A efêmera no formato que a tradução do Discord consome — o corpo que o
 * `editReply()` e o `followUp()` recebem de volta.
 *
 * A lib do bot espera um objeto `message` com snowflake; a efêmera tem o dela
 * (a coluna `snowflake`, do mesmo gerador das outras), então o `@original` que
 * o bot guardar continua sendo um número que ele sabe manipular.
 */
export function efemeraParaLinhaDeMensagem(
  linha: LinhaEfemera,
  ctx: {
    autor: LinhaDeMensagem["author"];
    channelSnowflake: bigint;
    guildSnowflake: bigint | null;
  },
): LinhaDeMensagemDeBot {
  // os campos de bot saem pelo mesmo conversor do DTO, sem o `EPHEMERAL`: quem
  // devolve ao bot (`webhooks.controller.ts`) liga a flag por cima
  const deBot = camposDeBotDoDTO(
    {
      suppressEmbeds: temFlag(linha.flags, FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS),
      payload: { embeds: linha.embeds, components: linha.components, flags: linha.flags & ~FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS },
    },
    [],
  );
  const base: LinhaDeMensagem = {
    id: linha.id,
    snowflake: linha.snowflake,
    channelSnowflake: ctx.channelSnowflake,
    guildSnowflake: ctx.guildSnowflake,
    author: ctx.autor,
    content: linha.content,
    createdAt: linha.createdAt,
    editedAt: linha.editedAt,
    type: "DEFAULT",
    attachments: [],
    reactions: [],
    respostaA: null,
    pinned: false,
  };
  return { ...base, payloadDeBot: deBot };
}
