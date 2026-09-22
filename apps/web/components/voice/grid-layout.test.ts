import { describe, expect, it } from "vitest";
import {
  FAIXA_ALTURA,
  FAIXA_GAP,
  FAIXA_LARGURA,
  FOCO_GAP,
  GAP,
  TETO_DE_TILES_ANIMADOS,
  TRANSICAO_DE_REFLOW,
  alturaDoDestaque,
  distribuir,
  estiloDoTile,
  larguraDaTira,
  melhorArranjo,
  palcoUsaFoco,
  posicionarGrade,
} from "./grid-layout";

describe("vão da grade", () => {
  it("é o --space-8 do Discord", () => {
    expect(GAP).toBe(8);
  });
});

describe("arranjo medido nas prints do Discord", () => {
  it("dois tiles lado a lado no palco da print 101857 (760 de largura, 8 de vão)", () => {
    // tiles em x=383–1142 e 1151–1910: 760 + 8 + 760 = 1528 de área útil
    const a = melhorArranjo(2, 1528, 560);
    expect(a.colunas).toBe(2);
    expect(a.linhas).toBe(1);
    expect(a.largura).toBe(760);
    // 760 / (16/9) = 427,5 — a print mostra 428 (y=254–681); a conta arredonda para baixo
    expect(a.altura).toBe(427);
  });

  it("três tiles numa fileira na faixa da print 123917 (291×163)", () => {
    // x=382–672, 681–971, 980–1270: 3×291 + 2×8 = 889
    const a = melhorArranjo(3, 889, 200);
    expect(a.colunas).toBe(3);
    expect(a.largura).toBe(291);
    expect(a.altura).toBe(163);
  });
});

describe("arranjo", () => {
  it("área zerada não quebra", () => {
    expect(melhorArranjo(3, 0, 500)).toEqual({ colunas: 1, linhas: 1, largura: 0, altura: 0 });
    expect(melhorArranjo(0, 800, 500)).toEqual({ colunas: 1, linhas: 1, largura: 0, altura: 0 });
  });

  it("nunca passa da área disponível", () => {
    for (let n = 1; n <= 12; n++) {
      const a = melhorArranjo(n, 1200, 700);
      expect(a.largura * a.colunas + GAP * (a.colunas - 1)).toBeLessThanOrEqual(1200);
      expect(a.altura * a.linhas + GAP * (a.linhas - 1)).toBeLessThanOrEqual(700);
    }
  });

  it("palco estreito empilha em vez de espremer", () => {
    expect(melhorArranjo(2, 400, 900).colunas).toBe(1);
  });
});

describe("distribuir", () => {
  it("equilibra a última linha", () => {
    expect(distribuir(5, 3)).toEqual([3, 2]);
    expect(distribuir(7, 3)).toEqual([3, 2, 2]);
    expect(distribuir(4, 2)).toEqual([2, 2]);
  });

  it("nada para distribuir dá lista vazia", () => {
    expect(distribuir(0, 3)).toEqual([]);
  });
});

describe("alturaDoDestaque", () => {
  it("desconta a tira e o vão quando há gente nela", () => {
    expect(alturaDoDestaque(500, 2)).toBe(500 - FAIXA_ALTURA - FOCO_GAP);
  });

  it("sem tira o destaque fica com a área inteira", () => {
    expect(alturaDoDestaque(500, 0)).toBe(500);
  });
});

/**
 * A tabela-verdade de "com altura X e N participantes, o palco usa grade ou
 * destaque + tira".
 *
 * As larguras são as reais: 1042 é a faixa de chamada sobre a conversa numa
 * janela de 1058 de área útil (menos os 8+8 de `FOLGA_DO_PALCO`); 1806 é o
 * palco do canal de voz da print `2026-09-03 203909`.
 */
