import { beforeEach, describe, expect, it, vi } from "vitest";
import { jwtComExp, resposta } from "./ajudantes";
import { navegacao } from "../../test/ambiente";

/** Importa `session.ts` zerado (o single-flight é estado de módulo). */
async function carregarSession() {
  vi.resetModules();
  return import("../session");
}

const TOKENS_NOVOS = { accessToken: "access-novo", refreshToken: "refresh-novo" };

beforeEach(() => {
  localStorage.setItem("accessToken", jwtComExp(Date.now() + 15 * 60_000));
  localStorage.setItem("refreshToken", "refresh-antigo");
});

/**
 * `sid` é o que deixa `sessions.revoked` derrubar **esta** aba e só ela: o
 * evento chega a todas as conexões da conta com os ids encerrados, e cada uma
 * se reconhece (ou não) pelo próprio token.
 */
describe("sidDoToken", () => {
  it("lê a sessão que emitiu o token", async () => {
    const { sidDoToken } = await carregarSession();
    expect(sidDoToken(jwtComExp(Date.now() + 60_000, "sessao-1"))).toBe("sessao-1");
  });

  it("token antigo (sem a claim) devolve null — só o `all` o derruba", async () => {
    const { sidDoToken } = await carregarSession();
    expect(sidDoToken(jwtComExp(Date.now() + 60_000))).toBeNull();
    expect(sidDoToken("nao-e-jwt")).toBeNull();
  });

  it("`sidDaSessaoAtual` lê o access token guardado", async () => {
    localStorage.setItem("accessToken", jwtComExp(Date.now() + 60_000, "sessao-9"));
    const { sidDaSessaoAtual } = await carregarSession();
    expect(sidDaSessaoAtual()).toBe("sessao-9");
  });
});

describe("expDoToken", () => {
  it("lê o exp do payload em milissegundos", async () => {
    const { expDoToken } = await carregarSession();
    const expEmMs = Math.floor((Date.now() + 60_000) / 1000) * 1000;
    expect(expDoToken(jwtComExp(expEmMs))).toBe(expEmMs);
  });

  it("devolve null para token sem payload legível", async () => {
    const { expDoToken } = await carregarSession();
    expect(expDoToken("token-solto")).toBeNull();
    expect(expDoToken("a.nao-e-base64-json.c")).toBeNull();
    expect(expDoToken(`a.${Buffer.from("{}").toString("base64url")}.c`)).toBeNull();
  });
});

describe("precisaRenovar", () => {
  it("renova quando falta menos de um minuto para o exp", async () => {
    const { precisaRenovar } = await carregarSession();
    const agora = Date.now();
    expect(precisaRenovar(jwtComExp(agora + 30_000), agora)).toBe(true);
    expect(precisaRenovar(jwtComExp(agora - 1_000), agora)).toBe(true);
    expect(precisaRenovar(jwtComExp(agora + 5 * 60_000), agora)).toBe(false);
  });

  it("não renova token sem exp — quem decide a validade é a API", async () => {
    const { precisaRenovar } = await carregarSession();
    expect(precisaRenovar("sem.payload.valido")).toBe(false);
  });
});

describe("renovarTokens (single-flight)", () => {
  it("compartilha uma única requisição entre chamadas concorrentes", async () => {
    const { renovarTokens } = await carregarSession();
    let resolver: (r: Response) => void = () => {};
    const fetchMock = vi.fn(
      () => new Promise<Response>((r) => (resolver = r)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const chamadas = [renovarTokens(), renovarTokens(), renovarTokens()];
    resolver(resposta(200, TOKENS_NOVOS));
    const resultados = await Promise.all(chamadas);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const r of resultados) expect(r).toEqual(TOKENS_NOVOS);
    expect(localStorage.getItem("accessToken")).toBe("access-novo");
    expect(localStorage.getItem("refreshToken")).toBe("refresh-novo");
  });

  it("libera a promessa depois de concluída — a próxima renovação vai à rede", async () => {
    const { renovarTokens } = await carregarSession();
    const fetchMock = vi.fn(async () => resposta(200, TOKENS_NOVOS));
    vi.stubGlobal("fetch", fetchMock);

    await renovarTokens();
    await renovarTokens();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("encerra a sessão quando o refresh é recusado", async () => {
    const { renovarTokens, aoExpirarSessao } = await carregarSession();
    vi.stubGlobal("fetch", vi.fn(async () => resposta(401, { message: "inválido" })));
    const ouvinte = vi.fn();
    aoExpirarSessao(ouvinte);

    await expect(renovarTokens()).rejects.toMatchObject({ status: 401 });

    expect(ouvinte).toHaveBeenCalledOnce();
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
    expect(navegacao.destino).toBe("/login");
  });

  it("falha de rede não derruba a sessão", async () => {
    const { renovarTokens, aoExpirarSessao } = await carregarSession();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("failed to fetch");
    }));
    const ouvinte = vi.fn();
    aoExpirarSessao(ouvinte);

    await expect(renovarTokens()).rejects.toMatchObject({ status: 0 });

    expect(ouvinte).not.toHaveBeenCalled();
    expect(localStorage.getItem("refreshToken")).toBe("refresh-antigo");
  });
});

describe("getAccessToken", () => {
  it("devolve o token atual quando ainda falta muito para expirar", async () => {
    const { getAccessToken } = await carregarSession();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getAccessToken()).toBe(localStorage.getItem("accessToken"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renova antes da hora quando o exp está perto", async () => {
    const { getAccessToken } = await carregarSession();
    localStorage.setItem("accessToken", jwtComExp(Date.now() + 10_000));
    vi.stubGlobal("fetch", vi.fn(async () => resposta(200, TOKENS_NOVOS)));

    expect(await getAccessToken()).toBe("access-novo");
  });

  it("devolve null quando não há sessão", async () => {
    const { getAccessToken } = await carregarSession();
    localStorage.clear();
    expect(await getAccessToken()).toBeNull();
  });
});
