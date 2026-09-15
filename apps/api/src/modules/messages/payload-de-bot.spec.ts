import { describe, expect, it } from "vitest";
import { FLAGS_DE_MENSAGEM, TEXTO_PENSANDO } from "@streamz/shared";
import {
  camposDeBotDoDTO,
  gravacaoDaEdicao,
  gravacaoDaMensagemNova,
  nenhumCitado,
  snowflakesCitados,
} from "./payload-de-bot";

/**
 * ── onda 3 ── O que gravar numa mensagem de bot.
 *
 * O que estes testes protegem, em ordem de quanto custa errar:
 *
 * 1. **A `Message` só ganha a linha 1:1 quando precisa.** Mensagem de bot só
 *    com texto não cria `MessageBotPayload` — é a regra de não pesar a tabela
 *    maior do banco.
 * 2. **O bot não liga `LOADING`.** Só o servidor (callback 5) liga; um bot que
 *    mande `1 << 7` no corpo não pode deixar uma mensagem eternamente
 *    "pensando…".
 * 3. **O PATCH é o do Discord.** Ausente não mexe; `IS_COMPONENTS_V2` não se
 *    desliga; a primeira edição de um "pensando…" apaga o texto provisório e
 *    não conta como edição.
 */

const EMBED = { type: "rich", title: "Status" };
const ROW = {
  type: 1 as const,
  id: 1,
  components: [{ type: 2 as const, id: 2, style: 1, label: "Ok", custom_id: "ok" }],
};

