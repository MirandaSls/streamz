import { mentionsEveryone } from "@streamz/shared";

import type {
  JsonDoDiscord,
  LinhaDeAnexo,
  LinhaDeMensagem,
  LinhaDeReacao,
  MensagemDoDiscord,
} from "../tipos";
import { usuarioParaDiscord } from "./usuario";

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
 * - `embeds: []` e `components: []` — a F1 não tem embed rico.
 * - `mention_everyone` sai de `mentionsEveryone(content)` (`@streamz/shared`);
 *   `mentions`/`mention_roles` podem sair vazios na F1 (o bot lê o `content`).
 * - `message_reference` quando é resposta: `{message_id, channel_id, guild_id}`.
 *
 * `flags: 0` e `tts: false` fixos.
 */
export function mensagemParaDiscord(m: LinhaDeMensagem): MensagemDoDiscord {
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
    embeds: [],
    components: [],
    pinned: m.pinned,
    // Todo tipo nosso vira 0 (`DEFAULT`): as `SYSTEM_*` já chegam com o texto
    // achatado em `content`, e um número que a lib não conhece faz
    // `MessageType[x]` virar `undefined` em algumas.
    type: 0,
    flags: 0,
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
 * `emoji.id` é sempre null (emoji unicode). Emoji personalizado nosso é um
 * nome, não um snowflake de emoji do Discord — a tradução dele é F5, junto com
 * `MESSAGE_REACTION_ADD`.
 */
function reacaoParaDiscord(r: LinhaDeReacao): JsonDoDiscord {
  return {
    count: r.count,
    me: r.euReagi,
    emoji: { id: null, name: r.emoji },
  };
}
