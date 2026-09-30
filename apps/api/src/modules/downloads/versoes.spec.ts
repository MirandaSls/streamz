import { describe, expect, it } from "vitest";
import type { EntradaInstalador } from "./instalador";
import { listarVersoes, versaoDoNome } from "./versoes";

function entrada(nome: string, mtime = "2026-09-15T12:00:00Z", tamanho = 1): EntradaInstalador {
  return { nome, mtime: new Date(mtime), tamanho };
}

describe("versaoDoNome", () => {
  it("extrai x.y.z do nome do instalador", () => {
    expect(versaoDoNome("Streamz_1.3.19_universal.dmg")).toBe("1.3.19");
  });

  it("nome fora do padrão devolve null", () => {
    expect(versaoDoNome("README.txt")).toBeNull();
    expect(versaoDoNome("Outro_1.0.0_x64.exe")).toBeNull();
    expect(versaoDoNome("Streamz_beta_x64.exe")).toBeNull();
  });
});

describe("listarVersoes", () => {
  it("ordena numericamente: 1.3.10 vem antes de 1.3.9", () => {
    const lista = listarVersoes(
      [
        entrada("Streamz_1.3.9_x64-setup.exe"),
        entrada("Streamz_1.3.10_x64-setup.exe"),
        entrada("Streamz_1.2.20_x64-setup.exe"),
      ],
      [".exe", ".msi"],
    );
    expect(lista.map((v) => v.versao)).toEqual(["1.3.10", "1.3.9", "1.2.20"]);
  });

  it("na mesma versão, .dmg vence .pkg mesmo mais novo", () => {
    const lista = listarVersoes(
      [
        entrada("Streamz_1.3.19_universal.pkg", "2026-09-16T12:00:00Z"),
        entrada("Streamz_1.3.19_universal.dmg", "2026-09-10T12:00:00Z"),
      ],
      [".dmg", ".pkg"],
    );
    expect(lista).toHaveLength(1);
    expect(lista[0]?.nome).toBe("Streamz_1.3.19_universal.dmg");
  });

  it("ignora nome sem versão, .sig e .app.tar.gz", () => {
    const lista = listarVersoes(
      [
        entrada("README.txt"),
        entrada("Streamz_universal.dmg"),
        entrada("Streamz_1.3.19_universal.dmg.sig"),
        entrada("Streamz_1.3.19_universal.app.tar.gz"),
        entrada("Streamz_1.3.18_universal.dmg", "2026-09-10T12:00:00Z", 42),
      ],
      [".dmg", ".pkg"],
    );
    expect(lista).toEqual([
      {
        versao: "1.3.18",
        nome: "Streamz_1.3.18_universal.dmg",
        mtime: new Date("2026-09-10T12:00:00Z"),
        tamanho: 42,
      },
    ]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(listarVersoes([], [".dmg", ".pkg"])).toEqual([]);
  });
});
