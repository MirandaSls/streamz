import { describe, expect, it } from "vitest";
import { ApiError } from "../api-error";
import {
  mensagemDeAuth,
  validarLogin,
  validarRegistro,
  validarSenha,
} from "../auth-mensagens";

const SENHA_BOA = "senha123";

describe("mensagemDeAuth", () => {
  it("traduz os status que o usuário pode causar", () => {
    expect(mensagemDeAuth(new ApiError(401, "Credenciais inválidas"), "login")).toBe(
      "Usuário ou senha incorretos.",
    );
    expect(mensagemDeAuth(new ApiError(401, "Senha incorreta"), "conta")).toBe(
      "Senha ou código incorretos.",
    );
    expect(mensagemDeAuth(new ApiError(0, "x"), "login")).toContain("Sem conexão");
  });

  it("repassa a mensagem da API quando ela é específica (400/409/503)", () => {
    expect(mensagemDeAuth(new ApiError(400, "username: muito curto"), "registro")).toBe(
      "username: muito curto",
    );
    expect(mensagemDeAuth(new ApiError(409, "E-mail já cadastrado"), "registro")).toBe(
      "E-mail já cadastrado",
    );
    expect(mensagemDeAuth(new ApiError(503, "x"), "conta")).toContain("e-mail indisponível");
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

describe("validarRegistro", () => {
  it("aceita o que a API aceita", () => {
    expect(
      validarRegistro({ email: "ana@exemplo.com", username: "ana.souza_1", password: SENHA_BOA }),
    ).toBeNull();
  });

  it("recusa e-mail inválido, usuário fora do formato e senha curta", () => {
    const base = { email: "ana@exemplo.com", username: "ana.souza", password: SENHA_BOA };
    expect(validarRegistro({ ...base, email: "ana(at)exemplo" })).toContain("E-mail");
    expect(validarRegistro({ ...base, username: "ab" })).toContain("usuário");
    expect(validarRegistro({ ...base, username: "ana souza" })).toContain("apenas letras");
    expect(validarRegistro({ ...base, password: "12345" })).toContain("caracteres");
  });
});

describe("validarLogin", () => {
  it("aceita e-mail e usuário no mesmo campo", () => {
    expect(validarLogin("ana@exemplo.com", "qualquer")).toBeNull();
    expect(validarLogin("ana.souza", "qualquer")).toBeNull();
  });

  it("recusa identificador curto e senha vazia", () => {
    expect(validarLogin("an", "qualquer")).toContain("e-mail ou usuário");
    expect(validarLogin("ana.souza", "")).toContain("senha");
  });
});

describe("validarSenha", () => {
  it("só cobra o comprimento, a mesma regra da API", () => {
    expect(validarSenha("12345")).not.toBeNull();
    expect(validarSenha("123456")).toBeNull();
    expect(validarSenha("a".repeat(129))).not.toBeNull();
  });
});
