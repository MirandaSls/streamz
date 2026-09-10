import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, MAX_APP_DESCRIPTION, MAX_APP_NAME } from "@streamz/shared";
import bot from "./index";

/**
 * A identidade do bot é **contrato com a API**, não texto solto: o
 * `provisionar` manda `nome` e `descricao` para `PATCH /api/applications/:id`,
 * que valida com `appEditarSchema`.
 *
 * Este teste existe porque a primeira execução da prova morreu com um `400`
 * cru: a descrição tinha **301** caracteres, um a mais que `MAX_APP_DESCRIPTION`.
 * Descobrir isso custou subir a bancada inteira; aqui custa 5 ms.
 */
describe("identidade do Streamz Música", () => {
  it("o nome cabe no limite da API", () => {
    expect(bot.nome.length).toBeGreaterThanOrEqual(2);
    expect(bot.nome.length).toBeLessThanOrEqual(MAX_APP_NAME);
  });

  it("a descrição cabe no limite da API", () => {
    expect(bot.descricao.length).toBeLessThanOrEqual(MAX_APP_DESCRIPTION);
  });

  it("a descrição avisa que link do Spotify vira busca", () => {
    // Não é capricho: prometer Spotify e entregar outra gravação é o jeito mais
    // barato de gerar reclamação. Ver §14 do documento dos bots.
    expect(bot.descricao).toMatch(/spotify/i);
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
        expect(opcao.descricao.length).toBeLessThanOrEqual(100);
      }
    }
  });

  it("nenhum apelido do prefixo colide com o nome de outro comando", () => {
    // Um apelido que casa com outro comando faz `acharComando` devolver o
    // primeiro da lista, e o comando certo nunca roda.
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
});
