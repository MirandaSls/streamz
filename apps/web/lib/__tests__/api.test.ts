import { beforeEach, describe, expect, it, vi } from "vitest";
import { jwtComExp, resposta } from "./ajudantes";

async function carregarApi() {
  vi.resetModules();
  return import("../api");
}

type Chamada = { url: string; init: RequestInit | undefined };

/** fetch de mentira que consome uma fila de respostas por URL e grava as chamadas. */
function servidorFalso(fila: Array<(url: string) => Response>) {
  const chamadas: Chamada[] = [];
  let indice = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const proxima = fila[indice++];
    if (!proxima) throw new Error(`chamada inesperada a ${url}`);
    return proxima(url);
  });
  vi.stubGlobal("fetch", fetchMock);
  return chamadas;
}

function autorizacao(chamada: Chamada): string | undefined {
  return (chamada.init?.headers as Record<string, string> | undefined)?.Authorization;
}

beforeEach(() => {
  localStorage.setItem("accessToken", jwtComExp(Date.now() + 15 * 60_000));
  localStorage.setItem("refreshToken", "refresh-antigo");
});

describe("request", () => {
  it("em 401 renova o token e repete a requisição uma vez", async () => {
    const chamadas = servidorFalso([
      () => resposta(401, { message: "Token inválido" }),
      () => resposta(200, { accessToken: "access-novo", refreshToken: "refresh-novo" }),
      () => resposta(200, [{ id: "g1" }]),
    ]);
    const { api } = await carregarApi();

    await expect(api.listGuilds()).resolves.toEqual([{ id: "g1" }]);

    expect(chamadas).toHaveLength(3);
    expect(chamadas[1].url).toContain("/api/auth/refresh");
    expect(chamadas[2].url).toContain("/api/guilds");
    expect(autorizacao(chamadas[2])).toBe("Bearer access-novo");
  });

  it("não repete uma segunda vez quando o 401 persiste", async () => {
    const chamadas = servidorFalso([
      () => resposta(401, { message: "Token inválido" }),
      () => resposta(200, { accessToken: "access-novo", refreshToken: "refresh-novo" }),
      () => resposta(401, { message: "Token inválido" }),
    ]);
    const { api, ApiError } = await carregarApi();

    await expect(api.listGuilds()).rejects.toBeInstanceOf(ApiError);
    expect(chamadas).toHaveLength(3);
  });

  it("não tenta renovar em 401 de login — ali o 401 é credencial errada", async () => {
    const chamadas = servidorFalso([() => resposta(401, { message: "Credenciais inválidas" })]);
    const { api } = await carregarApi();

    await expect(api.login("ana", "senha-errada")).rejects.toMatchObject({
      status: 401,
      message: "Credenciais inválidas",
    });
    expect(chamadas).toHaveLength(1);
  });

  it("usa a primeira mensagem quando a API responde uma lista de validação", async () => {
    servidorFalso([() => resposta(400, { message: ["username: muito curto"] })]);
    const { api } = await carregarApi();

    await expect(
      api.register({ email: "ana@exemplo.com", username: "ab", password: "Cavalo-Bateria-42" }),
    ).rejects.toMatchObject({
      status: 400,
      message: "username: muito curto",
    });
  });
});
