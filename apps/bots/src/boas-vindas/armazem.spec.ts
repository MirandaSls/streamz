import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Armazem, nomeDoArquivo } from "./armazem";
import { configuracaoPadrao } from "./configuracao";

const criados: string[] = [];
async function bancada(): Promise<Armazem> {
  const dir = await mkdtemp(join(tmpdir(), "boas-vindas-"));
  criados.push(dir);
  return new Armazem(dir);
}

afterEach(() => {
  criados.length = 0;
});

describe("nomeDoArquivo", () => {
  it("aceita snowflake", () => {
    expect(nomeDoArquivo("1234567890")).toBe("1234567890.json");
  });
  it("recusa qualquer coisa que vire caminho", () => {
    for (const mau of ["../x", "a/b", "", "12a", "."]) {
      expect(() => nomeDoArquivo(mau)).toThrow();
    }
  });
});

describe("Armazem", () => {
  it("servidor sem arquivo devolve o padrão, sem lançar", async () => {
    const a = await bancada();
    expect(await a.ler("1")).toEqual(configuracaoPadrao());
  });

  it("grava e lê de volta", async () => {
    const a = await bancada();
    const nova = await a.atualizar("1", (c) => ({
      ...c,
      entrada: { ...c.entrada, canalId: "77", ligado: true, mensagem: "oi {nome}" },
    }));
    expect(nova.entrada.ligado).toBe(true);
    expect((await a.ler("1")).entrada.mensagem).toBe("oi {nome}");
  });

  it("não deixa temporário para trás", async () => {
    const a = await bancada();
    await a.gravar("5", configuracaoPadrao());
    const arquivos = await readdir(criados[criados.length - 1]!);
    expect(arquivos).toEqual(["5.json"]);
  });

  it("arquivo corrompido vira o padrão, não uma exceção", async () => {
    const a = await bancada();
    await a.gravar("9", configuracaoPadrao());
    await writeFile(join(criados[criados.length - 1]!, "9.json"), "{ isto não é json");
    expect(await a.ler("9")).toEqual(configuracaoPadrao());
  });

  it("duas atualizações no mesmo servidor não se atropelam", async () => {
    // Sem a fila, as duas leem o mesmo estado e a segunda apaga a primeira.
    const a = await bancada();
    await Promise.all([
      a.atualizar("3", (c) => ({ ...c, entrada: { ...c.entrada, canalId: "1", ligado: true } })),
      a.atualizar("3", (c) => ({ ...c, autorole: { ligado: true, cargoId: "2" } })),
    ]);
    const final = await a.ler("3");
    expect(final.entrada.ligado).toBe(true);
    expect(final.autorole.ligado).toBe(true);
  });

  it("o arquivo é JSON legível (dá para conferir e editar à mão)", async () => {
    const a = await bancada();
    await a.gravar("8", configuracaoPadrao());
    const cru = await readFile(join(criados[criados.length - 1]!, "8.json"), "utf8");
    expect(JSON.parse(cru).versao).toBe(1);
    expect(cru.endsWith("\n")).toBe(true);
  });
});
