import { describe, expect, it } from "vitest";
import {
  comTeste,
  flagsParaOGateway,
  microfoneNaSala,
  saidaCalada,
  type EstadoDeVozNoTeste,
} from "./teste-de-microfone";

/** Quem entrou na call sem mexer em nada: microfone aberto, ouvindo todo mundo. */
const normal: EstadoDeVozNoTeste = {
  prefs: { muted: false, deafened: false, micAberto: true },
  testando: false,
};

/** Quem já estava mudo antes de abrir o teste. */
const mudo: EstadoDeVozNoTeste = {
  prefs: { muted: true, deafened: false, micAberto: false },
  testando: false,
};

/** Quem já estava com o áudio desativado. */
const surdo: EstadoDeVozNoTeste = {
  prefs: { muted: true, deafened: true, micAberto: false },
  testando: false,
};

describe("comTeste", () => {
  it("ligar o teste não escreve nas preferências", () => {
    const testando = comTeste(normal, true);
    expect(testando.testando).toBe(true);
    expect(testando.prefs).toBe(normal.prefs);
  });

  it("ligar duas vezes não é nada", () => {
    const testando = comTeste(normal, true);
    expect(comTeste(testando, true)).toBe(testando);
  });

  it("desligar devolve ao estado sem teste, com as mesmas preferências", () => {
    expect(comTeste(comTeste(mudo, true), false)).toEqual(mudo);
  });
});

describe("microfoneNaSala", () => {
  it("fora do teste, vale a preferência", () => {
    expect(microfoneNaSala(normal)).toBe(true);
    expect(microfoneNaSala(mudo)).toBe(false);
  });

  it("durante o teste o microfone não vai para a sala, mesmo desmutado", () => {
    expect(microfoneNaSala(comTeste(normal, true))).toBe(false);
  });

  it("parar o teste devolve o microfone à sala", () => {
    expect(microfoneNaSala(comTeste(comTeste(normal, true), false))).toBe(true);
  });

  it("quem entrou no teste mudo continua mudo ao sair", () => {
    expect(microfoneNaSala(comTeste(comTeste(mudo, true), false))).toBe(false);
  });

  it("mudar de mudo durante o teste vale ao parar — a volta lê a preferência de agora, não um retrato", () => {
    const testando = comTeste(normal, true);
    // o usuário aperta o botão de mudo com o teste rodando
    const testandoEMudo: EstadoDeVozNoTeste = { ...testando, prefs: mudo.prefs };
    expect(microfoneNaSala(comTeste(testandoEMudo, false))).toBe(false);
  });
});

describe("saidaCalada", () => {
  it("fora do teste, cala só quem o usuário calou", () => {
    expect(saidaCalada(false, false)).toBe(false);
    expect(saidaCalada(true, false)).toBe(true);
    expect(saidaCalada(false, false, true)).toBe(true);
  });

  it("durante o teste ninguém é ouvido, mesmo sem surdo", () => {
    expect(saidaCalada(false, true)).toBe(true);
  });

  it("parar o teste devolve o áudio de quem não estava calado", () => {
    expect(saidaCalada(false, false)).toBe(false);
  });

  it("quem já estava surdo continua surdo depois do teste", () => {
    expect(saidaCalada(true, true)).toBe(true);
    expect(saidaCalada(true, false)).toBe(true);
  });
});

describe("flagsParaOGateway", () => {
  it("o teste não aparece para os outros — o Discord ensurdece só de um lado", () => {
    expect(flagsParaOGateway(comTeste(normal, true))).toEqual(flagsParaOGateway(normal));
    expect(flagsParaOGateway(comTeste(normal, true))).toEqual({ muted: false, deafened: false });
  });

  it("mudo e surdo de verdade continuam sendo enviados", () => {
    expect(flagsParaOGateway(surdo)).toEqual({ muted: true, deafened: true });
  });
});
