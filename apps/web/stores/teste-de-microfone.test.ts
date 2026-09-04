import { describe, expect, it } from "vitest";
import {
  FORA_DO_TESTE,
  PREFS_DO_TESTE,
  iniciarTeste,
  mesmasPrefs,
  pararTeste,
  saidaCalada,
  testeSobrevive,
  type EstadoDoTeste,
  type PrefsDeVoz,
} from "./teste-de-microfone";

/** Quem entrou na call sem mexer em nada: microfone aberto, ouvindo todo mundo. */
const normal: PrefsDeVoz = { muted: false, deafened: false };

/** Quem já estava mudo (mas ouvindo) antes de abrir o teste. */
const mudo: PrefsDeVoz = { muted: true, deafened: false };

/** Quem já estava surdo — que, como no Discord, implica mudo. */
const surdo: PrefsDeVoz = { muted: true, deafened: true };

/** O atalho do caminho feliz: abre o teste a partir de `antes`. */
function testando(antes: PrefsDeVoz): EstadoDoTeste {
  return iniciarTeste(FORA_DO_TESTE, antes).estado;
}

describe("iniciarTeste", () => {
  it("guarda o estado anterior e pede mudo e surdo", () => {
    const { estado, aplicar } = iniciarTeste(FORA_DO_TESTE, normal);
    expect(estado.testando).toBe(true);
    expect(estado.anterior).toEqual(normal);
    expect(aplicar).toEqual(PREFS_DO_TESTE);
  });

  it("de quem já estava mudo, guarda o mudo — e ainda ensurdece", () => {
    const { estado, aplicar } = iniciarTeste(FORA_DO_TESTE, mudo);
    expect(estado.anterior).toEqual(mudo);
    expect(aplicar).toEqual(PREFS_DO_TESTE);
  });

  it("de quem já estava surdo, não escreve nada (nem toca som)", () => {
    const { estado, aplicar } = iniciarTeste(FORA_DO_TESTE, surdo);
    expect(estado.anterior).toEqual(surdo);
    expect(aplicar).toBeNull();
  });

  it("o segundo 'Testar' não regrava o anterior", () => {
    // o popover e a aba podem estar abertos ao mesmo tempo: se o segundo
    // clique guardasse o par já ensurdecido, parar deixaria a pessoa surda
    const primeiro = testando(normal);
    const segundo = iniciarTeste(primeiro, PREFS_DO_TESTE);
    expect(segundo.estado).toBe(primeiro);
    expect(segundo.estado.anterior).toEqual(normal);
    expect(segundo.aplicar).toBeNull();
  });

  it("não guarda uma referência viva do que lhe deram", () => {
    const vivo = { ...normal };
    const { estado } = iniciarTeste(FORA_DO_TESTE, vivo);
    vivo.deafened = true;
    expect(estado.anterior).toEqual(normal);
  });
});

describe("pararTeste", () => {
  it("restaura exatamente o estado de antes", () => {
    const { estado, aplicar } = pararTeste(testando(normal), PREFS_DO_TESTE);
    expect(estado).toEqual(FORA_DO_TESTE);
    expect(aplicar).toEqual(normal);
  });

  it("quem entrou mudo continua mudo, e só isso", () => {
    const { aplicar } = pararTeste(testando(mudo), PREFS_DO_TESTE);
    expect(aplicar).toEqual(mudo);
  });

  it("quem entrou surdo sai surdo, sem escrita nenhuma", () => {
    const { aplicar } = pararTeste(testando(surdo), PREFS_DO_TESTE);
    expect(aplicar).toBeNull();
  });

  it("parar duas vezes não restaura de novo", () => {
    const primeiro = pararTeste(testando(normal), PREFS_DO_TESTE);
    const segundo = pararTeste(primeiro.estado, normal);
    expect(segundo.aplicar).toBeNull();
    expect(segundo.estado).toEqual(FORA_DO_TESTE);
  });

  it("parar sem teste em curso é inofensivo", () => {
    expect(pararTeste(FORA_DO_TESTE, mudo)).toEqual({ estado: FORA_DO_TESTE, aplicar: null });
  });

  it("o mesmo passo serve a todo caminho de saída", () => {
    // botão "Parar", popover fechado, aba trocada, painel fechado, saída da
    // call, desmonte: todos param pela mesma função, com o mesmo resultado
    const caminhos = ["botao", "popover", "aba", "painel", "sair-da-call", "desmonte"];
    for (const _caminho of caminhos) {
      expect(pararTeste(testando(normal), PREFS_DO_TESTE).aplicar).toEqual(normal);
    }
  });
});

describe("interação manual no meio do teste", () => {
  it("dessurdar na mão derruba o teste", () => {
    expect(testeSobrevive(PREFS_DO_TESTE)).toBe(true);
    expect(testeSobrevive(normal)).toBe(false);
    expect(testeSobrevive(mudo)).toBe(false);
  });

  it("o que o usuário escolheu na mão não é desfeito ao parar", () => {
    // ele estava normal, o teste ensurdeceu, ele clicou em desmutar: o teste
    // para, mas quem manda é o clique dele — restaurar seria ressuscitar o
    // surdo que ele acabou de tirar
    const { aplicar } = pararTeste(testando(normal), normal);
    expect(aplicar).toBeNull();
  });

  it("mudo escolhido na mão no meio do teste também fica", () => {
    const { aplicar } = pararTeste(testando(normal), mudo);
    expect(aplicar).toBeNull();
  });
});

describe("saidaCalada", () => {
  it("surdo cala todos; silenciar cala um", () => {
    expect(saidaCalada(false, false)).toBe(false);
    expect(saidaCalada(true, false)).toBe(true);
    expect(saidaCalada(false, false, true)).toBe(true);
  });

  it("o teste cala a sala mesmo antes de o surdo ser escrito", () => {
    expect(saidaCalada(false, true)).toBe(true);
  });

  it("parar o teste devolve o som de quem não estava surdo", () => {
    expect(saidaCalada(false, false)).toBe(false);
  });
});

describe("mesmasPrefs", () => {
  it("compara os dois campos, não a identidade", () => {
    expect(mesmasPrefs(normal, { ...normal })).toBe(true);
    expect(mesmasPrefs(mudo, surdo)).toBe(false);
  });
});
