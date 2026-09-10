import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, MAX_APP_DESCRIPTION, MAX_APP_NAME, Permission } from "@streamz/shared";
import bot from "./index";

/**
 * A identidade do bot é **contrato com a API**: o `provisionar` manda `nome` e
 * `descricao` para `PATCH /api/applications/:id`, que valida com
 * `appEditarSchema`.
 *
 * A fundação já morreu uma vez com um `400` cru porque a descrição tinha 301
 * caracteres. Descobrir aquilo custou subir a bancada inteira; aqui custa 5 ms.
 */
describe("identidade do Streamz Moderação", () => {
  it("o nome cabe no limite da API e é próprio do Streamz", () => {
    expect(bot.nome.length).toBeGreaterThanOrEqual(2);
    expect(bot.nome.length).toBeLessThanOrEqual(MAX_APP_NAME);
    expect(bot.nome).toMatch(/^Streamz /);
    // Nome de bot de terceiro não entra neste repositório, nem em dado de teste.
    expect(bot.nome).not.toMatch(/dyno|carl|mee6|probot|vortex/i);
  });

  it("a descrição cabe no limite da API", () => {
    expect(bot.descricao.length).toBeLessThanOrEqual(MAX_APP_DESCRIPTION);
  });

  it("a descrição avisa onde os avisos são guardados", () => {
    // A regra do CONTRATO.md: a descrição diz o que o bot **não** faz. Os
    // avisos vivem em arquivo do bot, não numa tabela do servidor — quem
    // instala precisa saber disso antes, não depois.
    expect(bot.descricao).toMatch(/guardados pelo bot/i);
  });

  it("as permissões sugeridas existem no bitfield do Streamz e cobrem os comandos", () => {
    expect(bot.permissoesPadrao).toBeDefined();
    expect(bot.permissoesPadrao! & ~ALL_PERMISSIONS).toBe(0);
    for (const bit of [
      Permission.BAN_MEMBERS,
      Permission.KICK_MEMBERS,
      Permission.MODERATE_MEMBERS,
      Permission.MANAGE_MESSAGES,
    ]) {
      expect(bot.permissoesPadrao! & bit).toBe(bit);
    }
    // Nada além do necessário: um bot de moderação pedindo ADMINISTRATOR é o
    // pedido que ninguém deveria aceitar.
    expect(bot.permissoesPadrao! & Permission.ADMINISTRATOR).toBe(0);
  });

  it("todo comando tem nome válido para o registro do Discord", () => {
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

  it("as opções obrigatórias vêm antes das opcionais", () => {
    // É a regra do registro do Discord, e um `PUT` recusado derruba **todos**
    // os comandos do bot na subida, não só o errado.
    for (const comando of bot.comandos) {
      const opcoes = comando.opcoes ?? [];
      const ultimaObrigatoria = opcoes.reduce((i, o, n) => (o.obrigatoria ? n : i), -1);
      for (let i = 0; i <= ultimaObrigatoria; i++) {
        expect(opcoes[i]!.obrigatoria).toBe(true);
      }
    }
  });

  it("nenhuma opção vem depois da que engole a linha", () => {
    // No prefixo `!` a opção `restoDaLinha` leva tudo e o laço para — qualquer
    // opção declarada depois dela nunca receberia valor por `!comando`.
    for (const comando of bot.comandos) {
      const opcoes = comando.opcoes ?? [];
      const resto = opcoes.findIndex((o) => o.restoDaLinha);
      if (resto === -1) continue;
      for (const seguinte of opcoes.slice(resto + 1)) {
        expect(seguinte.obrigatoria ?? false).toBe(false);
      }
    }
  });

  it("nenhum apelido do prefixo colide com o nome de outro comando", () => {
    const nomes = new Set(bot.comandos.map((c) => c.nome));
    const vistos = new Set<string>();
    for (const comando of bot.comandos) {
      for (const apelido of comando.apelidos ?? []) {
        expect(nomes.has(apelido)).toBe(false);
        expect(vistos.has(apelido)).toBe(false);
        vistos.add(apelido);
      }
    }
  });

  it("entrega os dez comandos do pedido", () => {
    expect(bot.comandos.map((c) => c.nome).sort()).toEqual(
      [
        "avisos",
        "aviso",
        "banir",
        "desbanir",
        "dessilenciar",
        "expulsar",
        "limpar",
        "limpar-avisos",
        "registro-de-moderacao",
        "silenciar",
      ].sort(),
    );
  });
});
