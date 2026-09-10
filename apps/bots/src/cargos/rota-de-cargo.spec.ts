import { DiscordAPIError } from "discord.js";
import { describe, expect, it } from "vitest";
import { ROTA_DE_CARGO_FALTANDO, ehRotaQueNaoExiste } from "./servico";

/**
 * O bot chama a rota **padrão** do discord.js para dar cargo
 * (`PUT /guilds/:id/members/:uid/roles/:rid`), e o §12 F5 do documento lista
 * "membros/cargos no REST" como ainda na fila. Enquanto ela não existir, o 404
 * que volta é o do Nest, e não o do Discord — e os dois precisam render
 * mensagens diferentes: um diz "falta rota na API", o outro diz "esse cargo não
 * existe mais".
 *
 * O primeiro teste é a bancada engarrafada: foi exatamente este erro que
 * chegou, com `code` sendo a **string** "Not Found" e a mensagem virando
 * "No Description".
 */
const erro = (corpo: Record<string, unknown>, codigo: unknown, status: number) =>
  new DiscordAPIError(corpo as never, codigo as never, status, "PUT", "/x", {} as never);

describe("ehRotaQueNaoExiste", () => {
  it("o 404 do Nest com `code` não numérico (o caso real da bancada)", () => {
    expect(
      ehRotaQueNaoExiste(
        erro({ message: "Cannot PUT /api/v10/guilds/1/members/2/roles/3", error: "Not Found" }, "Not Found", 404),
      ),
    ).toBe(true);
  });

  it("o 404 do Nest quando só a mensagem denuncia a rota", () => {
    expect(ehRotaQueNaoExiste(erro({ message: "Cannot DELETE /x", code: 0 }, 0, 404))).toBe(true);
  });

  it("`10011 Unknown Role` é o Discord dizendo que o cargo sumiu — não é rota faltando", () => {
    expect(ehRotaQueNaoExiste(erro({ message: "Unknown Role", code: 10011 }, 10011, 404))).toBe(false);
  });

  it("`50013 Missing Permissions` (403) não é rota faltando", () => {
    expect(ehRotaQueNaoExiste(erro({ message: "Missing Permissions", code: 50013 }, 50013, 403))).toBe(
      false,
    );
  });

  it("erro que nem é da API não confunde", () => {
    expect(ehRotaQueNaoExiste(new Error("a rede caiu"))).toBe(false);
    expect(ehRotaQueNaoExiste(null)).toBe(false);
  });
});

describe("a frase de rota faltando", () => {
  it("nomeia a rota e o §, para quem lê o log saber onde procurar", () => {
    expect(ROTA_DE_CARGO_FALTANDO).toContain("members/:uid/roles/:rid");
    expect(ROTA_DE_CARGO_FALTANDO).toContain("F5");
  });
});
