import { describe, expect, it } from "vitest";
import {
  LADO_DA_MINIATURA,
  classeDaPilula,
  coresDaPasta,
  miniaturasDaPasta,
  rotuloDaPasta,
  siglaDoServidor,
} from "./PastaDoRail";

const servidor = (id: string, name: string, iconUrl: string | null = null) => ({ id, name, iconUrl });

describe("siglaDoServidor", () => {
  it("pega a inicial de cada palavra, em maiúsculas", () => {
    expect(siglaDoServidor("Mansão dev")).toBe("MD");
  });

  it("para em quatro letras", () => {
    expect(siglaDoServidor("a b c d e f")).toBe("ABCD");
  });

  it("ignora espaços sobrando e nome vazio", () => {
    expect(siglaDoServidor("  fazenda   feliz ")).toBe("FF");
    expect(siglaDoServidor("   ")).toBe("");
  });
});

describe("miniaturasDaPasta", () => {
  it("usa só os quatro primeiros servidores, na ordem da pasta", () => {
    const minis = miniaturasDaPasta([
      servidor("1", "Um"),
      servidor("2", "Dois"),
      servidor("3", "Três"),
      servidor("4", "Quatro"),
      servidor("5", "Cinco"),
    ]);
    expect(minis.map((m) => m.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("imagem quando o servidor tem ícone, sigla quando não tem", () => {
    const [comIcone, semIcone] = miniaturasDaPasta([
      servidor("1", "Fazenda", "https://cdn/icone.png"),
      servidor("2", "Mansão Dev"),
    ]);
    expect(comIcone.imagem).toBe("https://cdn/icone.png");
    expect(semIcone.imagem).toBeNull();
    expect(semIcone.sigla).toBe("MD");
  });

  it("trata ícone vazio como sem ícone", () => {
    expect(miniaturasDaPasta([servidor("1", "X", "")])[0].imagem).toBeNull();
  });

  it("arredonda 13 só o canto que encosta no canto da pasta", () => {
    const minis = miniaturasDaPasta([
      servidor("1", "A"),
      servidor("2", "B"),
      servidor("3", "C"),
      servidor("4", "D"),
    ]);
    expect(minis.map((m) => m.cantos)).toEqual([
      "13px 4px 4px 4px",
      "4px 13px 4px 4px",
      "4px 4px 4px 13px",
      "4px 4px 13px 4px",
    ]);
  });

  it("com menos de quatro, não inventa posições", () => {
    expect(miniaturasDaPasta([servidor("1", "A"), servidor("2", "B")])).toHaveLength(2);
    expect(miniaturasDaPasta([])).toEqual([]);
  });

  it("cada miniatura tem 19px: (48 − 4·2 − 2) / 2", () => {
    expect(LADO_DA_MINIATURA).toBe(19);
  });
});

describe("coresDaPasta", () => {
  it("sem cor, cai nos tokens (nenhum valor inline)", () => {
    expect(coresDaPasta(null)).toEqual({});
  });

  it("com cor, fundo aberto a 15%, prévia a 40% e ícone na própria cor", () => {
    expect(coresDaPasta("#e91e63")).toEqual({
      fundoAberta: "rgba(233, 30, 99, 0.15)",
      fundoPrevia: "rgba(233, 30, 99, 0.4)",
      icone: "#e91e63",
    });
  });

  it("aceita hex em maiúsculas", () => {
    expect(coresDaPasta("#1ABC9C").fundoAberta).toBe("rgba(26, 188, 156, 0.15)");
  });

  it("hex inválido vale como sem cor", () => {
    expect(coresDaPasta("red")).toEqual({});
    expect(coresDaPasta("#fff")).toEqual({});
    expect(coresDaPasta("")).toEqual({});
  });
});

describe("classeDaPilula", () => {
  const base = { aberta: false, ativa: false, naoLido: false, lado: 40 as const };

  it("aberta, a pasta não tem pílula", () => {
    expect(classeDaPilula({ ...base, aberta: true, ativa: true, naoLido: true })).toBe("h-0");
  });

  it("fechada com servidor ativo: alta, do lado do avatar", () => {
    expect(classeDaPilula({ ...base, ativa: true })).toBe("h-10");
    expect(classeDaPilula({ ...base, ativa: true, lado: 48 })).toBe("h-[48px]");
  });

  it("não lido vira ponto; hover cresce", () => {
    expect(classeDaPilula({ ...base, naoLido: true })).toBe("h-2 group-hover/pasta:h-5");
    expect(classeDaPilula(base)).toBe("h-0 group-hover/pasta:h-5");
  });
});

describe("rotuloDaPasta", () => {
  it("anuncia não lido só com a pasta fechada e sem servidor ativo", () => {
    expect(rotuloDaPasta({ nome: "teste", aberta: false, ativa: false, naoLido: true })).toBe(
      "Pasta teste (não lido)",
    );
    expect(rotuloDaPasta({ nome: "teste", aberta: true, ativa: false, naoLido: true })).toBe("Pasta teste");
    expect(rotuloDaPasta({ nome: "teste", aberta: false, ativa: true, naoLido: true })).toBe("Pasta teste");
  });
});
