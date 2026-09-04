import { describe, expect, it } from "vitest";
import type { PublicUser } from "@streamz/shared";
import {
  CHAVE_COFRE,
  LIMITE_DE_CONTAS,
  ativarConta,
  atualizarPerfil,
  atualizarRefresh,
  cabeMaisUma,
  cofreVazio,
  contaAtiva,
  contaDe,
  escreverCofre,
  guardarConta,
  lerCofre,
  lerCofreDoDisco,
  marcarExpirada,
  mudarCofre,
  removerConta,
  type Cofre,
} from "../contas";

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

/** Cofre com N contas, todas com refresh vivo, a primeira ativa. */
function cofreCom(...ids: string[]): Cofre {
  return ids.reduce((c, id) => guardarConta(c, usuario(id), `r-${id}`), cofreVazio());
}

describe("lerCofre", () => {
  it("volta vazio para lixo, versão errada e formato estranho", () => {
    expect(lerCofre(null)).toEqual(cofreVazio());
    expect(lerCofre("{isto não é json")).toEqual(cofreVazio());
    expect(lerCofre("[]")).toEqual(cofreVazio());
    expect(lerCofre(JSON.stringify({ versao: 99, contas: [] }))).toEqual(cofreVazio());
    expect(lerCofre(JSON.stringify({ versao: 1 }))).toEqual(cofreVazio());
  });

  it("descarta entradas quebradas sem perder as boas", () => {
    const cofre = lerCofre(
      JSON.stringify({
        versao: 1,
        ativa: "a",
        contas: [
          null,
          { user: { id: "a", username: "ua" }, refreshToken: "r-a" },
          { user: { username: "sem id" }, refreshToken: "x" },
          { refreshToken: "sem user" },
        ],
      }),
    );
    expect(cofre.contas).toHaveLength(1);
    expect(cofre.ativa).toBe("a");
  });

  it("descarta duplicatas e a ativa que não existe mais", () => {
    const cofre = lerCofre(
      JSON.stringify({
        versao: 1,
        ativa: "sumiu",
        contas: [
          { user: { id: "a", username: "ua" }, refreshToken: "primeiro" },
          { user: { id: "a", username: "ua" }, refreshToken: "segundo" },
        ],
      }),
    );
    expect(cofre.contas).toHaveLength(1);
    expect(cofre.contas[0].refreshToken).toBe("primeiro");
    expect(cofre.ativa).toBeNull();
  });

  it("trata refresh vazio como sessão expirada", () => {
    const cofre = lerCofre(
      JSON.stringify({ versao: 1, ativa: "a", contas: [{ user: usuario("a"), refreshToken: "" }] }),
    );
    expect(cofre.contas[0].refreshToken).toBeNull();
  });
});

describe("guardarConta", () => {
  it("registra e ativa a conta nova, mantendo a ordem de chegada", () => {
    const cofre = cofreCom("a", "b", "c");
    expect(cofre.contas.map((c) => c.user.id)).toEqual(["a", "b", "c"]);
    expect(cofre.ativa).toBe("c");
  });

  it("reentrar numa conta já guardada troca o token e não duplica a linha", () => {
    const cofre = guardarConta(cofreCom("a", "b"), usuario("a"), "r-novo");
    expect(cofre.contas).toHaveLength(2);
    expect(contaDe(cofre, "a")?.refreshToken).toBe("r-novo");
    expect(cofre.ativa).toBe("a");
    // a ordem não dança: "a" continua sendo a primeira da lista
    expect(cofre.contas[0].user.id).toBe("a");
  });

  it("recusa a conta que passaria do limite, sem mexer no que havia", () => {
    const cheio = cofreCom(...Array.from({ length: LIMITE_DE_CONTAS }, (_, i) => `c${i}`));
    const depois = guardarConta(cheio, usuario("extra"), "r-extra");
    expect(depois.contas).toHaveLength(LIMITE_DE_CONTAS);
    expect(contaDe(depois, "extra")).toBeNull();
    expect(depois.ativa).toBe(cheio.ativa);
  });

  it("com o cofre cheio, atualizar uma conta que já está lá continua valendo", () => {
    const cheio = cofreCom(...Array.from({ length: LIMITE_DE_CONTAS }, (_, i) => `c${i}`));
    expect(cabeMaisUma(cheio)).toBe(false);
    expect(cabeMaisUma(cheio, "c0")).toBe(true);
    const depois = guardarConta(cheio, usuario("c0"), "r-renovado");
    expect(contaDe(depois, "c0")?.refreshToken).toBe("r-renovado");
    expect(depois.ativa).toBe("c0");
  });
});

