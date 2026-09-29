import { describe, expect, it } from "vitest";
import {
  ECO_PADRAO,
  GANHO_PADRAO,
  migrarEcoForaDoMac,
  migrarProcessamento,
  migrarRuido,
  migrarTratamento,
  type ProcessamentoSalvo,
  RUIDO_PADRAO,
  tratamentoPadrao,
} from "../ruido-padrao";

/** O padrão de fábrica anterior a 2026-09-22: tratamento pelo sistema. */
const ANTIGO: ProcessamentoSalvo = { eco: true, ruido: "avancada", ganho: true };
/** O trio "No app": padrão do Mac (e de todo mundo entre 09-22 e 09-29). */
const NOVO: ProcessamentoSalvo = { eco: false, ruido: "avancada", ganho: false };

describe("migrarRuido", () => {
  it("o padrão novo é a supressão avançada", () => {
    expect(RUIDO_PADRAO).toBe("avancada");
  });

  it("quem estava no padrão antigo sobe para avançada", () => {
    expect(migrarRuido("padrao", false)).toEqual({ nivel: "avancada", mudou: true });
  });

  it("respeita quem desligou de propósito", () => {
    expect(migrarRuido("off", false)).toEqual({ nivel: "off", mudou: false });
  });

  it("não mexe em quem já estava em avançada", () => {
    expect(migrarRuido("avancada", false)).toEqual({ nivel: "avancada", mudou: false });
  });

  it("depois de migrado, não religa ninguém", () => {
    expect(migrarRuido("padrao", true)).toEqual({ nivel: "padrao", mudou: false });
  });
});

describe("tratamentoPadrao", () => {
  it("fora do Mac, eco e ganho ligados", () => {
    expect(tratamentoPadrao(false)).toEqual({ eco: true, ruido: "avancada", ganho: true });
  });

  it("no Mac, o trio No app", () => {
    expect(tratamentoPadrao(true)).toEqual(NOVO);
    expect({ eco: ECO_PADRAO, ruido: RUIDO_PADRAO, ganho: GANHO_PADRAO }).toEqual(NOVO);
  });

  it("devolve cópia: mexer no resultado não corrompe o padrão", () => {
    tratamentoPadrao(true).eco = true;
    expect(tratamentoPadrao(true)).toEqual(NOVO);
  });
});

describe("migrarTratamento", () => {
  it("no Mac, quem estava no padrão antigo vai para No app", () => {
    expect(migrarTratamento(ANTIGO, false, true)).toEqual({ processamento: NOVO, mudou: true });
  });

  it("fora do Mac, o padrão antigo já é o da plataforma: nada muda", () => {
    expect(migrarTratamento(ANTIGO, false, false)).toEqual({ processamento: ANTIGO, mudou: false });
  });

  it("depois da marca, ninguém mais é movido", () => {
    expect(migrarTratamento(ANTIGO, true, true)).toEqual({ processamento: ANTIGO, mudou: false });
  });

  it("quem já estava no app continua igual", () => {
    expect(migrarTratamento(NOVO, false, true)).toEqual({ processamento: NOVO, mudou: false });
  });

  it("qualquer divergência do padrão antigo conta como escolha e fica intocada", () => {
    const escolhas: ProcessamentoSalvo[] = [
      { eco: true, ruido: "off", ganho: true },
      { eco: true, ruido: "avancada", ganho: false },
      { eco: false, ruido: "avancada", ganho: true },
      { eco: true, ruido: "padrao", ganho: true },
    ];
    for (const escolha of escolhas) {
      for (const ehMac of [true, false]) {
        expect(migrarTratamento(escolha, false, ehMac)).toEqual({
          processamento: escolha,
          mudou: false,
        });
      }
    }
  });
});

describe("migrarEcoForaDoMac", () => {
  it("fora do Mac, religa quem está exatamente no trio No app", () => {
    expect(migrarEcoForaDoMac(NOVO, false, false)).toEqual({
      processamento: { eco: true, ruido: "avancada", ganho: true },
      mudou: true,
    });
  });

  it("no Mac não faz nada", () => {
    expect(migrarEcoForaDoMac(NOVO, false, true)).toEqual({ processamento: NOVO, mudou: false });
  });

  it("a marca impede repetir", () => {
    expect(migrarEcoForaDoMac(NOVO, true, false)).toEqual({ processamento: NOVO, mudou: false });
  });

  it("qualquer outra combinação é escolha e fica intocada", () => {
    const escolhas: ProcessamentoSalvo[] = [
      { eco: true, ruido: "avancada", ganho: false },
      { eco: false, ruido: "avancada", ganho: true },
      { eco: false, ruido: "off", ganho: false },
      { eco: false, ruido: "padrao", ganho: false },
    ];
    for (const escolha of escolhas) {
      expect(migrarEcoForaDoMac(escolha, false, false)).toEqual({
        processamento: escolha,
        mudou: false,
      });
    }
  });
});

describe("migrarProcessamento", () => {
  const nenhuma = { ruidoMigrado: false, tratamentoMigrado: false, ecoForaDoMacMigrado: false };
  const todas = { ruidoMigrado: true, tratamentoMigrado: true, ecoForaDoMacMigrado: true };
  const FORA = tratamentoPadrao(false);

  it("quem nunca mexeu em nada chega ao padrão da plataforma", () => {
    // o `padrao` do navegador sobe para `avancada` **e** só por isso é
    // reconhecido como intocado pela migração do tratamento, que roda depois
    const antiquissimo: ProcessamentoSalvo = { eco: true, ruido: "padrao", ganho: true };
    expect(migrarProcessamento(antiquissimo, nenhuma, true)).toEqual({
      processamento: NOVO,
      mudou: true,
    });
    expect(migrarProcessamento(antiquissimo, nenhuma, false)).toEqual({
      processamento: FORA,
      mudou: true,
    });
  });

  it("a ordem importa: fora do Mac, o trio No app vindo das migrações antigas termina ligado", () => {
    // sem marca alguma e no trio No app, a nova migração olha o estado já
    // resolvido e religa
    expect(migrarProcessamento(NOVO, nenhuma, false)).toEqual({
      processamento: FORA,
      mudou: true,
    });
  });

  it("quem já passou pelas duas primeiras só recebe a nova, fora do Mac", () => {
    const marcas = { ruidoMigrado: true, tratamentoMigrado: true, ecoForaDoMacMigrado: false };
    expect(migrarProcessamento(NOVO, marcas, false)).toEqual({ processamento: FORA, mudou: true });
    expect(migrarProcessamento(NOVO, marcas, true)).toEqual({ processamento: NOVO, mudou: false });
  });

  it("com todas as marcas, a preferência salva é devolvida intacta", () => {
    expect(migrarProcessamento(NOVO, todas, false)).toEqual({ processamento: NOVO, mudou: false });
  });

  it("quem escolheu o ruído desligado não perde a escolha", () => {
    const salvo: ProcessamentoSalvo = { eco: true, ruido: "off", ganho: true };
    expect(migrarProcessamento(salvo, nenhuma, false)).toEqual({ processamento: salvo, mudou: false });
    expect(migrarProcessamento(salvo, nenhuma, true)).toEqual({ processamento: salvo, mudou: false });
  });

  it("não muta o objeto recebido", () => {
    const salvo: ProcessamentoSalvo = { ...NOVO };
    migrarProcessamento(salvo, nenhuma, false);
    expect(salvo).toEqual(NOVO);
  });
});
