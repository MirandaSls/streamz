import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, MAX_APP_DESCRIPTION, MAX_APP_NAME, Permission } from "@streamz/shared";
import { GatewayIntentBits } from "discord.js";
import bot from "./index";

/**
 * A identidade do bot é **contrato com a API**: o `provisionar` manda `nome` e
 * `descricao` para `PATCH /api/applications/:id`, que valida com
 * `appEditarSchema`. Uma descrição de 301 caracteres já custou uma bancada
 * inteira ao bot de música; aqui custa 5 ms.
 */
describe("identidade do Streamz Boas-vindas", () => {
  it("o nome cabe no limite da API e é nosso", () => {
    expect(bot.nome).toBe("Streamz Boas-vindas");
    expect(bot.nome.length).toBeLessThanOrEqual(MAX_APP_NAME);
  });

  it("a descrição cabe no limite da API", () => {
    expect(bot.descricao.length).toBeLessThanOrEqual(MAX_APP_DESCRIPTION);
  });

  it("a descrição avisa que o bot nasce desligado", () => {
    // É a reclamação certa de quem instala e não vê nada acontecer.
    expect(bot.descricao).toMatch(/desligado/i);
  });

  it("pede o intent de membros — sem ele o GUILD_MEMBER_ADD não chega", () => {
    // §7 do documento: o dispatch é filtrado por `GUILD_MEMBERS`. Este teste é o
    // guarda-costas do bot inteiro: sem o intent ele sobe, registra tudo e
    // nunca recebe uma entrada.
    expect(bot.intents).toContain(GatewayIntentBits.GuildMembers);
  });

  it("as permissões sugeridas existem no bitfield do Streamz e incluem cargos", () => {
    expect(bot.permissoesPadrao).toBeDefined();
    expect(bot.permissoesPadrao! & ~ALL_PERMISSIONS).toBe(0);
    expect(bot.permissoesPadrao! & Permission.MANAGE_ROLES).toBeTruthy();
    expect(bot.permissoesPadrao! & Permission.SEND_MESSAGES).toBeTruthy();
  });

  it("todo comando tem nome válido para o registro", () => {
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

  it("nenhum comando declara subcomando (tipo 1 ou 2) — o PUT recusaria", () => {
    for (const comando of bot.comandos) {
      for (const opcao of comando.opcoes ?? []) {
        expect(opcao.tipo).not.toBe(1);
        expect(opcao.tipo).not.toBe(2);
      }
    }
  });

  it("a opção que recebe frase engole o resto da linha no prefixo `!`", () => {
    // Sem `restoDaLinha`, `!boas-vindas mensagem oi pessoal` guardaria só "oi".
    for (const comando of bot.comandos) {
      const ultima = (comando.opcoes ?? []).at(-1);
      if (ultima) expect(ultima.restoDaLinha).toBe(true);
    }
  });

  it("nenhum apelido colide com o nome de outro comando", () => {
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
