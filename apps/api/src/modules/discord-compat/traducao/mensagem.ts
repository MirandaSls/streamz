import { mentionsEveryone, type ComponenteDeMensagem, type Embed } from "@streamz/shared";

import type {
  JsonDoDiscord,
  LinhaDeAnexo,
  LinhaDeMensagem,
  LinhaDeReacao,
  MensagemDoDiscord,
} from "../tipos";
import { emojiParaDiscord } from "./emoji";
import { usuarioParaDiscord } from "./usuario";

/**
 * ── onda 3 ── Embeds, componentes e flags de uma mensagem de bot, como a
 * tradução os consome.
 *
 * Não está em `LinhaDeMensagem` (`tipos.ts` é do coordenador): quem monta a
 * linha acrescenta este campo por conta própria — o `MessagesService.
 * payloadsDeBot` no histórico, o DTO da mensagem nos controllers, a efêmera em
 * `interactions/efemeras.ts`. Ausente (ou null) = mensagem sem nada disso, e a
 * saída é a de sempre: `embeds: []`, `components: []`, `flags: 0`.
 */
export interface PayloadDeBotDaLinha {
  embeds: readonly Embed[];
  components: readonly ComponenteDeMensagem[];
  /** `FLAGS_DE_MENSAGEM`, já com `SUPPRESS_EMBEDS` e `EPHEMERAL` quando for o caso. */
  flags: number;
}

/** A linha da mensagem, com o payload de bot quando houver. */
export type LinhaDeMensagemDeBot = LinhaDeMensagem & { payloadDeBot?: PayloadDeBotDaLinha | null };

/**
 * `Message` → objeto `message` do Discord.
 *
 * ── Lote C (tradução) implementa. Puro. ──
 *
 * O que o §5 manda:
 * - `type` é **0 para tudo**: `DEFAULT` e todas as `SYSTEM_*`. Mandar um número
 *   que a lib não conhece faz `MessageType[x]` virar `undefined` em algumas, e
 *   nenhuma delas sabe renderizar os nossos tipos de sistema. O texto do
 *   sistema já vai achatado em `content`.
 * - `timestamp`/`edited_timestamp` em ISO-8601.
 * - `embeds` e `components` — os do bot, guardados no formato do Discord desde a
 *   onda 3 (`payloadDeBot`); listas vazias para mensagem de gente.
 * - `mention_everyone` sai de `mentionsEveryone(content)` (`@streamz/shared`);
 *   `mentions`/`mention_roles` podem sair vazios na F1 (o bot lê o `content`).
 * - `message_reference` quando é resposta: `{message_id, channel_id, guild_id}`.
 *
 * `tts: false` fixo; `flags` sai do `payloadDeBot` (0 sem ele).
 */
export function mensagemParaDiscord(m: LinhaDeMensagemDeBot): MensagemDoDiscord {
  const mensagem: MensagemDoDiscord = {
    id: String(m.snowflake),
    channel_id: String(m.channelSnowflake),
    author: usuarioParaDiscord(m.author),
    content: m.content,
    timestamp: m.createdAt.toISOString(),
    edited_timestamp: m.editedAt === null ? null : m.editedAt.toISOString(),
    tts: false,
    mention_everyone: mentionsEveryone(m.content),
    // A F1 não resolve as menções: elas ficam no `content` (`@fulano` em texto
    // puro, não `<@id>`), e o bot de prefixo lê o texto. Listas vazias são a
    // resposta honesta — um bot que dependa de `mentions` não funciona ainda.
    mentions: [],
    mention_roles: [],
    attachments: m.attachments.map(anexoParaDiscord),
    // cópias rasas: o objeto do Discord é JSON puro, e a lista guardada não pode
    // ser mutada por quem recebe a tradução
    embeds: (m.payloadDeBot?.embeds ?? []).map((e) => ({ ...e })),
    components: (m.payloadDeBot?.components ?? []).map((c) => ({ ...c })),
    pinned: m.pinned,
    // Todo tipo nosso vira 0 (`DEFAULT`): as `SYSTEM_*` já chegam com o texto
    // achatado em `content`, e um número que a lib não conhece faz
    // `MessageType[x]` virar `undefined` em algumas.
    type: 0,
    flags: m.payloadDeBot?.flags ?? 0,
  };

  if (m.guildSnowflake !== null) mensagem.guild_id = String(m.guildSnowflake);
  if (m.reactions.length > 0) mensagem.reactions = m.reactions.map(reacaoParaDiscord);

  if (m.respostaA !== null) {
    const referencia: JsonDoDiscord = {
      message_id: String(m.respostaA.snowflake),
      channel_id: String(m.respostaA.channelSnowflake),
    };
    if (m.guildSnowflake !== null) referencia.guild_id = String(m.guildSnowflake);
    mensagem.message_reference = referencia;
    // `referenced_message` fica de fora: a linha só traz os snowflakes da
    // original, e o bot busca por `channel.messages.fetch` se precisar.
  }

  return mensagem;
}

/** `Attachment` → anexo do Discord. */
function anexoParaDiscord(a: LinhaDeAnexo): JsonDoDiscord {
  return {
    id: String(a.snowflake),
    filename: a.filename,
    size: a.size,
    url: a.url,
    // O discord.py faz `data['proxy_url']` (sem `.get`) — sem este campo a
    // mensagem com anexo levanta `KeyError` lá dentro. Não temos proxy: é a
    // mesma URL.
    proxy_url: a.url,
    content_type: a.contentType,
    width: a.width,
    height: a.height,
  };
}

/**
 * `Reaction` → reação do Discord.
 *
 * O `emoji` sai pela tradução única de `traducao/emoji.ts`: unicode com
 * `id: null`, personalizado com o **snowflake** e o `animated` da linha de
 * `CustomEmoji`. Antes da F5 saía sempre `{id: null, name: <token cru>}`, o
 * que punha `<:festa:cm1x…>` no nome de todo emoji de servidor.
 */
function reacaoParaDiscord(r: LinhaDeReacao): JsonDoDiscord {
  return {
    count: r.count,
    me: r.euReagi,
    emoji: emojiParaDiscord(r.emoji, r.personalizado),
  };
}
