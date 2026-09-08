import type { ChannelType } from "@streamz/shared";
import { describe, expect, it } from "vitest";

import type { LinhaDeCanal, LinhaDeCategoria, LinhaDeUsuario } from "../tipos";
import { canalParaDiscord, categoriaParaDiscord, tipoDeCanalParaDiscord } from "./canal";

/**
 * A tabela de tipos do §5 e a categoria-como-canal.
 *
 * O tipo errado não dá erro em lugar nenhum: o discord.js cria um
 * `GuildChannel` genérico, o `channel.send()` some e o bot de música responde
 * "não encontrei o canal" para sempre.
 */

function canal(campos: Partial<LinhaDeCanal> = {}): LinhaDeCanal {
  return {
    id: "clx_canal",
    snowflake: 1234567890123456789n,
    guildId: "clx_guild",
    guildSnowflake: 111222333444555666n,
    name: "geral",
    type: "TEXT",
    position: 3,
    topic: "o canal de tudo",
    nsfw: false,
    slowmodeSeconds: 10,
    categoriaSnowflake: 999888777666555444n,
    destinatarios: [],
    ...campos,
  };
}

const usuario: LinhaDeUsuario = {
  id: "clx_user",
  snowflake: 555444333222111000n,
  username: "mdz",
  displayName: "MDZ",
  isBot: false,
};

describe("tipoDeCanalParaDiscord", () => {
  it("traduz a tabela inteira do §5", () => {
    const tabela: Record<ChannelType, number> = {
      TEXT: 0,
      DM: 1,
      VOICE: 2,
      GROUP: 3,
      ANNOUNCEMENT: 5,
    };
    for (const [nosso, deles] of Object.entries(tabela)) {
      expect(tipoDeCanalParaDiscord(nosso as ChannelType), nosso).toBe(deles);
    }
  });

  it("não usa o 4, que é da categoria", () => {
    const tipos: ChannelType[] = ["TEXT", "DM", "VOICE", "GROUP", "ANNOUNCEMENT"];
    expect(tipos.map(tipoDeCanalParaDiscord)).not.toContain(4);
  });
});

describe("canalParaDiscord", () => {
  it("monta o canal de servidor com todo id em string", () => {
    expect(canalParaDiscord(canal())).toEqual({
      id: "1234567890123456789",
      type: 0,
      guild_id: "111222333444555666",
      name: "geral",
      position: 3,
      parent_id: "999888777666555444",
      topic: "o canal de tudo",
      nsfw: false,
      rate_limit_per_user: 10,
      permission_overwrites: [],
    });
  });

  it("canal solto na raiz sai com parent_id null", () => {
    expect(canalParaDiscord(canal({ categoriaSnowflake: null })).parent_id).toBeNull();
  });

  it("o modo lento vira rate_limit_per_user", () => {
    expect(canalParaDiscord(canal({ slowmodeSeconds: 0 })).rate_limit_per_user).toBe(0);
    expect(canalParaDiscord(canal({ slowmodeSeconds: 21_600 })).rate_limit_per_user).toBe(21_600);
  });

  it("DM sai com recipients e sem servidor", () => {
    const dm = canalParaDiscord(
      canal({
        type: "DM",
        name: null,
        guildId: null,
        guildSnowflake: null,
        categoriaSnowflake: null,
        destinatarios: [usuario],
      }),
    );
    expect(dm.type).toBe(1);
    expect(dm.guild_id).toBeUndefined();
    expect(dm.recipients?.[0]?.id).toBe("555444333222111000");
    expect("name" in dm).toBe(false);
  });

  it("grupo sai com nome e recipients", () => {
    const grupo = canalParaDiscord(
      canal({
        type: "GROUP",
        name: "os manos",
        guildId: null,
        guildSnowflake: null,
        categoriaSnowflake: null,
        destinatarios: [usuario],
      }),
    );
    expect(grupo.type).toBe(3);
    expect(grupo.name).toBe("os manos");
    expect(grupo.recipients).toHaveLength(1);
  });
});

describe("categoriaParaDiscord", () => {
  const categoria: LinhaDeCategoria = {
    id: "clx_cat",
    snowflake: 999888777666555444n,
    guildId: "clx_guild",
    guildSnowflake: 111222333444555666n,
    name: "TEXTO",
    position: 0,
  };

  it("vira canal tipo 4", () => {
    expect(categoriaParaDiscord(categoria)).toEqual({
      id: "999888777666555444",
      type: 4,
      guild_id: "111222333444555666",
      name: "TEXTO",
      position: 0,
      parent_id: null,
      nsfw: false,
      permission_overwrites: [],
    });
  });

  it("o parent_id do canal aponta para o id da categoria", () => {
    expect(canalParaDiscord(canal()).parent_id).toBe(categoriaParaDiscord(categoria).id);
  });
});

describe("serialização", () => {
  it("nenhum bigint sobrevive ao JSON.stringify", () => {
    const payload = [
      canalParaDiscord(canal()),
      canalParaDiscord(
        canal({ type: "DM", name: null, guildSnowflake: null, destinatarios: [usuario] }),
      ),
      categoriaParaDiscord({
        id: "clx_cat",
        snowflake: 1n,
        guildId: "g",
        guildSnowflake: 2n,
        name: "x",
        position: 0,
      }),
    ];
    // um bigint aqui lançaria TypeError — é a prova, não a mensagem
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(JSON.stringify(payload)).toContain('"id":"1234567890123456789"');
  });
});
