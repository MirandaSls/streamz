import { describe, expect, it } from "vitest";
import { ApiError } from "../api-error";
import { mensagemDeAuth, validarCredenciais } from "../auth-mensagens";

describe("mensagemDeAuth", () => {
  it("traduz os status que o usuário pode causar", () => {
    expect(mensagemDeAuth(new ApiError(401, "Credenciais inválidas"), "login")).toBe(
      "Usuário ou senha incorretos.",
    );
    expect(mensagemDeAuth(new ApiError(409, "Nome de usuário já em uso"), "registro")).toBe(
      "Esse nome de usuário já está em uso.",
    );
    expect(mensagemDeAuth(new ApiError(0, "x"), "login")).toContain("Sem conexão");
  });

  it("mantém a mensagem da API na validação (400), que já é específica", () => {
    expect(mensagemDeAuth(new ApiError(400, "username: muito curto"), "registro")).toBe(
      "username: muito curto",
    );
  });

  it("não vaza erro interno nem falha desconhecida", () => {
    expect(mensagemDeAuth(new ApiError(500, "Internal Server Error"), "login")).not.toContain(
      "Internal",
    );
    expect(mensagemDeAuth(new TypeError("boom"), "login")).toBe(
      "Não foi possível concluir. Tente de novo.",
    );
  });
});

describe("validarCredenciais", () => {
  it("aceita o que a API aceita", () => {
    expect(validarCredenciais("ana.souza_1", "senha-forte")).toBeNull();
  });

  it("recusa usuário curto, caractere inválido e senha curta", () => {
    expect(validarCredenciais("ab", "senha-forte")).toContain("usuário");
    expect(validarCredenciais("ana souza", "senha-forte")).toContain("apenas letras");
    expect(validarCredenciais("ana", "12345")).toContain("senha");
  });
});
