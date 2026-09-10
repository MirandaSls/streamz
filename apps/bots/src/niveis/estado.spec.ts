import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LojaDeNiveis, nomeDeArquivo } from "./estado";
import { sanearEstado } from "./dados";
import type { Log } from "../runtime/tipos";

const calado: Log = { debug: () => {}, info: () => {}, aviso: () => {}, erro: () => {} };
const lojas: LojaDeNiveis[] = [];

function comLoja(opcoes: { intervaloMs?: number; mudancasPorGravacao?: number } = {}) {
  const diretorio = mkdtempSync(join(tmpdir(), "niveis-"));
  const loja = new LojaDeNiveis({ diretorio, log: calado, intervaloMs: 3_600_000, ...opcoes });
  loja.iniciar();
  lojas.push(loja);
  return { loja, diretorio };
}

afterEach(async () => {
  for (const loja of lojas.splice(0)) await loja.desligar();
});

describe("nomeDeArquivo", () => {
  it("aceita snowflake e cuid", () => {
    expect(nomeDeArquivo("400090000000000123")).toBe("400090000000000123.json");
  });
  it("recusa travessia de diretório", () => {
    expect(() => nomeDeArquivo("../../etc/passwd")).toThrow();
    expect(() => nomeDeArquivo("a/b")).toThrow();
    expect(() => nomeDeArquivo("")).toThrow();
  });
});

describe("LojaDeNiveis", () => {
  it("servidor novo nasce vazio, sem arquivo no disco", () => {
    const { loja, diretorio } = comLoja();
    const estado = loja.estado("g1");
    expect(estado.usuarios).toEqual({});
    expect(estado.config.anuncio).toBe("mesmo");
    expect(readdirSync(diretorio)).toEqual([]);
  });

  it("só grava quando mandam: a mudança fica em memória até o gatilho", async () => {
    const { loja, diretorio } = comLoja({ mudancasPorGravacao: 1000 });
    loja.estado("g1").usuarios.ana = { xp: 40, mensagens: 2, ultimoGanhoEm: 1 };
    loja.marcarSujo("g1");
    expect(readdirSync(diretorio)).toEqual([]);

    await loja.gravarPendentes();
    expect(readdirSync(diretorio)).toEqual(["g1.json"]);
  });

  it("o contador de mudanças dispara a gravação sozinho", async () => {
    const { loja, diretorio } = comLoja({ mudancasPorGravacao: 3 });
    loja.estado("g1").usuarios.ana = { xp: 40, mensagens: 2, ultimoGanhoEm: 1 };
    loja.marcarSujo("g1");
    loja.marcarSujo("g1");
    expect(readdirSync(diretorio)).toEqual([]);
    loja.marcarSujo("g1");
    await loja.gravarPendentes();
    expect(readdirSync(diretorio)).toEqual(["g1.json"]);
  });

  it("o desligamento grava mesmo o que ninguém marcou", async () => {
    const { loja, diretorio } = comLoja({ mudancasPorGravacao: 1000 });
    loja.estado("g1").usuarios.ana = { xp: 7, mensagens: 1, ultimoGanhoEm: 1 };
    await loja.desligar();
    lojas.length = 0;
    const gravado = JSON.parse(readFileSync(join(diretorio, "g1.json"), "utf8"));
    expect(gravado.usuarios.ana.xp).toBe(7);
  });

  it("o que foi gravado volta igual numa loja nova", async () => {
    const { loja, diretorio } = comLoja();
    loja.estado("g1").usuarios.ana = { xp: 512, mensagens: 33, ultimoGanhoEm: 99 };
    loja.estado("g1").config.multiplicador = 2;
    loja.marcarSujo("g1");
    await loja.gravarPendentes();

    const outra = new LojaDeNiveis({ diretorio, log: calado });
    outra.iniciar();
    lojas.push(outra);
    expect(outra.estado("g1").usuarios.ana).toEqual({ xp: 512, mensagens: 33, ultimoGanhoEm: 99 });
    expect(outra.estado("g1").config.multiplicador).toBe(2);
  });

  it("não deixa arquivo temporário para trás", async () => {
    const { loja, diretorio } = comLoja();
    loja.estado("g1").usuarios.ana = { xp: 1, mensagens: 1, ultimoGanhoEm: 1 };
    loja.marcarSujo("g1");
    await loja.gravarPendentes();
    expect(readdirSync(diretorio).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("arquivo corrompido não derruba o bot nem é apagado", () => {
    const { loja, diretorio } = comLoja();
    writeFileSync(join(diretorio, "g1.json"), "{ isto não é json");
    expect(loja.estado("g1").usuarios).toEqual({});
    // o original continua lá para alguém olhar
    expect(readFileSync(join(diretorio, "g1.json"), "utf8")).toContain("isto não é json");
  });
});

describe("sanearEstado", () => {
  it("um arquivo editado na mão com lixo não vira NaN no XP de ninguém", () => {
    const saneado = sanearEstado({
      versao: 1,
      config: { anuncio: "invento", multiplicador: "muito", canaisIgnorados: [1, "c2"], cargosPorNivel: [{ nivel: 3 }] },
      usuarios: { ana: { xp: "cem" }, bia: { xp: 55.9, mensagens: -3 } },
    });
    expect(saneado.config.anuncio).toBe("mesmo");
    expect(saneado.config.multiplicador).toBe(1);
    expect(saneado.config.canaisIgnorados).toEqual(["c2"]);
    expect(saneado.config.cargosPorNivel).toEqual([]);
    expect(saneado.usuarios.ana!.xp).toBe(0);
    expect(saneado.usuarios.bia!).toEqual({ xp: 55, mensagens: 0, ultimoGanhoEm: 0 });
  });

  it("grampeia o multiplicador na faixa e ordena os cargos por nível", () => {
    const saneado = sanearEstado({
      config: {
        multiplicador: 99,
        cargosPorNivel: [
          { nivel: 10, cargoId: "r10" },
          { nivel: 2, cargoId: "r2" },
        ],
      },
    });
    expect(saneado.config.multiplicador).toBe(5);
    expect(saneado.config.cargosPorNivel.map((c) => c.nivel)).toEqual([2, 10]);
  });
});
