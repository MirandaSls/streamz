import type { ChannelType } from "@streamz/shared";

import type { CanalDoDiscord, LinhaDeCanal, LinhaDeCategoria } from "../tipos";
import { usuarioParaDiscord } from "./usuario";

/**
 * `Channel` e `Category` → objeto `channel` do Discord.
 *
 * ── Lote C (tradução) implementa. Puro. ──
 *
 * A tabela de tipos é a do §5:
 *
 * | Nosso            | Discord                 |
 * |------------------|-------------------------|
 * | `TEXT`           | 0 `GUILD_TEXT`          |
 * | `DM`             | 1 `DM`                  |
 * | `VOICE`          | 2 `GUILD_VOICE`         |
 * | `GROUP`          | 3 `GROUP_DM`            |
 * | `Category` (tab.)| 4 `GUILD_CATEGORY`      |
 * | `ANNOUNCEMENT`   | 5 `GUILD_ANNOUNCEMENT`  |
 *
 * **Categoria no Discord é canal.** É por isso que há duas funções e uma só
 * rota (`GET /channels/:id` resolve as duas tabelas).
 */

/**
 * A tabela, escrita como `Record` fechado: acrescentar um `ChannelType` novo em
 * `@streamz/shared` sem decidir o número do Discord vira erro de compilação, e
 * não um canal que o bot recebe com `type: undefined`.
 */
const TIPO_NO_DISCORD: Record<ChannelType, number> = {
  TEXT: 0,
  DM: 1,
  VOICE: 2,
  GROUP: 3,
  ANNOUNCEMENT: 5,
};

/** O padrão do Discord, em bits por segundo. Ver `canalParaDiscord`. */
const BITRATE_PADRAO = 64_000;

/** `GUILD_CATEGORY`. A categoria é tabela nossa e canal no Discord. */
export const TIPO_DE_CATEGORIA_NO_DISCORD = 4;

/** O número do tipo, isolado para o teste de tabela. */
export function tipoDeCanalParaDiscord(tipo: LinhaDeCanal["type"]): number {
  return TIPO_NO_DISCORD[tipo];
}

export function canalParaDiscord(c: LinhaDeCanal): CanalDoDiscord {
  // DM e grupo não têm servidor, categoria, tópico nem posição; o que a lib
  // procura lá é `recipients` (o `DMChannel` do discord.js lê
  // `data.recipients[0].id` para saber com quem a conversa é).
  if (c.type === "DM" || c.type === "GROUP") {
    const conversa: CanalDoDiscord = {
      id: String(c.snowflake),
      type: tipoDeCanalParaDiscord(c.type),
      recipients: c.destinatarios.map(usuarioParaDiscord),
    };
    if (c.type === "GROUP") conversa.name = c.name;
    return conversa;
  }

  const canal: CanalDoDiscord = {
    id: String(c.snowflake),
    type: tipoDeCanalParaDiscord(c.type),
    name: c.name,
    position: c.position,
    parent_id: c.categoriaSnowflake === null ? null : String(c.categoriaSnowflake),
    topic: c.topic,
    nsfw: c.nsfw,
    rate_limit_per_user: c.slowmodeSeconds,
    // A F1 não traduz as regras de canal: o bot vê a permissão do servidor. É
    // uma simplificação declarada — lista vazia é "sem regra própria", que é o
    // que a maioria dos canais de fato tem.
    permission_overwrites: [],
  };
  if (c.guildSnowflake !== null) canal.guild_id = String(c.guildSnowflake);

  // Canal de voz: `bitrate` e `user_limit` são **obrigatórios** no discord.py
  // (`VocalGuildChannel._update` os lê sem `.get`), e sem eles o `GUILD_CREATE`
  // inteiro levanta `KeyError` lá dentro — o bot conecta, não dá erro, e o
  // `ready` nunca dispara. É o risco (a) do §12 acontecendo de verdade: a prova
  // 4 da F1 falhou exatamente aqui.
  //
  // Os valores são fixos porque o Streamz não tem taxa nem lotação por canal: a
  // qualidade quem decide é o LiveKit, e não há limite de gente. 64 kbps e 0
  // ("sem limite") são os padrões do Discord, que é a tradução honesta de
  // "não configurável".
  if (c.type === "VOICE") {
    canal.bitrate = BITRATE_PADRAO;
    canal.user_limit = 0;
    canal.rtc_region = null;
  }

  return canal;
}

/** Categoria → canal tipo 4. `parent_id` de um canal aponta para o id daqui. */
export function categoriaParaDiscord(c: LinhaDeCategoria): CanalDoDiscord {
  return {
    id: String(c.snowflake),
    type: TIPO_DE_CATEGORIA_NO_DISCORD,
    guild_id: String(c.guildSnowflake),
    name: c.name,
    position: c.position,
    // categoria não tem pai — no Discord tampouco: só um nível.
    parent_id: null,
    nsfw: false,
    permission_overwrites: [],
  };
}
