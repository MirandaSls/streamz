import { describe, expect, it } from "vitest";
import type { GuildMemberView } from "@streamz/shared";
import {
  filtrarMembros,
  haQuantoTempo,
  numerosDePagina,
  ordenarMembros,
  paginar,
} from "./membros-tabela";

function membro(
  id: string,
  nome: string | null,
  joinedAt: string,
  roleIds: string[] = [],
): GuildMemberView {
  return {
    role: "MEMBER",
    roleIds,
    joinedAt,
    user: {
      id,
      username: id,
      displayName: nome,
      avatarUrl: null,
      status: "ONLINE",
      customStatusText: null,
      customStatusEmoji: null,
    },
  };
}

const bia = membro("bia", "Bia", "2026-01-01T00:00:00.000Z", ["mods"]);
const caio = membro("caio", "caio", "2026-03-01T00:00:00.000Z");
const ana = membro("ana", "Ana Paula", "2026-02-01T00:00:00.000Z", ["mods"]);
const lista = [bia, caio, ana];

describe("filtrarMembros", () => {
  it("acha pelo nome de exibição e pelo @usuário, sem caixa", () => {
    expect(filtrarMembros(lista, { busca: "ANA p", cargoId: "" })).toEqual([ana]);
    expect(filtrarMembros(lista, { busca: "caio", cargoId: "" })).toEqual([caio]);
  });

  it("filtra por cargo e combina com a busca", () => {
    expect(filtrarMembros(lista, { busca: "", cargoId: "mods" })).toEqual([bia, ana]);
    expect(filtrarMembros(lista, { busca: "bia", cargoId: "mods" })).toEqual([bia]);
    expect(filtrarMembros(lista, { busca: "caio", cargoId: "mods" })).toEqual([]);
  });

  it("busca só de espaços não filtra nada", () => {
    expect(filtrarMembros(lista, { busca: "   ", cargoId: "" })).toHaveLength(3);
  });
});

describe("ordenarMembros", () => {
  it("põe quem entrou por último no topo, e o contrário em 'antigos'", () => {
    expect(ordenarMembros(lista, "recentes").map((m) => m.user.id)).toEqual(["caio", "ana", "bia"]);
    expect(ordenarMembros(lista, "antigos").map((m) => m.user.id)).toEqual(["bia", "ana", "caio"]);
  });

  it("ordena por nome de exibição ignorando a caixa", () => {
    expect(ordenarMembros(lista, "nome").map((m) => m.user.id)).toEqual(["ana", "bia", "caio"]);
    expect(ordenarMembros(lista, "nome-desc").map((m) => m.user.id)).toEqual([
      "caio",
      "bia",
      "ana",
    ]);
  });

  it("não mexe no array que veio da store", () => {
    const original = [...lista];
    ordenarMembros(lista, "nome");
    expect(lista).toEqual(original);
  });

  it("desempata por id quando duas pessoas entraram no mesmo instante", () => {
    const mesmo = "2026-05-05T00:00:00.000Z";
    const a = membro("zeta", "Igual", mesmo);
    const b = membro("alfa", "Igual", mesmo);
    expect(ordenarMembros([a, b], "recentes").map((m) => m.user.id)).toEqual(["alfa", "zeta"]);
    expect(ordenarMembros([b, a], "recentes").map((m) => m.user.id)).toEqual(["alfa", "zeta"]);
  });
});

describe("paginar", () => {
  const cem = Array.from({ length: 100 }, (_, i) => i);

  it("fatia a página pedida", () => {
    expect(paginar(cem, 2, 12).itens).toEqual(cem.slice(12, 24));
    expect(paginar(cem, 1, 12).paginas).toBe(9);
  });

  it("grampeia a página acima do fim em vez de devolver vazio", () => {
    const p = paginar(cem, 99, 25);
    expect(p.pagina).toBe(4);
    expect(p.itens).toEqual(cem.slice(75));
  });

  it("grampeia página zero, negativa ou quebrada", () => {
    expect(paginar(cem, 0, 25).pagina).toBe(1);
    expect(paginar(cem, -3, 25).pagina).toBe(1);
    expect(paginar(cem, 2.7, 25).pagina).toBe(2);
  });

  it("lista vazia tem uma página, não zero", () => {
    expect(paginar([], 1, 12)).toEqual({ itens: [], paginas: 1, pagina: 1 });
  });
});

describe("numerosDePagina", () => {
  it("mostra tudo quando cabe", () => {
    expect(numerosDePagina(1, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("abre reticências dos dois lados no meio da lista", () => {
    expect(numerosDePagina(10, 20)).toEqual([1, null, 8, 9, 10, 11, 12, null, 20]);
  });

  it("encosta a janela no começo e no fim", () => {
    expect(numerosDePagina(1, 20)).toEqual([1, 2, 3, 4, 5, 6, null, 20]);
    expect(numerosDePagina(20, 20)).toEqual([1, null, 15, 16, 17, 18, 19, 20]);
  });
});

describe("haQuantoTempo", () => {
  const agora = new Date("2026-09-04T12:00:00.000Z");

  it("conta em dias, meses e anos como o print", () => {
    expect(haQuantoTempo("2026-09-04T09:00:00.000Z", agora)).toBe("hoje");
    expect(haQuantoTempo("2026-09-03T09:00:00.000Z", agora)).toBe("1 dia atrás");
    expect(haQuantoTempo("2026-08-06T12:00:00.000Z", agora)).toBe("29 dias atrás");
    expect(haQuantoTempo("2026-08-05T12:00:00.000Z", agora)).toBe("1 mês atrás");
    expect(haQuantoTempo("2026-07-04T12:00:00.000Z", agora)).toBe("2 meses atrás");
    expect(haQuantoTempo("2025-09-04T12:00:00.000Z", agora)).toBe("1 ano atrás");
    expect(haQuantoTempo("2018-09-04T12:00:00.000Z", agora)).toBe("8 anos atrás");
  });

  it("data inválida vira traço em vez de NaN na tela", () => {
    expect(haQuantoTempo("nunca", agora)).toBe("—");
  });
});