describe("rotação e expiração", () => {
  it("atualizarRefresh troca só o token da conta indicada", () => {
    const cofre = atualizarRefresh(cofreCom("a", "b"), "a", "r-rodou");
    expect(contaDe(cofre, "a")?.refreshToken).toBe("r-rodou");
    expect(contaDe(cofre, "b")?.refreshToken).toBe("r-b");
    expect(cofre.ativa).toBe("b");
  });

  it("marcarExpirada deixa a conta na lista, sem token", () => {
    const cofre = marcarExpirada(cofreCom("a", "b"), "a");
    expect(contaDe(cofre, "a")).toEqual({ user: usuario("a"), refreshToken: null });
    expect(cofre.contas).toHaveLength(2);
  });

  it("ignora id desconhecido em vez de inventar linha", () => {
    const antes = cofreCom("a");
    expect(atualizarRefresh(antes, "z", "r")).toBe(antes);
    expect(marcarExpirada(antes, "z")).toBe(antes);
    expect(ativarConta(antes, "z")).toBe(antes);
    expect(atualizarPerfil(antes, usuario("z"))).toBe(antes);
  });

  it("atualizarPerfil troca o retrato preservando o token", () => {
    const novo = { ...usuario("a"), avatarUrl: "/avatares/a.png" };
    const cofre = atualizarPerfil(cofreCom("a"), novo);
    expect(contaDe(cofre, "a")?.user.avatarUrl).toBe("/avatares/a.png");
    expect(contaDe(cofre, "a")?.refreshToken).toBe("r-a");
  });
});

describe("removerConta", () => {
  it("saindo da conta ativa, a primeira das restantes assume", () => {
    const cofre = removerConta(ativarConta(cofreCom("a", "b", "c"), "b"), "b");
    expect(cofre.contas.map((c) => c.user.id)).toEqual(["a", "c"]);
    expect(cofre.ativa).toBe("a");
  });

  it("removendo uma conta de fundo, a ativa continua a mesma", () => {
    const cofre = removerConta(cofreCom("a", "b"), "a");
    expect(cofre.ativa).toBe("b");
  });

  it("a última conta deixa o cofre sem ativa", () => {
    expect(removerConta(cofreCom("a"), "a")).toEqual(cofreVazio());
  });

  it("id desconhecido não muda nada", () => {
    const antes = cofreCom("a");
    expect(removerConta(antes, "z")).toBe(antes);
  });
});

describe("contaAtiva", () => {
  it("devolve a conta apontada por `ativa`, ou null", () => {
    expect(contaAtiva(cofreCom("a", "b"))?.user.id).toBe("b");
    expect(contaAtiva(cofreVazio())).toBeNull();
  });
});

describe("disco", () => {
  it("grava e lê pela chave versionada", () => {
    localStorage.clear();
    escreverCofre(cofreCom("a"));
    expect(localStorage.getItem(CHAVE_COFRE)).toContain('"versao":1');
    expect(lerCofreDoDisco().contas.map((c) => c.user.id)).toEqual(["a"]);
  });

  it("mudarCofre aplica a transição e persiste o resultado", () => {
    localStorage.clear();
    escreverCofre(cofreCom("a", "b"));
    const depois = mudarCofre((c) => marcarExpirada(c, "a"));
    expect(depois.contas[0].refreshToken).toBeNull();
    expect(lerCofreDoDisco().contas[0].refreshToken).toBeNull();
  });

  it("chave corrompida no disco não derruba a leitura", () => {
    localStorage.setItem(CHAVE_COFRE, "{{{");
    expect(lerCofreDoDisco()).toEqual(cofreVazio());
  });
});
