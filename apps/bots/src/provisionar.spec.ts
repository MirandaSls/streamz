import { describe, expect, it } from "vitest";
import { acharAplicacao } from "./provisionar";

const app = (id: string, name: string) => ({ id, name, description: null });

describe("acharAplicacao", () => {
  it("acha pelo nome atual", () => {
    const r = acharAplicacao([app("1", "Música")], { nome: "Música" });
    expect(r?.id).toBe("1");
  });

  it("acha pelo nome antigo quando o atual não existe", () => {
    const r = acharAplicacao([app("1", "Tocador")], { nome: "Música", nomesAnteriores: ["Tocador"] });
    expect(r?.id).toBe("1");
  });

  it("devolve undefined quando nenhum nome bate", () => {
    const r = acharAplicacao([app("1", "Outro")], { nome: "Música", nomesAnteriores: ["Tocador"] });
    expect(r).toBeUndefined();
  });

  it("prefere o nome atual quando atual e antigo existem", () => {
    const r = acharAplicacao([app("1", "Tocador"), app("2", "Música")], {
      nome: "Música",
      nomesAnteriores: ["Tocador"],
    });
    expect(r?.id).toBe("2");
  });
});
