import { describe, expect, it } from "vitest";
import { ApiError } from "../api-error";
import {
  forcaDaSenha,
  mensagemDeAuth,
  validarLogin,
  validarRegistro,
  validarSenha,
} from "../auth-mensagens";

const SENHA_BOA = "Cavalo-Bateria-42";

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

  it("aceita nascimento vazio como 'não informei'", () => {
    expect(
      validarRegistro({
        email: "ana@exemplo.com",
        username: "ana",
        password: SENHA_BOA,
        birthDate: "  ",
      }),
    ).toBeNull();
  });

  it("recusa e-mail inválido, usuário fora do formato e senha fraca", () => {
    const base = { email: "ana@exemplo.com", username: "ana.souza", password: SENHA_BOA };
    expect(validarRegistro({ ...base, email: "ana(at)exemplo" })).toContain("E-mail");
    expect(validarRegistro({ ...base, username: "ab" })).toContain("usuário");
    expect(validarRegistro({ ...base, username: "ana souza" })).toContain("apenas letras");
    expect(validarRegistro({ ...base, password: "1234567" })).toContain("caracteres");
    expect(validarRegistro({ ...base, password: "minhasenha" })).toContain("comuns");
  });

  it("recusa quem não tem a idade mínima", () => {
    const daquiA = (anos: number) => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - anos);
      return d.toISOString().slice(0, 10);
    };
    const base = { email: "ana@exemplo.com", username: "ana", password: SENHA_BOA };
    expect(validarRegistro({ ...base, birthDate: daquiA(10) })).toContain("anos");
    expect(validarRegistro({ ...base, birthDate: daquiA(30) })).toBeNull();
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

describe("validarSenha / forcaDaSenha", () => {
  it("recusa a senha fraca com a mesma regra da API", () => {
    expect(validarSenha("curta1!")).not.toBeNull();
    expect(validarSenha("aaaaaaaaaaaa")).not.toBeNull();
    expect(validarSenha(SENHA_BOA)).toBeNull();
  });

  it("o medidor acompanha a recusa: pontuação 0 é exatamente o que a API nega", () => {
    expect(forcaDaSenha("123456").pontuacao).toBe(0);
    expect(forcaDaSenha(SENHA_BOA).pontuacao).toBeGreaterThan(0);
  });
});
