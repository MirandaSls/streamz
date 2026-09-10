import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, MAX_APP_DESCRIPTION, MAX_APP_NAME, Permission } from "@streamz/shared";
import bot from "./index";
import { MODOS } from "./modos";

/**
 * A identidade é contrato com a API: o `provisionar` manda `nome` e `descricao`
 * para `PATCH /api/applications/:id`, que valida com `appEditarSchema`. Uma
 * descrição de 301 caracteres já custou uma bancada inteira ao bot de música;
 * aqui custa 5 ms.
 */
describe("identidade do Streamz Cargos", () => {
  it("o nome cabe no limite da API", () => {
    expect(bot.nome.length).toBeGreaterThanOrEqual(2);
    expect(bot.nome.length).toBeLessThanOrEqual(MAX_APP_NAME);
  });

  it("a descrição cabe nos 300 caracteres", () => {
    expect(bot.descricao.length).toBeLessThanOrEqual(MAX_APP_DESCRIPTION);
  });

  it("o nome é do Streamz, não de bot de terceiro", () => {
    expect(bot.nome).toMatch(/^Streamz /);
    expect(`${bot.nome} ${bot.descricao}`.toLowerCase()).not.toMatch(
      /carl-?bot|yagpdb|mee6|dyno|reaction ?roles ?bot/,
    );
  });

  it("a descrição avisa da hierarquia, que é a causa de quase toda reclamação", () => {
    expect(bot.descricao).toMatch(/acima/i);
  });

  it("pede `MANAGE_ROLES` — sem ela o bot não faz nada", () => {
    expect(bot.permissoesPadrao! & Permission.MANAGE_ROLES).toBe(Permission.MANAGE_ROLES);
  });

  it("as permissões sugeridas existem no bitfield do Streamz", () => {
    expect(bot.permissoesPadrao).toBeDefined();
    expect(bot.permissoesPadrao! & ~ALL_PERMISSIONS).toBe(0);
  });

  it("pede o intent das reações — sem ele o gateway não manda nada", () => {
    // `GUILD_MESSAGE_REACTIONS` = 1<<10 (§7 do documento). O filtro por intent
    // é do lado da API: sem pedir, o bot fica mudo e sem erro.
    expect(bot.intents).toContain(1 << 10);
  });

  it("todo comando tem nome e descrição válidos para o registro", () => {
    for (const comando of bot.comandos) {
      expect(comando.nome).toMatch(/^[-_\p{Ll}\p{N}]{1,32}$/u);
      expect(comando.descricao.length).toBeGreaterThan(0);
      expect(comando.descricao.length).toBeLessThanOrEqual(100);
      for (const opcao of comando.opcoes ?? []) {
        expect(opcao.nome).toMatch(/^[-_\p{Ll}\p{N}]{1,32}$/u);
        expect(opcao.descricao.length).toBeLessThanOrEqual(100);
      }
    }
  });

  it("nenhum apelido do prefixo colide com o nome de outro comando", () => {
    const nomes = new Set(bot.comandos.map((c) => c.nome));
    for (const comando of bot.comandos) {
      for (const apelido of comando.apelidos ?? []) expect(nomes.has(apelido)).toBe(false);
    }
  });

  it("as escolhas de `acao` do `/painel` são as ações que o comando trata", () => {
    // Uma escolha a mais no registro é uma opção que aparece no composer e cai
    // no `default` ("ação desconhecida") — o pior tipo de menu.
    const acao = bot.comandos[0]!.opcoes!.find((o) => o.nome === "acao")!;
    expect(acao.escolhas!.map((e) => e.valor)).toEqual([
      "criar",
      "adicionar",
      "remover",
      "modo",
      "listar",
      "apagar",
    ]);
  });

  it("os modos anunciados são os quatro do pedido", () => {
    expect([...MODOS]).toEqual(["normal", "unico", "so-adicionar", "travado"]);
  });
});
