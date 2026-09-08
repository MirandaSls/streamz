import { describe, expect, it } from "vitest";
import {
  comandoParaRegistrarSchema,
  comandosParaRegistrarSchema,
  corpoDeCallbackSchema,
  dadosDeRespostaSchema,
  normalizarComando,
} from "./corpos-f3";

/**
 * Os corpos da F3: tolerantes com o que não usamos, duros com o que não
 * suportamos.
 *
 * O caso que dá nome ao arquivo é o primeiro: **o `toJSON()` de verdade** de um
 * `SlashCommandBuilder` do discord.js. Ele manda oito campos que a F3 não
 * materializa, e recusar qualquer um deles faria o `deploy-commands.js` do guia
 * oficial falhar inteiro — que é a prova 1 da fase.
 */

/**
 * `new SlashCommandBuilder().setName("play")…toJSON()`, com tudo que a versão
 * 14 da lib preenche sozinha. Copiado de uma saída real, não do documento.
 */
const DO_SLASH_COMMAND_BUILDER = {
  name: "play",
  name_localizations: undefined,
  description: "Toca uma música",
  description_localizations: undefined,
  options: [
    {
      name: "url",
      name_localizations: undefined,
      description: "O link",
      description_localizations: undefined,
      type: 3,
      required: true,
      autocomplete: false,
      max_length: 2000,
    },
  ],
  default_member_permissions: undefined,
  dm_permission: undefined,
  contexts: undefined,
  integration_types: undefined,
  nsfw: false,
};

describe("comandoParaRegistrarSchema", () => {
  it("aceita o toJSON() inteiro do SlashCommandBuilder", () => {
    const resultado = comandoParaRegistrarSchema.safeParse(DO_SLASH_COMMAND_BUILDER);
    expect(resultado.success, JSON.stringify(resultado.error?.issues)).toBe(true);
  });

  it("guarda só o que a F3 usa, e com o `required` explícito", () => {
    const comando = normalizarComando(comandoParaRegistrarSchema.parse(DO_SLASH_COMMAND_BUILDER));

    expect(comando).toEqual({
      name: "play",
      description: "Toca uma música",
      type: 1,
      defaultMemberPermissions: null,
      options: [{ name: "url", description: "O link", type: 3, required: true }],
    });
    // `autocomplete` e `max_length` são F5: chegaram, foram ignorados, e não
    // ficam na coluna `options` para o composer tropeçar neles
    expect(comando.options[0]).not.toHaveProperty("autocomplete");
  });

  it("aceita os campos de localização, permissão e contexto sem os guardar", () => {
    const comando = normalizarComando(
      comandoParaRegistrarSchema.parse({
        name: "ping",
        description: "pong",
        name_localizations: { "pt-BR": "pingue" },
        description_localizations: { "pt-BR": "pongue" },
        dm_permission: false,
        nsfw: true,
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        default_member_permissions: "8",
      }),
    );

    expect(comando.defaultMemberPermissions).toBe("8");
    expect(comando.options).toEqual([]);
  });

  it("guarda as escolhas fixas de uma opção", () => {
    const comando = normalizarComando(
      comandoParaRegistrarSchema.parse({
        name: "modo",
        description: "escolhe",
        options: [
          {
            name: "qual",
            description: "qual modo",
            type: 3,
            choices: [
              { name: "Aleatório", value: "shuffle" },
              { name: "Repetir", value: "loop" },
            ],
          },
        ],
      }),
    );

    expect(comando.options[0]?.choices).toHaveLength(2);
    // `required` ausente no corpo vira `false` explícito: o composer do lote C
    // lê o campo para decidir se cobra a opção antes de mandar
    expect(comando.options[0]?.required).toBe(false);
  });

  // ── as recusas ─────────────────────────────────────────────

  it("recusa subcomando (opção tipo 1) dizendo o que é", () => {
    const resultado = comandoParaRegistrarSchema.safeParse({
      name: "musica",
      description: "grupo",
      options: [{ name: "tocar", description: "toca", type: 1, options: [] }],
    });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toContain("subcomandos");
  });

  it("recusa grupo de subcomando (opção tipo 2)", () => {
    expect(
      comandoParaRegistrarSchema.safeParse({
        name: "musica",
        description: "grupo",
        options: [{ name: "fila", description: "fila", type: 2, options: [] }],
      }).success,
    ).toBe(false);
  });

  it("recusa opção de tipo 11 (attachment), que também é F5", () => {
    expect(
      comandoParaRegistrarSchema.safeParse({
        name: "envia",
        description: "envia",
        options: [{ name: "arquivo", description: "o arquivo", type: 11 }],
      }).success,
    ).toBe(false);
  });

  it("recusa menu de contexto (type 2 e 3): ele não teria onde aparecer", () => {
    for (const tipo of [2, 3]) {
      // descrição preenchida de propósito: o que tem que reprovar é o `type`, e
      // não a descrição vazia que o Discord exige nos menus de contexto
      const resultado = comandoParaRegistrarSchema.safeParse({
        name: "traduzir",
        description: "traduz a mensagem",
        type: tipo,
      });
      expect(resultado.success, `type ${tipo} devia ser recusado`).toBe(false);
    }
  });

  it("recusa nome com espaço: `/play url` é comando + opção, não um nome", () => {
    expect(
      comandoParaRegistrarSchema.safeParse({ name: "toca musica", description: "x" }).success,
    ).toBe(false);
  });

  it("recusa nome e descrição fora dos limites do Discord", () => {
    expect(comandoParaRegistrarSchema.safeParse({ name: "a".repeat(33), description: "x" }).success).toBe(false);
    expect(comandoParaRegistrarSchema.safeParse({ name: "ok", description: "" }).success).toBe(false);
    expect(
      comandoParaRegistrarSchema.safeParse({ name: "ok", description: "d".repeat(101) }).success,
    ).toBe(false);
  });
});

