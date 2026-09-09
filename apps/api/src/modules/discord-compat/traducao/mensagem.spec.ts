import type { MessageType } from "@streamz/shared";
import { describe, expect, it } from "vitest";

import type { LinhaDeMensagem } from "../tipos";
import { mensagemParaDiscord } from "./mensagem";

/** Todos os tipos que o enum do banco tem hoje. */
const TIPOS: MessageType[] = [
  "DEFAULT",
  "SYSTEM_PIN",
  "SYSTEM_JOIN",
  "SYSTEM_MEMBER_ADDED",
  "SYSTEM_MEMBER_REMOVED",
  "SYSTEM_MEMBER_LEFT",
  "SYSTEM_GROUP_RENAMED",
  "SYSTEM_GROUP_ICON",
  "SYSTEM_MOD_NOTICE",
];

function mensagem(campos: Partial<LinhaDeMensagem> = {}): LinhaDeMensagem {
  return {
    id: "clx_msg",
    snowflake: 1234567890123456789n,
    channelSnowflake: 222333444555666777n,
    guildSnowflake: 111222333444555666n,
    author: {
      id: "clx_user",
      snowflake: 555444333222111000n,
      username: "mdz",
      displayName: "MDZ",
      isBot: false,
    },
    content: "!play never gonna give you up",
    createdAt: new Date("2026-09-08T13:45:12.345Z"),
    editedAt: null,
    type: "DEFAULT",
    attachments: [],
    reactions: [],
    respostaA: null,
    pinned: false,
    ...campos,
  };
}

describe("mensagemParaDiscord", () => {
  it("monta a mensagem no formato do Discord", () => {
    const m = mensagemParaDiscord(mensagem());
    expect(m).toMatchObject({
      id: "1234567890123456789",
      channel_id: "222333444555666777",
      guild_id: "111222333444555666",
      content: "!play never gonna give you up",
      timestamp: "2026-09-08T13:45:12.345Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: 0,
      flags: 0,
    });
    expect(m.author.id).toBe("555444333222111000");
    // `components` não está em `tipos.ts` (arquivo do coordenador) mas o §5 pede
    expect((m as unknown as { components: unknown[] }).components).toEqual([]);
  });

  it("toda SYSTEM_* também vira type 0", () => {
    for (const tipo of TIPOS) {
      expect(mensagemParaDiscord(mensagem({ type: tipo })).type, tipo).toBe(0);
    }
  });

  it("timestamps em ISO-8601", () => {
    const m = mensagemParaDiscord(
      mensagem({ editedAt: new Date("2026-09-08T14:00:00.000Z") }),
    );
    expect(m.timestamp).toBe("2026-09-08T13:45:12.345Z");
    expect(m.edited_timestamp).toBe("2026-09-08T14:00:00.000Z");
  });

  it("mention_everyone sai do texto", () => {
    expect(mensagemParaDiscord(mensagem({ content: "oi @everyone" })).mention_everyone).toBe(true);
    expect(mensagemParaDiscord(mensagem({ content: "vem @here" })).mention_everyone).toBe(true);
    // a menção escapada não conta — é a regra de `mentionsEveryone`
    expect(mensagemParaDiscord(mensagem({ content: "\\@everyone" })).mention_everyone).toBe(false);
    expect(mensagemParaDiscord(mensagem({ content: "email@everyone.com" })).mention_everyone).toBe(
      false,
    );
  });

  it("resposta produz message_reference", () => {
    const m = mensagemParaDiscord(
      mensagem({
        respostaA: { snowflake: 999000111222333444n, channelSnowflake: 222333444555666777n },
      }),
    );
    expect(m.message_reference).toEqual({
      message_id: "999000111222333444",
      channel_id: "222333444555666777",
      guild_id: "111222333444555666",
    });
  });

  it("resposta em DM não inventa guild_id", () => {
    const m = mensagemParaDiscord(
      mensagem({
        guildSnowflake: null,
        respostaA: { snowflake: 999000111222333444n, channelSnowflake: 222333444555666777n },
      }),
    );
    expect(m.guild_id).toBeUndefined();
    expect(m.message_reference).toEqual({
      message_id: "999000111222333444",
      channel_id: "222333444555666777",
    });
  });

  it("mensagem sem resposta não tem message_reference", () => {
    expect("message_reference" in mensagemParaDiscord(mensagem())).toBe(false);
  });

  it("anexo leva proxy_url (o discord.py lê sem .get)", () => {
    const m = mensagemParaDiscord(
      mensagem({
        attachments: [
          {
            id: "clx_att",
            snowflake: 444555666777888999n,
            filename: "foto.png",
            contentType: "image/png",
            size: 12345,
            width: 800,
            height: 600,
            url: "https://api.streamz.chat/anexo/assinado",
          },
        ],
      }),
    );
    expect(m.attachments[0]).toEqual({
      id: "444555666777888999",
      filename: "foto.png",
      size: 12345,
      url: "https://api.streamz.chat/anexo/assinado",
      proxy_url: "https://api.streamz.chat/anexo/assinado",
      content_type: "image/png",
      width: 800,
      height: 600,
    });
  });

  it("reações só aparecem quando existem", () => {
    expect("reactions" in mensagemParaDiscord(mensagem())).toBe(false);
    const m = mensagemParaDiscord(
      mensagem({ reactions: [{ emoji: "🔥", count: 3, euReagi: true, personalizado: null }] }),
    );
    expect(m.reactions).toEqual([
      { count: 3, me: true, emoji: { id: null, name: "🔥", animated: false } },
    ]);
  });

  it("nenhum bigint sobrevive ao JSON.stringify", () => {
    const m = mensagemParaDiscord(
      mensagem({
        respostaA: { snowflake: 1n, channelSnowflake: 2n },
        reactions: [{ emoji: "👍", count: 1, euReagi: false, personalizado: null }],
        attachments: [
          {
            id: "a",
            snowflake: 3n,
            filename: "f",
            contentType: "text/plain",
            size: 1,
            width: null,
            height: null,
            url: "https://x",
          },
        ],
      }),
    );
    expect(() => JSON.stringify(m)).not.toThrow();
    const voltou = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
    expect(typeof voltou.id).toBe("string");
    expect(typeof voltou.channel_id).toBe("string");
  });
});
