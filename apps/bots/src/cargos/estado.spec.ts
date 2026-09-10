import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DepositoDePaineis, normalizarEstado, type Painel } from "./estado";

function bancada(): DepositoDePaineis {
  const dir = mkdtempSync(join(tmpdir(), "cargos-"));
  const deposito = new DepositoDePaineis(dir);
  deposito.preparar();
  criados.push(deposito);
  return deposito;
}
const criados: DepositoDePaineis[] = [];
afterEach(() => {
  criados.length = 0;
});

const painel = (): Painel => ({
  canalId: "111",
  titulo: "Cargos",
  descricao: "",
  modo: "normal",
  criadoEm: new Date().toISOString(),
  itens: { "u:🎧": { cargoId: "cargo-1", rotulo: "Live", emoji: "🎧", paraReagir: "🎧" } },
});

describe("depósito", () => {
  it("grava e relê", () => {
    const d = bancada();
    d.editar("999", (e) => {
      e.paineis["555"] = painel();
    });
    // Um depósito **novo** no mesmo diretório: é o que a próxima subida faz.
    const outro = new DepositoDePaineis(d.caminho("999").replace(/\/999\.json$/, ""));
    expect(outro.ler("999").paineis["555"]?.itens["u:🎧"]?.cargoId).toBe("cargo-1");
  });

  it("o arquivo some quando o último painel é apagado", () => {
    const d = bancada();
    d.editar("999", (e) => {
      e.paineis["555"] = painel();
    });
    expect(existsSync(d.caminho("999"))).toBe(true);
    d.editar("999", (e) => {
      delete e.paineis["555"];
    });
    expect(existsSync(d.caminho("999"))).toBe(false);
    expect(d.servidoresConhecidos()).toEqual([]);
  });

  it("não deixa `.tmp` para trás (a escrita é `.tmp` + rename)", () => {
    const d = bancada();
    d.editar("999", (e) => {
      e.paineis["555"] = painel();
    });
    expect(existsSync(`${d.caminho("999")}.tmp`)).toBe(false);
  });

  it("servidor sem arquivo lê vazio em vez de lançar", () => {
    expect(bancada().ler("123").paineis).toEqual({});
  });

  it("id de servidor com `../` não escreve fora do volume", () => {
    expect(() => bancada().caminho("../../etc/passwd")).toThrow();
  });

  it("arquivo corrompido no meio não derruba a subida", () => {
    const d = bancada();
    d.editar("999", (e) => {
      e.paineis["555"] = painel();
    });
    const caminho = d.caminho("999");
    // um `docker stop` no meio de uma escrita **sem** rename produziria isto
    writeFileSync(caminho, readFileSync(caminho, "utf8").slice(0, 40));
    const outro = new DepositoDePaineis(caminho.replace(/\/999\.json$/, ""));
    expect(outro.ler("999").paineis).toEqual({});
  });

  it("lista os servidores que têm arquivo", () => {
    const d = bancada();
    d.editar("111", (e) => {
      e.paineis["a"] = painel();
    });
    d.editar("222", (e) => {
      e.paineis["b"] = painel();
    });
    expect(d.servidoresConhecidos().sort()).toEqual(["111", "222"]);
  });
});

describe("normalizarEstado — o que veio torto some, o resto vive", () => {
  it("item sem cargo é descartado, painel continua", () => {
    const estado = normalizarEstado({
      paineis: {
        "1": { canalId: "9", titulo: "T", itens: { "u:a": {}, "u:b": { cargoId: "c" } } },
      },
    });
    expect(Object.keys(estado.paineis["1"]!.itens)).toEqual(["u:b"]);
  });

  it("painel sem canal é descartado inteiro", () => {
    expect(normalizarEstado({ paineis: { "1": { titulo: "T" } } }).paineis).toEqual({});
  });

  it("modo que não existe vira `normal`", () => {
    const estado = normalizarEstado({ paineis: { "1": { canalId: "9", modo: "banana" } } });
    expect(estado.paineis["1"]!.modo).toBe("normal");
  });

  it("modo com acento é aceito (foi gravado por uma versão anterior)", () => {
    const estado = normalizarEstado({ paineis: { "1": { canalId: "9", modo: "único" } } });
    expect(estado.paineis["1"]!.modo).toBe("unico");
  });

  it("lixo puro vira estado vazio", () => {
    expect(normalizarEstado(null).paineis).toEqual({});
    expect(normalizarEstado("nada").paineis).toEqual({});
    expect(normalizarEstado({}).paineis).toEqual({});
  });
});
