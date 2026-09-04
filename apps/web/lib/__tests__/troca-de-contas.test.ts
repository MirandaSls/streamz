import { describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@streamz/shared";
import { resposta } from "./ajudantes";
import { navegacao } from "../../test/ambiente";
import {
  CHAVE_COFRE,
  cofreVazio,
  escreverCofre,
  guardarConta,
  lerCofreDoDisco,
  marcarExpirada,
  type Cofre,
} from "../contas";
import { planoDeTroca } from "../troca-de-contas";

function usuario(id: string): PublicUser {
  return {
    id,
    username: `u${id}`,
    displayName: null,
    avatarUrl: null,
    status: "ONLINE",
    customStatusText: null,
    customStatusEmoji: null,
  };
}

function cofreCom(...ids: string[]): Cofre {
  return ids.reduce((c, id) => guardarConta(c, usuario(id), `r-${id}`), cofreVazio());
}

describe("planoDeTroca", () => {
  it("a conta em uso não tem para onde ir", () => {
    expect(planoDeTroca(cofreCom("a", "b"), "b")).toEqual({ tipo: "ja-ativa" });
  });

  it("id fora do cofre é `desconhecida`, não um erro", () => {
    expect(planoDeTroca(cofreCom("a"), "z")).toEqual({ tipo: "desconhecida" });
  });

  it("sem refresh vivo, a troca de um clique vira pedido de senha", () => {
    const cofre = marcarExpirada(cofreCom("a", "b"), "a");
    expect(planoDeTroca(cofre, "a")).toEqual({ tipo: "pedir-senha", user: usuario("a") });
  });

  it("com refresh vivo, entrega o token da conta de destino", () => {
    expect(planoDeTroca(cofreCom("a", "b"), "a")).toEqual({
      tipo: "trocar",
      user: usuario("a"),
      refreshToken: "r-a",
    });
  });
});

/**
 * `trocarDeConta` fala com a API, o cofre e o `location`. Os módulos são
 * recarregados a cada teste porque `api` é um singleton e o mock do `fetch`
 * precisa estar de pé antes do primeiro uso.
 */
async function carregar() {
  vi.resetModules();
  return import("../troca-de-contas");
}

const TOKENS = { accessToken: "access-b", refreshToken: "refresh-b-rodado" };

describe("trocarDeConta", () => {
  it("renova com o token da outra conta, ativa no cofre e recarrega o app", async () => {
    escreverCofre(cofreCom("a", "b"));
    // "b" entrou por último e está ativa; a troca vai para "a"
    const perfilNovo = { ...usuario("a"), displayName: "Nome Novo" };
    const chamadas: { url: string; body: unknown; auth?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        chamadas.push({
          url,
          body: init?.body ? JSON.parse(init.body as string) : null,
          auth: headers.Authorization,
        });
        return resposta(200, url.endsWith("/auth/refresh") ? TOKENS : perfilNovo);
      }),
    );
    const { trocarDeConta } = await carregar();
    expect(await trocarDeConta("a")).toEqual({ ok: true });

    // o refresh saiu com o token guardado da conta de destino, não com o ativo
    expect(chamadas[0].url).toContain("/auth/refresh");
    expect(chamadas[0].body).toEqual({ refreshToken: "r-a" });
    // e o perfil foi lido com o access token recém-emitido
    expect(chamadas[1].url).toContain("/users/me");
    expect(chamadas[1].auth).toBe("Bearer access-b");

    const cofre = lerCofreDoDisco();
    expect(cofre.ativa).toBe("a");
    // o refresh rotacionado ficou guardado: sem isto a volta para "a" falharia
    expect(cofre.contas.find((c) => c.user.id === "a")?.refreshToken).toBe(TOKENS.refreshToken);
    // o retrato veio da API, não do que estava no cofre
    expect(cofre.contas.find((c) => c.user.id === "a")?.user.displayName).toBe("Nome Novo");
    // "b" continua guardada e intacta — trocar não desloga ninguém
    expect(cofre.contas.find((c) => c.user.id === "b")?.refreshToken).toBe("r-b");

    expect(localStorage.getItem("accessToken")).toBe(TOKENS.accessToken);
    expect(navegacao.destino).toBe("/app");
  });

  it("refresh recusado marca só a outra conta como expirada e preserva a ativa", async () => {
    escreverCofre(cofreCom("a", "b"));
    localStorage.setItem("accessToken", "access-de-b");
    localStorage.setItem("refreshToken", "r-b");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(401, { message: "nope" })),
    );
    const { trocarDeConta } = await carregar();
    expect(await trocarDeConta("a")).toEqual({ ok: false, motivo: "pedir-senha" });

    const cofre = lerCofreDoDisco();
    expect(cofre.contas.find((c) => c.user.id === "a")?.refreshToken).toBeNull();
    // a sessão em uso não foi tocada: nem tokens apagados, nem ida ao /login
    expect(cofre.ativa).toBe("b");
    expect(localStorage.getItem("refreshToken")).toBe("r-b");
    expect(navegacao.destino).toBeNull();
  });

  it("não tenta trocar para a conta que já está ativa", async () => {
    escreverCofre(cofreCom("a", "b"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { trocarDeConta } = await carregar();
    expect(await trocarDeConta("b")).toEqual({ ok: false, motivo: "ja-ativa" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("se o perfil falhar depois do refresh, guarda o token rodado e não troca", async () => {
    escreverCofre(cofreCom("a", "b"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/auth/refresh") ? resposta(200, TOKENS) : resposta(500, {}),
      ),
    );
    const { trocarDeConta } = await carregar();
    expect(await trocarDeConta("a")).toEqual({ ok: false, motivo: "falhou" });

    const cofre = lerCofreDoDisco();
    // o token velho de "a" já morreu do lado da API: guardar o novo é o que
    // evita marcar como expirada uma conta que na verdade está viva
    expect(cofre.contas.find((c) => c.user.id === "a")?.refreshToken).toBe(TOKENS.refreshToken);
    expect(cofre.ativa).toBe("b");
    expect(navegacao.destino).toBeNull();
  });
});

describe("sairDaConta", () => {
  it("revoga o refresh daquela conta e tira do cofre, sem tocar na ativa", async () => {
    escreverCofre(cofreCom("a", "b"));
    localStorage.setItem("refreshToken", "r-b");
    const corpos: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        corpos.push(JSON.parse(init?.body as string));
        return resposta(200, { ok: true });
      }),
    );

    const { sairDaConta } = await carregar();
    expect(await sairDaConta("a")).toBe("b");
    expect(corpos).toEqual([{ refreshToken: "r-a" }]);

    const cofre = lerCofreDoDisco();
    expect(cofre.contas.map((c) => c.user.id)).toEqual(["b"]);
    expect(localStorage.getItem("refreshToken")).toBe("r-b");
  });

  it("conta sem token não chama a API — não há o que revogar", async () => {
    escreverCofre(marcarExpirada(cofreCom("a", "b"), "a"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sairDaConta } = await carregar();
    expect(await sairDaConta("a")).toBe("b");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saindo da última conta, o cofre fica sem ativa", async () => {
    escreverCofre(cofreCom("a"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(200, { ok: true })),
    );
    const { sairDaConta } = await carregar();
    expect(await sairDaConta("a")).toBeNull();
    expect(lerCofreDoDisco()).toEqual(cofreVazio());
  });
});

describe("esquecerConta", () => {
  it("tira do cofre sem falar com a API", async () => {
    escreverCofre(cofreCom("a", "b"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { esquecerConta } = await carregar();
    expect(esquecerConta("a")).toBe("b");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(CHAVE_COFRE)).not.toContain('"ua"');
  });
});
