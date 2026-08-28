import { describe, expect, it } from "vitest";
import {
  ZOOM_MAX,
  escalaBase,
  limitarEnquadramento,
  limiteDeArrasto,
  molduraDoFormato,
  recorteEmPixels,
  tamanhoDeSaida,
} from "../recorte";

const QUADRADO = { largura: 256, altura: 256 };
/** paisagem 1000×500: sobra na horizontal quando a moldura é quadrada. */
const PAISAGEM = { largura: 1000, altura: 500 };
/** retrato 500×1000: sobra na vertical. */
const RETRATO = { largura: 500, altura: 1000 };

describe("enquadramento", () => {
  it("zoom 1 é o que cobre a moldura, pelo lado menor da imagem", () => {
    // 256/500 no lado curto vence 256/1000 no longo
    expect(escalaBase(QUADRADO, PAISAGEM)).toBeCloseTo(256 / 500);
    expect(escalaBase(QUADRADO, RETRATO)).toBeCloseTo(256 / 500);
  });

  it("só dá para arrastar no eixo em que sobra imagem", () => {
    const limite = limiteDeArrasto(QUADRADO, PAISAGEM, 1);
    expect(limite.largura).toBeGreaterThan(0);
    expect(limite.altura).toBe(0);

    // imagem já na proporção da moldura, sem zoom: fica travada nos dois eixos
    const travado = limiteDeArrasto(QUADRADO, { largura: 800, altura: 800 }, 1);
    expect(travado).toEqual({ largura: 0, altura: 0 });
  });

  it("afastar o zoom puxa a imagem de volta para dentro da moldura", () => {
    const noCanto = limitarEnquadramento({ zoom: 3, x: 9999, y: 0 }, QUADRADO, PAISAGEM);
    const afastado = limitarEnquadramento({ ...noCanto, zoom: 1 }, QUADRADO, PAISAGEM);
    expect(Math.abs(afastado.x)).toBeLessThan(Math.abs(noCanto.x));
    expect(Math.abs(afastado.x)).toBeCloseTo(limiteDeArrasto(QUADRADO, PAISAGEM, 1).largura);
  });

  it("prende o zoom na faixa permitida", () => {
    expect(limitarEnquadramento({ zoom: 0.2, x: 0, y: 0 }, QUADRADO, PAISAGEM).zoom).toBe(1);
    expect(limitarEnquadramento({ zoom: 99, x: 0, y: 0 }, QUADRADO, PAISAGEM).zoom).toBe(ZOOM_MAX);
  });
});

describe("recorte em pixels", () => {
  it("centralizado e sem zoom pega o quadrado do meio da paisagem", () => {
    const r = recorteEmPixels({ zoom: 1, x: 0, y: 0 }, QUADRADO, PAISAGEM);
    expect(r).toEqual({ sx: 250, sy: 0, largura: 500, altura: 500 });
  });

  it("arrastar para a direita mostra o começo da imagem", () => {
    const semArrasto = recorteEmPixels({ zoom: 1, x: 0, y: 0 }, QUADRADO, PAISAGEM);
    const arrastado = recorteEmPixels({ zoom: 1, x: 60, y: 0 }, QUADRADO, PAISAGEM);
    expect(arrastado.sx).toBeLessThan(semArrasto.sx);
  });

  it("no limite do arrasto encosta na borda, sem passar", () => {
    const limite = limiteDeArrasto(QUADRADO, PAISAGEM, 1).largura;
    expect(recorteEmPixels({ zoom: 1, x: limite, y: 0 }, QUADRADO, PAISAGEM).sx).toBe(0);

    const fim = recorteEmPixels({ zoom: 1, x: -limite, y: 0 }, QUADRADO, PAISAGEM);
    expect(fim.sx + fim.largura).toBeCloseTo(PAISAGEM.largura);
  });

  it("nunca sai da imagem, por mais que se peça", () => {
    for (const enquadramento of [
      { zoom: 1, x: 1e6, y: 1e6 },
      { zoom: ZOOM_MAX, x: -1e6, y: -1e6 },
      { zoom: 2.37, x: 143, y: -87 },
    ]) {
      const r = recorteEmPixels(enquadramento, QUADRADO, RETRATO);
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
      expect(r.sx + r.largura).toBeLessThanOrEqual(RETRATO.largura + 1e-9);
      expect(r.sy + r.altura).toBeLessThanOrEqual(RETRATO.altura + 1e-9);
    }
  });

  it("dar zoom recorta um pedaço menor da original", () => {
    const perto = recorteEmPixels({ zoom: 2, x: 0, y: 0 }, QUADRADO, PAISAGEM);
    expect(perto.largura).toBeCloseTo(250);
    expect(perto.altura).toBeCloseTo(250);
  });

  it("mantém a proporção da moldura no recorte do banner", () => {
    const moldura = molduraDoFormato("banner", 400);
    const r = recorteEmPixels({ zoom: 1.5, x: 20, y: 5 }, moldura, PAISAGEM);
    expect(r.largura / r.altura).toBeCloseTo(moldura.largura / moldura.altura);
  });
});

describe("tamanho de saída", () => {
  it("reduz para o alvo quando o recorte é maior", () => {
    expect(tamanhoDeSaida({ sx: 0, sy: 0, largura: 1024, altura: 1024 }, 512)).toEqual({
      largura: 512,
      altura: 512,
    });
  });

  it("não amplia um recorte pequeno", () => {
    expect(tamanhoDeSaida({ sx: 0, sy: 0, largura: 120, altura: 48 }, 960)).toEqual({
      largura: 120,
      altura: 48,
    });
  });

  it("preserva a proporção do banner ao reduzir", () => {
    const saida = tamanhoDeSaida({ sx: 0, sy: 0, largura: 2000, altura: 800 }, 960);
    expect(saida).toEqual({ largura: 960, altura: 384 });
  });
});