describe("gravacaoDaMensagemNova", () => {
  it("só texto não cria linha em MessageBotPayload", () => {
    const r = gravacaoDaMensagemNova({ content: " pong ", embeds: [], components: [], flags: 0 }, { temAnexos: false });
    expect(r).toEqual({ ok: true, gravacao: { content: "pong", suppressEmbeds: false, payload: null } });
  });

  it("embed e componente viram colunas, com o texto achatado para a busca", () => {
    const r = gravacaoDaMensagemNova({ content: "", embeds: [EMBED], components: [ROW], flags: 0 }, { temAnexos: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gravacao.payload).toEqual({ embeds: [EMBED], components: [ROW], flags: 0, flatText: "**Status**" });
  });

  it("SUPPRESS_EMBEDS vai para a coluna da Message, não para o payload", () => {
    const r = gravacaoDaMensagemNova(
      { content: "", embeds: [EMBED], components: [], flags: FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS },
      { temAnexos: false },
    );
    expect(r.ok && r.gravacao.suppressEmbeds).toBe(true);
    expect(r.ok && r.gravacao.payload?.flags).toBe(0);
  });

  it("o bot não liga LOADING; o callback 5 liga", () => {
    const doBot = gravacaoDaMensagemNova(
      { content: "x", embeds: [], components: [], flags: FLAGS_DE_MENSAGEM.LOADING },
      { temAnexos: false },
    );
    expect(doBot.ok && doBot.gravacao.payload).toBeNull();

    const adiada = gravacaoDaMensagemNova(
      { content: TEXTO_PENSANDO, embeds: [], components: [], flags: 0, carregando: true },
      { temAnexos: false },
    );
    expect(adiada.ok && adiada.gravacao.payload?.flags).toBe(FLAGS_DE_MENSAGEM.LOADING);
  });

  it("recusa v2 com content", () => {
    const r = gravacaoDaMensagemNova(
      {
        content: "não",
        embeds: [],
        components: [{ type: 10, id: 1, content: "oi" }],
        flags: FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2,
      },
      { temAnexos: false },
    );
    expect(r.ok).toBe(false);
  });
});

describe("gravacaoDaEdicao", () => {
  const atual = {
    content: "antes",
    suppressEmbeds: false,
    payload: { embeds: [EMBED], components: [ROW], flags: 0 },
    temAnexos: false,
  };

  it("ausente não mexe: editar só o texto mantém embeds e componentes", () => {
    const r = gravacaoDaEdicao(atual, { content: "depois" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gravacao.content).toBe("depois");
    expect(r.gravacao.payload?.embeds).toEqual([EMBED]);
    expect(r.gravacao.payload?.components).toEqual([ROW]);
  });

  it("lista vazia apaga; sem nada sobrando a linha 1:1 some", () => {
    const r = gravacaoDaEdicao(atual, { embeds: [], components: [] });
    expect(r.ok && r.gravacao.payload).toBeNull();
    expect(r.ok && r.gravacao.content).toBe("antes");
  });

  it("o 'pensando…' perde o texto provisório e não conta como editado", () => {
    const r = gravacaoDaEdicao(
      {
        content: TEXTO_PENSANDO,
        suppressEmbeds: false,
        payload: { embeds: [], components: [], flags: FLAGS_DE_MENSAGEM.LOADING },
        temAnexos: false,
      },
      { embeds: [EMBED] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gravacao.content).toBe("");
    expect(r.gravacao.eraCarregando).toBe(true);
    expect(r.gravacao.payload?.flags).toBe(0);
  });

  it("IS_COMPONENTS_V2 não desliga", () => {
    const r = gravacaoDaEdicao(
      {
        content: "",
        suppressEmbeds: false,
        payload: { embeds: [], components: [{ type: 10, id: 1, content: "oi" }], flags: FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2 },
        temAnexos: false,
      },
      { flags: 0 },
    );
    expect(r.ok && r.gravacao.payload?.flags).toBe(FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2);
  });
});

describe("camposDeBotDoDTO", () => {
  it("mensagem sem payload: listas vazias e flags 0", () => {
    expect(camposDeBotDoDTO({ suppressEmbeds: false, payload: null }, [])).toEqual({
      embeds: [],
      components: [],
      flags: 0,
    });
  });

  it("junta suppressEmbeds e EPHEMERAL nas flags", () => {
    const campos = camposDeBotDoDTO(
      { suppressEmbeds: true, payload: { embeds: [], components: [], flags: 0 }, efemera: true },
      [],
    );
    expect(campos.flags).toBe(FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS | FLAGS_DE_MENSAGEM.EPHEMERAL);
  });
});

describe("snowflakes citados nos componentes", () => {
  const COMPONENTES = [
    {
      type: 1,
      id: 1,
      components: [
        { type: 2, id: 2, style: 2, label: "Festa", custom_id: "f", emoji: { id: "123456789012345678", name: "festa" } },
      ],
    },
    {
      type: 1,
      id: 3,
      components: [
        {
          type: 7,
          id: 4,
          custom_id: "quem",
          default_values: [
            { id: "111", type: "user" },
            { id: "222", type: "role" },
          ],
        },
      ],
    },
  ];

  it("acha emoji e default_values por tipo", () => {
    expect(snowflakesCitados(COMPONENTES)).toEqual({
      emojis: ["123456789012345678"],
      usuarios: ["111"],
      cargos: ["222"],
      canais: [],
    });
    expect(nenhumCitado(snowflakesCitados([{ type: 10, content: "oi" }]))).toBe(true);
  });

  it("o DTO troca pelos cuids, e o que não existe aqui fica como veio", () => {
    const campos = camposDeBotDoDTO(
      { suppressEmbeds: false, payload: { embeds: [], components: COMPONENTES, flags: 0 } },
      [],
      {
        emojis: new Map([["123456789012345678", "emoji_cuid"]]),
        usuarios: new Map([["111", "user_cuid"]]),
        cargos: new Map(),
        canais: new Map(),
      },
    );
    const texto = JSON.stringify(campos.components);
    expect(texto).toContain('"id":"emoji_cuid"');
    expect(texto).toContain('{"id":"user_cuid","type":"user"}');
    expect(texto).toContain('{"id":"222","type":"role"}');
  });
});