describe("palcoUsaFoco", () => {
  /** A faixa da print `2026-09-21 às 15.04.09`: 745px na imagem 2× = 372,5. */
  const FAIXA_MEDIDA = 372;

  it("na faixa é grade em qualquer altura — é o que a print mostra", () => {
    for (const altura of [103, 199, FAIXA_MEDIDA, 500, 900]) {
      for (let naTira = 1; naTira <= 6; naTira++) {
        expect(palcoUsaFoco(naTira, 1042, altura, true)).toBe(false);
      }
    }
  });

  it("a faixa medida: três tiles de 342×192, como na print (344×193,5)", () => {
    // duas pessoas e uma transmissão ao vivo — ela é célula da grade, não
    // destaque; a folga que sobra dos 372 é por onde a cápsula flutua
    const grade = melhorArranjo(3, 1042, FAIXA_MEDIDA);
    expect(grade.colunas).toBe(3);
    expect(grade.largura).toBe(342);
    expect(grade.altura).toBe(192);
  });

  it("sem a regra da faixa a aritmética escolheria o destaque — a contradição de hoje", () => {
    // 258 de destaque contra 192 de tile: a conta aprova o foco, e a medida
    // não. Por isso a faixa precisa dizer que é faixa, em vez de ser deduzida
    // da altura (que desde que os controles deixaram de reservar 96px é grande
    // o bastante para o destaque compensar).
    expect(melhorArranjo(1, 1042, alturaDoDestaque(FAIXA_MEDIDA, 2)).altura).toBe(258);
    expect(palcoUsaFoco(2, 1042, FAIXA_MEDIDA)).toBe(true);
    expect(palcoUsaFoco(2, 1042, FAIXA_MEDIDA, true)).toBe(false);
  });

  it("na faixa baixa a aritmética já dizia grade, e continua dizendo", () => {
    // 199 (`ALTURA_PADRAO`): 199 − 106 (tira) − 8 (vão) deixa 85 ao destaque,
    // contra os 192 do tile da grade
    expect(alturaDoDestaque(199, 2)).toBe(85);
    expect(palcoUsaFoco(2, 1042, 199)).toBe(false);
    expect(palcoUsaFoco(2, 1042, 199, true)).toBe(false);
  });

  it("o palco do canal de voz continua no foco (print 203909)", () => {
    expect(palcoUsaFoco(1, 1806, 1019 + FAIXA_ALTURA + FOCO_GAP)).toBe(true);
  });

  it("altura média com duas pessoas: a grade dá os dois maiores que o destaque", () => {
    // 290 de tile na grade contra 286 de destaque — o foco seria prejuízo puro
    expect(melhorArranjo(2, 1042, 400).altura).toBe(290);
    expect(melhorArranjo(1, 1042, alturaDoDestaque(400, 1)).altura).toBe(286);
    expect(palcoUsaFoco(1, 1042, 400)).toBe(false);
  });

  it("altura folgada com duas pessoas: o destaque passa a compensar", () => {
    expect(palcoUsaFoco(1, 1042, 700)).toBe(true);
  });

  it("quanto mais gente, mais cedo o foco compensa", () => {
    // a mesma altura de 400 em que duas pessoas ficam melhor na grade
    expect(palcoUsaFoco(5, 1042, 400)).toBe(true);
  });

  it("sem ninguém na tira não há troca: o foco é um tile na área inteira", () => {
    expect(palcoUsaFoco(0, 1042, 199)).toBe(true);
    expect(palcoUsaFoco(0, 0, 0)).toBe(true);
    // vale também na faixa: sem tira não existe o arranjo que a regra recusa,
    // e o tile é o mesmo, no mesmo tamanho
    expect(palcoUsaFoco(0, 1042, FAIXA_MEDIDA, true)).toBe(true);
  });

  it("área ainda não medida escolhe a grade", () => {
    // no foco a tira tem altura fixa e apareceria sozinha, com o destaque em
    // 0×0 — que é o defeito relatado
    expect(palcoUsaFoco(2, 0, 0)).toBe(false);
  });

  it("nunca decide pelo foco quando o destaque não cabe", () => {
    for (let n = 1; n <= 8; n++) {
      for (const altura of [40, 80, 103, 114, 150, 220, 300]) {
        if (palcoUsaFoco(n, 1042, altura)) {
          expect(alturaDoDestaque(altura, n)).toBeGreaterThan(0);
        }
      }
    }
  });
});

/**
 * O leiaute chega ao DOM como retângulo absoluto, e não como fileiras de
 * flexbox — é o que permite a transição (ver `TRANSICAO_DE_REFLOW`). O que se
 * afirma aqui é que **o desenho não mudou**: as coordenadas são as mesmas que
 * o `items-center`/`justify-center` produzia.
 */
