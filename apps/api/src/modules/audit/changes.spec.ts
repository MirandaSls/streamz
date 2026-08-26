import { describe, expect, it } from "vitest";
import { diffChanges } from "./changes";

interface Canal {
  name: string | null;
  readOnly: boolean;
  welcomeChannelIds: string[];
}

describe("diferença registrada na auditoria", () => {
  it("registra só o campo que mudou", () => {
    const changes = diffChanges<Canal>(
      { name: "geral", readOnly: false },
      { name: "avisos", readOnly: false },
      ["name", "readOnly"],
    );
    expect(changes).toEqual([{ field: "name", before: "geral", after: "avisos" }]);
  });

  it("ignora campo ausente no patch — não mexer não é mudar", () => {
    const changes = diffChanges<Canal>({ name: "geral", readOnly: false }, { readOnly: true }, [
      "name",
      "readOnly",
    ]);
    expect(changes).toEqual([{ field: "readOnly", before: false, after: true }]);
  });

  it("trata undefined e null como o mesmo 'vazio'", () => {
    expect(diffChanges<Canal>({}, { name: null }, ["name"])).toEqual([]);
  });

  it("compara listas pelo conteúdo, não pela referência", () => {
    expect(
      diffChanges<Canal>({ welcomeChannelIds: ["a", "b"] }, { welcomeChannelIds: ["a", "b"] }, [
        "welcomeChannelIds",
      ]),
    ).toEqual([]);
    expect(
      diffChanges<Canal>({ welcomeChannelIds: ["a"] }, { welcomeChannelIds: ["a", "b"] }, [
        "welcomeChannelIds",
      ]),
    ).toHaveLength(1);
  });

  it("respeita a ordem da lista (a ordem dos destaques importa)", () => {
    expect(
      diffChanges<Canal>({ welcomeChannelIds: ["a", "b"] }, { welcomeChannelIds: ["b", "a"] }, [
        "welcomeChannelIds",
      ]),
    ).toHaveLength(1);
  });

  it("não vaza campo fora da lista declarada", () => {
    const changes = diffChanges<Canal>({ name: "x" }, { name: "y", readOnly: true }, ["name"]);
    expect(changes.map((c) => c.field)).toEqual(["name"]);
  });
});
