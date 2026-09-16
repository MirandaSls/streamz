import { describe, expect, it } from "vitest";
import { filtrarCargos, type CargoParaSelecao } from "./SeletorDeCargo";

const CARGOS: CargoParaSelecao[] = [
  { id: "1", name: "DONO", color: "#f1c40f" },
  { id: "2", name: "GABI", color: "#e91e63" },
  { id: "3", name: "CORNO", color: null },
  { id: "4", name: "CRIA", color: "#e74c3c" },
  { id: "5", name: "DJ AAAAZEITONA", color: "#e74c3c" },
];

describe("filtrarCargos", () => {
  it("busca vazia devolve a lista inteira, na mesma ordem", () => {
    expect(filtrarCargos(CARGOS, "")).toEqual(CARGOS);
  });

  it("filtra por trecho do nome, sem se importar com caixa", () => {
    expect(filtrarCargos(CARGOS, "gabi").map((c) => c.id)).toEqual(["2"]);
    expect(filtrarCargos(CARGOS, "GaBi").map((c) => c.id)).toEqual(["2"]);
  });

  it("ignora acento na busca e no nome", () => {
    const cargos: CargoParaSelecao[] = [{ id: "9", name: "Órfã" }];
    expect(filtrarCargos(cargos, "orfa")).toEqual(cargos);
    expect(filtrarCargos(cargos, "órfã")).toEqual(cargos);
  });

  it("casa por trecho no meio do nome, não só no começo", () => {
    expect(filtrarCargos(CARGOS, "zeitona").map((c) => c.id)).toEqual(["5"]);
  });

  it("espaços nas pontas não afetam a busca", () => {
    expect(filtrarCargos(CARGOS, "  cria  ").map((c) => c.id)).toEqual(["4"]);
  });

  it("sem casar nenhum cargo devolve lista vazia", () => {
    expect(filtrarCargos(CARGOS, "xyz")).toEqual([]);
  });

  it("não muta a lista recebida", () => {
    const copia = [...CARGOS];
    filtrarCargos(CARGOS, "gabi");
    expect(CARGOS).toEqual(copia);
  });
});
