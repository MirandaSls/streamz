import { describe, expect, it } from "vitest";
import type { PermissionOverwrite, Role } from "@streamz/shared";
import { alvosDasRegras, alvosDisponiveis, comparavel } from "./alvos";

function cargo(id: string, name: string, position: number, extra: Partial<Role> = {}): Role {
  return {
    id,
    guildId: "g1",
    name,
    color: null,
    position,
    permissions: 0,
    hoist: false,
    mentionable: false,
    isDefault: false,
    ...extra,
  };
}

const everyone = cargo("r0", "@everyone", 0, { isDefault: true });
const mods = cargo("r1", "Moderação", 5, { color: "#1abc9c" });
const bots = cargo("r2", "Bots", 2);
const cargos = [everyone, mods, bots];

const membros = [
  { id: "u1", nome: "Ana" },
  { id: "u2", nome: "Bruno" },
  { id: "u3", nome: "João" },
];

function regraDeCargo(roleId: string): PermissionOverwrite {
  return { roleId, userId: null, allow: 0, deny: 0 };
}
function regraDeMembro(userId: string): PermissionOverwrite {
  return { roleId: null, userId, allow: 0, deny: 0 };
}

describe("lista de alvos da tela de permissões", () => {
  it("mostra o @everyone mesmo quando nenhuma regra foi gravada ainda", () => {
    const alvos = alvosDasRegras([], cargos, membros);
    expect(alvos).toHaveLength(1);
    expect(alvos[0]).toMatchObject({ chave: "cargo:r0", padrao: true, nome: "@everyone" });
  });

  it("não duplica o @everyone quando ele já tem regra", () => {
    const alvos = alvosDasRegras([regraDeCargo("r0")], cargos, membros);
    expect(alvos.filter((a) => a.id === "r0")).toHaveLength(1);
  });

  it("ordena: @everyone, cargos do mais alto ao mais baixo, membros em ordem alfabética", () => {
    const alvos = alvosDasRegras(
      [regraDeMembro("u3"), regraDeCargo("r2"), regraDeMembro("u1"), regraDeCargo("r1")],
      cargos,
      membros,
    );
    expect(alvos.map((a) => a.chave)).toEqual([
      "cargo:r0",
      "cargo:r1", // Moderação, position 5
      "cargo:r2", // Bots, position 2
      "membro:u1", // Ana
      "membro:u3", // João
    ]);
  });

  it("mantém na lista a regra cujo cargo ou membro sumiu — senão não haveria como apagá-la", () => {
    const alvos = alvosDasRegras(
      [regraDeCargo("fantasma"), regraDeMembro("saiu")],
      cargos,
      membros,
    );
    expect(alvos.map((a) => a.nome)).toContain("Cargo removido");
    expect(alvos.map((a) => a.nome)).toContain("Membro desconhecido");
  });

  it("leva a cor do cargo para o pontinho da linha", () => {
    const alvos = alvosDasRegras([regraDeCargo("r1")], cargos, membros);
    expect(alvos.find((a) => a.id === "r1")?.cor).toBe("#1abc9c");
  });
});

describe("o que o + ainda pode oferecer", () => {
  it("esconde o @everyone e quem já tem regra", () => {
    const disponiveis = alvosDisponiveis([regraDeCargo("r1"), regraDeMembro("u1")], cargos, membros);
    expect(disponiveis.map((a) => a.chave)).toEqual(["cargo:r2", "membro:u2", "membro:u3"]);
  });

  it("filtra sem acento — era o caso do 'joao' que não achava o 'João'", () => {
    const disponiveis = alvosDisponiveis([], cargos, membros, "joao");
    expect(disponiveis.map((a) => a.id)).toEqual(["u3"]);
  });

  it("filtra sem diferenciar maiúsculas", () => {
    expect(alvosDisponiveis([], cargos, membros, "MODERA").map((a) => a.id)).toEqual(["r1"]);
  });

  it("sem filtro devolve tudo que ainda não tem regra, cargos antes de membros", () => {
    const disponiveis = alvosDisponiveis([], cargos, membros);
    expect(disponiveis.map((a) => a.chave)).toEqual([
      "cargo:r1",
      "cargo:r2",
      "membro:u1",
      "membro:u2",
      "membro:u3",
    ]);
  });
});

describe("texto comparável", () => {
  it("tira acento e caixa", () => {
    expect(comparavel("João Ção")).toBe("joao cao");
  });
});
