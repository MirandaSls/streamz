import { describe, expect, it } from "vitest";
import { nomeParaMim } from "./nome-para-mim";

/**
 * A precedência do contrato (`docs/CONTRATO-MENUS.md` §3): apelido de amigo >
 * apelido no servidor > nome de exibição > usuário. `nomeParaMim` em si é a
 * função pura de `@streamz/shared` (reexportada por este arquivo); o teste
 * mora aqui, ao lado do hook que a usa, e não em `packages/shared`, porque é
 * este arquivo (`apps/web/lib/nome-para-mim.ts`) que o cartão pede testado.
 */

const usuario = { username: "mdz", displayName: "Miranda" };

describe("nomeParaMim", () => {
  it("sem nenhum apelido, usa o nome de exibição", () => {
    expect(nomeParaMim(usuario)).toBe("Miranda");
  });

  it("sem nome de exibição, cai para o usuário", () => {
    expect(nomeParaMim({ username: "mdz", displayName: null })).toBe("mdz");
  });

  it("apelido no servidor vence o nome de exibição", () => {
    expect(nomeParaMim(usuario, { apelidoNoServidor: "Chefe" })).toBe("Chefe");
  });

  it("apelido de amigo vence o apelido no servidor", () => {
    expect(
      nomeParaMim(usuario, { apelidoDeAmigo: "Mandy", apelidoNoServidor: "Chefe" }),
    ).toBe("Mandy");
  });

  it("apelido em branco não conta — cai para o próximo da precedência", () => {
    expect(nomeParaMim(usuario, { apelidoDeAmigo: "   ", apelidoNoServidor: "Chefe" })).toBe(
      "Chefe",
    );
  });

  it("apelido null (removido) não conta", () => {
    expect(nomeParaMim(usuario, { apelidoDeAmigo: null, apelidoNoServidor: null })).toBe(
      "Miranda",
    );
  });
});