describe("posicionarGrade", () => {
  it("repete a centralização do flexbox na fileira da print 123917", () => {
    const arranjo = melhorArranjo(3, 889, 200);
    const vagas = posicionarGrade(3, arranjo, 889, 200);

    expect(vagas).toHaveLength(3);
    // 3×291 + 2×8 = 889: a fileira ocupa a largura toda, sem folga lateral
    expect(vagas.map((v) => v.esquerda)).toEqual([0, 291 + GAP, 2 * (291 + GAP)]);
    // uma linha de 163 numa área de 200 → (200 − 163) / 2 em todas
    expect(vagas.map((v) => v.topo)).toEqual([18.5, 18.5, 18.5]);
    for (const v of vagas) {
      expect(v.largura).toBe(291);
      expect(v.altura).toBe(163);
    }
  });

  it("centraliza a última linha incompleta, como `distribuir` promete", () => {
    // arranjo à mão: o que se testa aqui é a conversão em coordenadas, não a
    // escolha de colunas (essa é de `melhorArranjo`, testada acima)
    const arranjo = { colunas: 3, linhas: 2, largura: 100, altura: 50 };
    const vagas = posicionarGrade(5, arranjo, 1000, 500);

    // 3 + 2: a primeira linha ocupa 3×100 + 2×8 = 316, a segunda 2×100 + 8 = 208
    expect(vagas.slice(0, 3).map((v) => v.esquerda)).toEqual([342, 450, 558]);
    expect(vagas.slice(3).map((v) => v.esquerda)).toEqual([396, 504]);
    // duas linhas de 50 com o vão = 108 numa área de 500
    expect(vagas.map((v) => v.topo)).toEqual([196, 196, 196, 254, 254]);
  });

  it("um tile só fica no meio do palco", () => {
    const arranjo = { colunas: 1, linhas: 1, largura: 400, altura: 225 };
    expect(posicionarGrade(1, arranjo, 1000, 625)).toEqual([
      { esquerda: 300, topo: 200, largura: 400, altura: 225 },
    ]);
  });

  it("dá uma vaga por célula e nenhuma sai da área", () => {
    for (let n = 1; n <= 12; n++) {
      const arranjo = melhorArranjo(n, 1200, 700);
      const vagas = posicionarGrade(n, arranjo, 1200, 700);
      expect(vagas).toHaveLength(n);
      for (const v of vagas) {
        expect(v.esquerda).toBeGreaterThanOrEqual(0);
        expect(v.topo).toBeGreaterThanOrEqual(0);
        expect(v.esquerda + v.largura).toBeLessThanOrEqual(1200);
        expect(v.topo + v.altura).toBeLessThanOrEqual(700);
      }
    }
  });

  it("nada para posicionar dá lista vazia", () => {
    expect(posicionarGrade(0, melhorArranjo(0, 800, 500), 800, 500)).toEqual([]);
  });
});

describe("larguraDaTira", () => {
  it("é a soma das miniaturas com os vãos", () => {
    expect(larguraDaTira(1)).toBe(FAIXA_LARGURA);
    expect(larguraDaTira(3)).toBe(3 * FAIXA_LARGURA + 2 * FAIXA_GAP);
    expect(larguraDaTira(0)).toBe(0);
  });
});

/**
 * A transição que o Signal Desktop usa na mesma grade, e as duas coisas que
 * ela **não** pode ter: duração literal (a regra central de
 * `prefers-reduced-motion` no `globals.css` não a alcançaria) e curva de
 * aceleração (numa interpolação de retângulo o tile pareceria escorregar).
 */
describe("TRANSICAO_DE_REFLOW", () => {
  it("anima os quatro lados do retângulo, em linear", () => {
    for (const lado of ["top", "left", "width", "height"]) {
      expect(TRANSICAO_DE_REFLOW).toContain(`${lado} var(--mov-reflow) linear`);
    }
  });

  it("sai do token de movimento, nunca de um literal em ms", () => {
    expect(TRANSICAO_DE_REFLOW).toContain("var(--mov-reflow)");
    expect(TRANSICAO_DE_REFLOW).not.toMatch(/\d+\s*m?s/);
  });

  it("não leva curva nenhuma", () => {
    expect(TRANSICAO_DE_REFLOW).not.toContain("ease");
    expect(TRANSICAO_DE_REFLOW).not.toContain("cubic-bezier");
    expect(TRANSICAO_DE_REFLOW).not.toContain("var(--mov-curva");
  });
});

describe("estiloDoTile", () => {
  const vaga = { esquerda: 12, topo: 34, largura: 560, altura: 315 };

  it("entrega o retângulo em top/left/width/height", () => {
    expect(estiloDoTile(vaga, false)).toEqual({ left: 12, top: 34, width: 560, height: 315 });
  });

  it("acrescenta a transição quando a grade anima", () => {
    expect(estiloDoTile(vaga, true).transition).toBe(TRANSICAO_DE_REFLOW);
  });

  it("sem animar não deixa transição nenhuma no estilo", () => {
    // é o primeiro quadro (palco ainda sem medida) e o palco lotado: nos dois
    // casos o tile tem de nascer parado, e não inflar
    expect(estiloDoTile(vaga, false).transition).toBeUndefined();
  });
});

describe("TETO_DE_TILES_ANIMADOS", () => {
  it("é o teto do Element Call", () => {
    expect(TETO_DE_TILES_ANIMADOS).toBe(50);
  });
});