describe("comandosParaRegistrarSchema — o corpo do PUT", () => {
  it("aceita a lista vazia: é assim que se apaga tudo", () => {
    expect(comandosParaRegistrarSchema.parse([])).toEqual([]);
  });

  it("recusa nome repetido antes de o Prisma recusar", () => {
    const resultado = comandosParaRegistrarSchema.safeParse([
      { name: "play", description: "toca" },
      { name: "play", description: "toca de novo" },
    ]);

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toContain("play");
  });

  it("recusa mais de 100 comandos", () => {
    const muitos = Array.from({ length: 101 }, (_, i) => ({
      name: `c${i}`,
      description: "d",
    }));
    expect(comandosParaRegistrarSchema.safeParse(muitos).success).toBe(false);
  });
});

describe("os corpos do callback e dos followups", () => {
  it("aceita `{type:5}` pelado — é o deferReply()", () => {
    expect(corpoDeCallbackSchema.parse({ type: 5 })).toEqual({ type: 5 });
  });

  it("preserva embeds, components e flags dentro de `data`", () => {
    const corpo = corpoDeCallbackSchema.parse({
      type: 4,
      data: {
        content: "pong",
        flags: 64,
        embeds: [{ title: "um embed" }],
        components: [{ type: 1, components: [] }],
        allowed_mentions: { parse: [] },
      },
    });

    // o lote A é que decide o que fazer com eles; a casca não pode comê-los
    expect(corpo.data).toMatchObject({
      content: "pong",
      flags: 64,
      embeds: [{ title: "um embed" }],
      components: [{ type: 1, components: [] }],
    });
  });

  it("deixa passar campo que ainda não existe (poll, attachments…)", () => {
    const dados = dadosDeRespostaSchema.parse({
      content: "oi",
      attachments: [{ id: "0", filename: "a.png" }],
      poll: { question: { text: "?" } },
    });
    expect(dados).toHaveProperty("poll");
  });

  it("recusa texto acima do limite de mensagem", () => {
    expect(dadosDeRespostaSchema.safeParse({ content: "x".repeat(2001) }).success).toBe(false);
  });
});
