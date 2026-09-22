import { describe, expect, it } from "vitest";
import {
  ECO_PADRAO,
  GANHO_PADRAO,
  migrarProcessamento,
  migrarRuido,
  migrarTratamento,
  type ProcessamentoSalvo,
  RUIDO_PADRAO,
} from "../ruido-padrao";

/** O padrão de fábrica anterior a 2026-09-22: tratamento pelo sistema. */
const ANTIGO: ProcessamentoSalvo = { eco: true, ruido: "avancada", ganho: true };
/** O padrão de fábrica de hoje: "No app" + supressão avançada. */
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

describe("migrarTratamento", () => {
  it("o padrão de fábrica é o tratamento no app", () => {
    // quem não tem preferência salva nasce aqui: é o `AUDIO_PADRAO` da store
    expect({ eco: ECO_PADRAO, ruido: RUIDO_PADRAO, ganho: GANHO_PADRAO }).toEqual(NOVO);
  });

  it("quem estava no padrão de fábrica antigo vai para o novo", () => {
    expect(migrarTratamento(ANTIGO, false)).toEqual({ processamento: NOVO, mudou: true });
  });

  it("depois da marca, ninguém mais é movido", () => {
    expect(migrarTratamento(ANTIGO, true)).toEqual({ processamento: ANTIGO, mudou: false });
  });

  it("quem já estava no app continua igual", () => {
    expect(migrarTratamento(NOVO, false)).toEqual({ processamento: NOVO, mudou: false });
  });

  it("qualquer divergência do padrão antigo conta como escolha e fica intocada", () => {
    // o storage guarda o valor, não a intenção: um trio que não bate com o
    // padrão antigo só pode ter vindo de alguém mexendo nos interruptores
    const escolhas: ProcessamentoSalvo[] = [
      { eco: true, ruido: "off", ganho: true }, // ruído desligado na mão
      { eco: true, ruido: "avancada", ganho: false }, // só o ganho desligado
      { eco: false, ruido: "avancada", ganho: true }, // só o eco desligado
      { eco: true, ruido: "padrao", ganho: true }, // ainda na supressão do navegador
    ];
    for (const escolha of escolhas) {
      expect(migrarTratamento(escolha, false)).toEqual({ processamento: escolha, mudou: false });
    }
  });
});

describe("migrarProcessamento", () => {
  const nenhuma = { ruidoMigrado: false, tratamentoMigrado: false };

  it("quem nunca mexeu em nada chega ao padrão novo inteiro", () => {
    // o `padrao` do navegador era o padrão de fábrica de antes de 2026-09-16:
    // ele sobe para `avancada` **e** só por isso é reconhecido como intocado
    // pela migração do tratamento, que roda depois
    expect(migrarProcessamento({ eco: true, ruido: "padrao", ganho: true }, nenhuma)).toEqual({
      processamento: NOVO,
      mudou: true,
    });
  });

  it("quem já passou pela migração do ruído migra só o tratamento", () => {
    expect(
      migrarProcessamento(ANTIGO, { ruidoMigrado: true, tratamentoMigrado: false }),
    ).toEqual({ processamento: NOVO, mudou: true });
  });

  it("com as duas marcas, a preferência salva é devolvida intacta", () => {
    const salvo: ProcessamentoSalvo = { eco: true, ruido: "padrao", ganho: true };
    expect(
      migrarProcessamento(salvo, { ruidoMigrado: true, tratamentoMigrado: true }),
    ).toEqual({ processamento: salvo, mudou: false });
  });

  it("quem escolheu o ruído desligado não perde a escolha nem ganha o tratamento novo", () => {
    const salvo: ProcessamentoSalvo = { eco: true, ruido: "off", ganho: true };
    expect(migrarProcessamento(salvo, nenhuma)).toEqual({ processamento: salvo, mudou: false });
  });

  it("não muta o objeto recebido", () => {
    const salvo: ProcessamentoSalvo = { ...ANTIGO };
    migrarProcessamento(salvo, nenhuma);
    expect(salvo).toEqual(ANTIGO);
  });
});
