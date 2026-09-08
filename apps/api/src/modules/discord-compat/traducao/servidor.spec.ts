import { DEFAULT_PERMISSIONS, Permission } from "@streamz/shared";
import { describe, expect, it } from "vitest";

import type { LinhaDeServidor } from "../tipos";
import { CAMPOS_DO_SERVIDOR, CAMPOS_SO_DO_GUILD_CREATE, servidorParaDiscord } from "./servidor";

/**
 * O payload mais perigoso da F1 — **este arquivo é o teste que salva a fase do
 * risco (a) do §12**.
 *
 * Um campo obrigatório faltando no `GUILD_CREATE` não dá erro em lugar nenhum:
 * o `ready` do bot simplesmente nunca dispara e ele fica mudo (o discord.py
 * chega a levantar `KeyError` em `Guild._from_data`). A lista abaixo é copiada
 * à mão do §7 do documento, de propósito: se alguém podar um campo da
 * implementação, é aqui que a poda aparece, e não em produção.
 */
const CAMPOS_DO_DOCUMENTO = [
  "id",
  "name",
  "icon",
  "owner_id",
  "roles",
  "channels",
  "members",
  "voice_states",
  "member_count",
  "unavailable",
  "emojis",
  "features",
  "premium_tier",
  "nsfw_level",
  "system_channel_id",
  "rules_channel_id",
  "afk_channel_id",
  "afk_timeout",
  "verification_level",
  "default_message_notifications",
  "explicit_content_filter",
  "mfa_level",
  "stickers",
  "guild_scheduled_events",
  "threads",
  "stage_instances",
];

const guildSnowflake = 111222333444555666n;

function servidor(campos: Partial<LinhaDeServidor> = {}): LinhaDeServidor {
  return {
    id: "clx_guild",
    snowflake: guildSnowflake,
    name: "Streamz",
    ownerSnowflake: 555444333222111000n,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    systemChannelSnowflake: 222333444555666777n,
    rulesChannelSnowflake: null,
    cargos: [
      {
        id: "clx_everyone",
        snowflake: 100000000000000001n,
        guildId: "clx_guild",
        guildSnowflake,
        name: "@everyone",
        color: null,
        position: 0,
        permissions: DEFAULT_PERMISSIONS,
        hoist: false,
        mentionable: false,
        isDefault: true,
      },
      {
        id: "clx_admin",
        snowflake: 100000000000000002n,
        guildId: "clx_guild",
        guildSnowflake,
        name: "Administrador",
        color: "#e74c3c",
        position: 10,
        permissions: Permission.ADMINISTRATOR,
        hoist: true,
        mentionable: true,
        isDefault: false,
      },
    ],
    canais: [
      {
        id: "clx_canal",
        snowflake: 222333444555666777n,
        guildId: "clx_guild",
        guildSnowflake,
        name: "geral",
        type: "TEXT",
        position: 0,
        topic: null,
        nsfw: false,
        slowmodeSeconds: 0,
        categoriaSnowflake: 333444555666777888n,
        destinatarios: [],
      },
      {
        id: "clx_voz",
        snowflake: 222333444555666778n,
        guildId: "clx_guild",
        guildSnowflake,
        name: "Sala 1",
        type: "VOICE",
        position: 1,
        topic: null,
        nsfw: false,
        slowmodeSeconds: 0,
        categoriaSnowflake: 333444555666777888n,
        destinatarios: [],
      },
    ],
    categorias: [
      {
        id: "clx_cat",
        snowflake: 333444555666777888n,
        guildId: "clx_guild",
        guildSnowflake,
        name: "TEXTO",
        position: 0,
      },
    ],
    membros: [
      {
        user: {
          id: "clx_user",
          snowflake: 555444333222111000n,
          username: "mdz",
          displayName: "MDZ",
          isBot: false,
        },
        cargoSnowflakes: [100000000000000002n],
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
        timeoutUntil: null,
      },
    ],
    memberCount: 1,
    ...campos,
  };
}

/** Percorre o payload inteiro atrás de um `bigint` esquecido. */
function achaBigint(valor: unknown, caminho = "$"): string | null {
  if (typeof valor === "bigint") return caminho;
  if (Array.isArray(valor)) {
    for (const [i, v] of valor.entries()) {
      const achado = achaBigint(v, `${caminho}[${i}]`);
      if (achado) return achado;
    }
    return null;
  }
  if (valor !== null && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) {
      const achado = achaBigint(v, `${caminho}.${k}`);
      if (achado) return achado;
    }
  }
  return null;
}

