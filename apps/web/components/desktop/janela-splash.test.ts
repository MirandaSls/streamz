import { describe, expect, it } from "vitest";
import {
  EXIBICAO_MINIMA,
  esperaQueFalta,
  fraseDaSplash,
  modoDaSplash,
  porcentagemDoDownload,
} from "@/components/desktop/janela-splash";

describe("modoDaSplash", () => {
  it("sem busca, é a janela da abertura", () => {
    expect(modoDaSplash("")).toBe("abertura");
  });

  it("reconhece o modo da setinha da barra de título", () => {
    expect(modoDaSplash("?modo=atualizar")).toBe("atualizar");
  });

  it("valor desconhecido não desvia o boot", () => {
    expect(modoDaSplash("?modo=qualquer")).toBe("abertura");
    expect(modoDaSplash("?outro=atualizar")).toBe("abertura");
  });
});

describe("porcentagemDoDownload", () => {
  it("sem Content-Length não inventa número", () => {
    expect(porcentagemDoDownload(1_000, 0)).toBeNull();
    expect(porcentagemDoDownload(1_000, Number.NaN)).toBeNull();
  });

  it("arredonda para inteiro", () => {
    expect(porcentagemDoDownload(1, 3)).toBe(33);
    expect(porcentagemDoDownload(2, 3)).toBe(67);
  });

  it("não passa de 100% quando o servidor mente no tamanho", () => {
    expect(porcentagemDoDownload(120, 100)).toBe(100);
  });

  it("não fica negativa", () => {
    expect(porcentagemDoDownload(-10, 100)).toBe(0);
  });
});

describe("fraseDaSplash", () => {
  it("abre verificando", () => {
    expect(fraseDaSplash("verificando", null)).toBe("Verificando atualizações…");
  });

  it("mostra a porcentagem quando ela existe", () => {
    expect(fraseDaSplash("baixando", 42)).toBe("Baixando atualização… 42%");
    expect(fraseDaSplash("baixando", null)).toBe("Baixando atualização…");
  });

  it("instalando não tem número — quem manda é o instalador", () => {
    expect(fraseDaSplash("instalando", 100)).toBe("Instalando…");
  });
});

describe("esperaQueFalta", () => {
  it("segura a janelinha até a exibição mínima", () => {
    expect(esperaQueFalta(1_000, 1_080)).toBe(EXIBICAO_MINIMA - 80);
  });

  it("checagem demorada não espera mais nada", () => {
    expect(esperaQueFalta(1_000, 9_000)).toBe(0);
  });
});
