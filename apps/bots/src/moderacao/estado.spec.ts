import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  VERSAO,
  arquivoDe,
  avisosDe,
  canalDeRegistro,
  definirCanalDeRegistro,
  esquecer,
  guardarAviso,
  ler,
  limparAvisos,
  normalizar,
} from "./estado";

const SERVIDOR = "123456789012345678";
let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), "moderacao-"));
  process.env.BOTS_DADOS_DIR = pasta;
  esquecer();
});

afterEach(() => {
  delete process.env.BOTS_DADOS_DIR;
  esquecer();
});

describe("arquivoDe", () => {
  it("um arquivo por servidor, dentro do volume", () => {
    expect(arquivoDe(SERVIDOR)).toBe(join(pasta, `${SERVIDOR}.json`));
  });

  it("não deixa um id escrever fora do volume", () => {
    // O id vem da nossa API hoje. O dia em que vier de outro lugar não pode ser
    // o dia em que `../../etc/algo` vira caminho de escrita.
    expect(arquivoDe("../../etc/passwd")).toBe(join(pasta, "etcpasswd.json"));
    expect(() => arquivoDe("///")).toThrow(/inválido/);
  });
});

describe("avisos", () => {
  it("guarda, lista e conta", async () => {
    const um = await guardarAviso(SERVIDOR, "alvo", {
      moderadorId: "mod",
      moderadorNome: "moderadora",
      motivo: "spam",
      quando: 1000,
    });
    const dois = await guardarAviso(SERVIDOR, "alvo", {
      moderadorId: "mod",
      moderadorNome: "moderadora",
      motivo: "de novo",
      quando: 2000,
    });
    expect(um.id).toBe(1);
    expect(dois.id).toBe(2);
    expect(await avisosDe(SERVIDOR, "alvo")).toHaveLength(2);
    expect(await avisosDe(SERVIDOR, "outro")).toHaveLength(0);
  });

  it("sobrevive a um reinício do processo", async () => {
    await guardarAviso(SERVIDOR, "alvo", {
      moderadorId: "mod",
      moderadorNome: "moderadora",
      motivo: "spam",
      quando: 1000,
    });
    esquecer(); // o equivalente a subir o container de novo
    const lidos = await avisosDe(SERVIDOR, "alvo");
    expect(lidos).toHaveLength(1);
    expect(lidos[0]!.motivo).toBe("spam");
  });

  it("dois avisos ao mesmo tempo não se atropelam", async () => {
    // Leitura-modificação-escrita sem fila perde um dos dois em silêncio — e o
    // moderador só descobre quando o `/avisos` mostra um a menos.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        guardarAviso(SERVIDOR, "alvo", {
          moderadorId: "mod",
          moderadorNome: "moderadora",
          motivo: `n${i}`,
          quando: i,
        }),
      ),
    );
    const lidos = await avisosDe(SERVIDOR, "alvo");
    expect(lidos).toHaveLength(10);
    expect(new Set(lidos.map((a) => a.id)).size).toBe(10);
  });

  it("limparAvisos devolve quantos apagou e não reaproveita o id", async () => {
    await guardarAviso(SERVIDOR, "alvo", { moderadorId: "m", moderadorNome: "m", motivo: "a", quando: 1 });
    await guardarAviso(SERVIDOR, "alvo", { moderadorId: "m", moderadorNome: "m", motivo: "b", quando: 2 });
    expect(await limparAvisos(SERVIDOR, "alvo")).toBe(2);
    expect(await avisosDe(SERVIDOR, "alvo")).toHaveLength(0);
    const novo = await guardarAviso(SERVIDOR, "alvo", {
      moderadorId: "m",
      moderadorNome: "m",
      motivo: "c",
      quando: 3,
    });
    // `#1` reaproveitado apontaria dois avisos diferentes no registro publicado.
    expect(novo.id).toBe(3);
  });
});

describe("canal de registro", () => {
  it("guarda e apaga", async () => {
    expect(await canalDeRegistro(SERVIDOR)).toBeNull();
    await definirCanalDeRegistro(SERVIDOR, "999");
    esquecer();
    expect(await canalDeRegistro(SERVIDOR)).toBe("999");
    await definirCanalDeRegistro(SERVIDOR, null);
    expect(await canalDeRegistro(SERVIDOR)).toBeNull();
  });
});

describe("a escrita é atômica", () => {
  it("não deixa temporário para trás e grava com modo 600", async () => {
    await definirCanalDeRegistro(SERVIDOR, "999");
    const arquivos = await readdir(pasta);
    expect(arquivos).toEqual([`${SERVIDOR}.json`]);
    const corpo = JSON.parse(await readFile(arquivoDe(SERVIDOR), "utf8"));
    expect(corpo.versao).toBe(VERSAO);
  });
});

describe("normalizar", () => {
  it("um arquivo estragado não derruba o bot — vira estado vazio", async () => {
    await writeFile(arquivoDe(SERVIDOR), "{ isso não é json", "utf8");
    const estado = await ler(SERVIDOR);
    expect(estado.avisos).toEqual({});
    expect(estado.canalDeRegistro).toBeNull();
  });

  it("descarta aviso sem forma, mantém o resto do arquivo", () => {
    const estado = normalizar({
      versao: 1,
      canalDeRegistro: "9",
      proximoAviso: 1,
      avisos: {
        alvo: [
          { id: 1, moderadorId: "m", moderadorNome: "m", motivo: "ok", quando: 5 },
          { lixo: true },
          null,
        ],
      },
    });
    expect(estado.avisos.alvo).toHaveLength(1);
    expect(estado.canalDeRegistro).toBe("9");
  });

  it("o contador nunca anda para trás, mesmo com o arquivo mentindo", () => {
    const estado = normalizar({
      proximoAviso: 1,
      avisos: { alvo: [{ id: 7, moderadorId: "m", moderadorNome: "m", motivo: "x", quando: 1 }] },
    });
    expect(estado.proximoAviso).toBe(8);
  });
});