/** Todo campo `*_id`/`id` do payload, com o caminho, para conferir o tipo. */
function idsDoPayload(valor: unknown, caminho = "$", saida: [string, unknown][] = []) {
  if (Array.isArray(valor)) {
    for (const [i, v] of valor.entries()) idsDoPayload(v, `${caminho}[${i}]`, saida);
  } else if (valor !== null && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) {
      if (k === "id" || k.endsWith("_id")) saida.push([`${caminho}.${k}`, v]);
      idsDoPayload(v, `${caminho}.${k}`, saida);
    }
  }
  return saida;
}

describe("servidorParaDiscord — contrato do GUILD_CREATE", () => {
  it("tem todos os campos que o §7 lista, sem exceção", () => {
    const g = servidorParaDiscord(servidor(), true);
    const faltando = CAMPOS_DO_DOCUMENTO.filter((c) => !(c in g));
    expect(faltando, `campos do §7 ausentes: ${faltando.join(", ")}`).toEqual([]);
  });

  it("a constante exportada e a lista do documento dizem a mesma coisa", () => {
    // se o coordenador acrescentar um campo ao §7, as duas listas divergem aqui
    expect([...CAMPOS_DO_SERVIDOR].sort()).toEqual([...CAMPOS_DO_DOCUMENTO].sort());
  });

  it("não inventa campo que o documento não pediu", () => {
    const g = servidorParaDiscord(servidor(), true);
    expect(Object.keys(g).filter((c) => !CAMPOS_DO_DOCUMENTO.includes(c))).toEqual([]);
  });

  it("os valores fixos são os do §7", () => {
    expect(servidorParaDiscord(servidor(), true)).toMatchObject({
      id: "111222333444555666",
      name: "Streamz",
      icon: null,
      owner_id: "555444333222111000",
      member_count: 1,
      unavailable: false,
      emojis: [],
      features: [],
      premium_tier: 0,
      nsfw_level: 0,
      system_channel_id: "222333444555666777",
      rules_channel_id: null,
      afk_channel_id: null,
      afk_timeout: 300,
      verification_level: 0,
      default_message_notifications: 0,
      explicit_content_filter: 0,
      mfa_level: 0,
      stickers: [],
      guild_scheduled_events: [],
      threads: [],
      stage_instances: [],
      voice_states: [],
    });
  });

  it("as categorias entram em channels como tipo 4, antes dos canais", () => {
    const canais = servidorParaDiscord(servidor(), true).channels as {
      id: string;
      type: number;
      parent_id?: string | null;
    }[];
    expect(canais).toHaveLength(3);
    expect(canais[0]).toMatchObject({ id: "333444555666777888", type: 4 });
    expect(canais.map((c) => c.type)).toEqual([4, 0, 2]);
    // e o parent_id dos filhos aponta para a categoria que veio antes
    expect(canais.slice(1).every((c) => c.parent_id === canais[0].id)).toBe(true);
  });

  it("o @everyone entra em roles com o id da guild", () => {
    const cargos = servidorParaDiscord(servidor(), true).roles as { id: string; name: string }[];
    const everyone = cargos.find((r) => r.name === "@everyone");
    expect(everyone?.id).toBe("111222333444555666");
  });

  it("os membros vêm com o usuário dentro (o cache do bot nasce deles)", () => {
    const membros = servidorParaDiscord(servidor(), true).members as { user?: { id: string } }[];
    expect(membros[0]?.user?.id).toBe("555444333222111000");
  });

  it("completo: false devolve a forma reduzida do GET /guilds/:id", () => {
    const g = servidorParaDiscord(servidor(), false);
    for (const campo of CAMPOS_SO_DO_GUILD_CREATE) expect(campo in g, campo).toBe(false);
    // mas mantém o resto — inclusive roles, que o GET /guilds/:id do Discord traz
    for (const campo of CAMPOS_DO_DOCUMENTO.filter(
      (c) => !CAMPOS_SO_DO_GUILD_CREATE.includes(c),
    )) {
      expect(campo in g, campo).toBe(true);
    }
  });

  it("nenhum bigint sobrevive, e todo id é string", () => {
    const g = servidorParaDiscord(servidor(), true);
    expect(achaBigint(g)).toBeNull();
    expect(() => JSON.stringify(g)).not.toThrow();
    for (const [caminho, valor] of idsDoPayload(g)) {
      expect(valor === null || typeof valor === "string", `${caminho} = ${String(valor)}`).toBe(
        true,
      );
    }
  });
});
