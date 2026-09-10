import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, MAX_APP_DESCRIPTION, MAX_APP_NAME } from "@streamz/shared";
import bot from "./index";

/**
 * A identidade do bot é **contrato com a API**, não texto solto: o
 * `provisionar` manda `nome` e `descricao` para `PATCH /api/applications/:id`,
 * que valida com `appEditarSchema`.
 *
 * O bot de música nasceu com uma descrição de **301** caracteres e a prova
 * inteira morreu com um `400` cru. Descobrir aquilo custou subir a bancada;
 * aqui custa 5 ms.
 */
describe("identidade do Streamz Níveis", () => {
  it("o nome cabe no limite da API", () => {
    expect(bot.nome.length).toBeGreaterThanOrEqual(2);
    expect(bot.nome.length).toBeLessThanOrEqual(MAX_APP_NAME);
  });

  it("a descrição cabe nos 300 caracteres da API", () => {
    expect(bot.descricao.length).toBeLessThanOrEqual(MAX_APP_DESCRIPTION);
  });

  it("a descrição avisa o que o bot NÃO conta", () => {
    // Mesma regra do "link do Spotify vira busca": dizer antes é mais barato
    // que responder depois. Aqui é o XP de voz, que todo mundo pergunta.
    expect(bot.descricao).toMatch(/voz/i);
    expect(bot.descricao).toMatch(/car[êe]ncia|1 min/i);
  });

  it("não usa o nome de nenhum bot de terceiro", () => {
    const texto = `${bot.nome} ${bot.descricao}`.toLowerCase();
    for (const alheio of ["mee6", "arcane", "amari", "tatsu", "polaris", "atlas"]) {
      expect(texto).not.toContain(alheio);
    }
  });

  it("as permissões sugeridas existem no bitfield do Streamz", () => {
    expect(bot.permissoesPadrao).toBeDefined();
    expect(bot.permissoesPadrao! & ~ALL_PERMISSIONS).toBe(0);
  });

  it("todo comando tem nome válido para o registro do Discord", () => {
    for (const comando of bot.comandos) {
      // `^[-_\p{L}\p{N}]{1,32}$` em minúsculas — a regra do `PUT` de comandos.
      expect(comando.nome).toMatch(/^[-_\p{Ll}\p{N}]{1,32}$/u);
      expect(comando.descricao.length).toBeGreaterThan(0);
      expect(comando.descricao.length).toBeLessThanOrEqual(100);
      for (const opcao of comando.opcoes ?? []) {
        expect(opcao.nome).toMatch(/^[-_\p{Ll}\p{N}]{1,32}$/u);
        expect(opcao.descricao.length).toBeGreaterThan(0);
        expect(opcao.descricao.length).toBeLessThanOrEqual(100);
      }
    }
  });

  it("as opções obrigatórias vêm antes das opcionais", () => {
    // Regra do registro do Discord (50035 se inverter). O nosso `PUT` herda a
    // mesma ordem, e o parser do prefixo `!` é posicional: uma opcional na
    // frente comeria o argumento da obrigatória.
    for (const comando of bot.comandos) {
      const opcoes = comando.opcoes ?? [];
      const primeiraOpcional = opcoes.findIndex((o) => !o.obrigatoria);
      if (primeiraOpcional === -1) continue;
      expect(opcoes.slice(primeiraOpcional).every((o) => !o.obrigatoria)).toBe(true);
    }
  });

  it("só a última opção de texto engole a linha", () => {
    // `restoDaLinha` no meio faria o resto das opções nunca receber nada.
    for (const comando of bot.comandos) {
      const opcoes = comando.opcoes ?? [];
      opcoes.forEach((opcao, i) => {
        if (opcao.restoDaLinha) expect(i).toBe(opcoes.length - 1);
      });
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

  it("os nove comandos prometidos estão lá", () => {
    expect(bot.comandos.map((c) => c.nome).sort()).toEqual(
      [
        "cargo-por-nivel",
        "cargos-por-nivel",
        "configurar-niveis",
        "dar-xp",
        "nivel",
        "ranking",
        "remover-cargo-por-nivel",
        "tirar-xp",
        "zerar-niveis",
      ].sort(),
    );
  });
});
