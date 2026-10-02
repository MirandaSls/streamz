import { describe, expect, it } from "vitest";
import { identidadeDeTela } from "@streamz/shared";
import {
  FALA_INICIAL,
  LIMIAR_DE_FALA,
  NINGUEM,
  SOLTURA_DA_FALA_MS,
  comFalante,
  donoDoParticipante,
  falantesDeIdentidades,
  falantesDeParticipantes,
  mesmoConjunto,
  participantesDoDono,
  passoDeFala,
  proximoConjunto,
  rmsDeAmostras,
} from "./voice-falantes";
import { ouvintesRemotos } from "../components/voice/audio-remoto";

describe("falantesDeIdentidades", () => {
  it("leva a identidade do LiveKit para o userId", () => {
    expect([...falantesDeIdentidades(["u1", "u2"])]).toEqual(["u1", "u2"]);
  });

  it("o participante de tela conta para o dono dele", () => {
    expect([...falantesDeIdentidades([identidadeDeTela("u1")])]).toEqual(["u1"]);
    expect(identidadeDeTela("u1")).toBe("u1#tela");
  });

  it("a pessoa e a tela dela são uma pessoa só", () => {
    const conjunto = falantesDeIdentidades(["u1", identidadeDeTela("u1"), "u2"]);
    expect(conjunto.size).toBe(2);
    expect(conjunto.has("u1")).toBe(true);
    expect(conjunto.has("u2")).toBe(true);
  });

  it("ninguém falando é um conjunto vazio", () => {
    expect(falantesDeIdentidades([]).size).toBe(0);
  });
});

describe("donoDoParticipante", () => {
  it("bot com metadata válido vira o userId interno", () => {
    expect(donoDoParticipante({ identity: "bot:123", metadata: '{"userId":"cuid1"}' })).toBe("cuid1");
  });

  it("bot com metadata inválido cai na identidade, sem lançar", () => {
    expect(donoDoParticipante({ identity: "bot:123", metadata: "{nao-json" })).toBe("bot:123");
    expect(donoDoParticipante({ identity: "bot:123", metadata: '{"userId":""}' })).toBe("bot:123");
  });

  it("bot sem metadata cai na identidade", () => {
    expect(donoDoParticipante({ identity: "bot:123" })).toBe("bot:123");
  });

  it("usuário normal ignora o metadata", () => {
    expect(donoDoParticipante({ identity: "u1", metadata: '{"userId":"x"}' })).toBe("u1");
  });

  it("#tela volta para o dono", () => {
    expect(donoDoParticipante({ identity: identidadeDeTela("u1") })).toBe("u1");
  });

  it("falantesDeParticipantes junta bot e pessoa", () => {
    const c = falantesDeParticipantes([
      { identity: "bot:1", metadata: '{"userId":"cuid1"}' },
      { identity: identidadeDeTela("u1") },
    ]);
    expect([...c]).toEqual(["cuid1", "u1"]);
  });
});

describe("participantesDoDono", () => {
  // o bot de música entra no LiveKit como `bot:<snowflake>`, mas o menu grava
  // volume e "Silenciar" sob o userId interno (o do metadata)
  const bot = { identity: "bot:1", metadata: '{"userId":"cuid-bot"}' };
  const sala = [{ identity: identidadeDeTela("u1") }, bot, { identity: "u1" }];

  it("acha o bot pelo userId interno, não pela identidade crua", () => {
    expect(participantesDoDono(sala, "cuid-bot")).toEqual([bot]);
    expect(participantesDoDono(sala, "bot:1")).toEqual([]);
  });

  it("a pessoa vem antes do participante de tela dela", () => {
    expect(participantesDoDono(sala, "u1").map((p) => p.identity)).toEqual(["u1", "u1#tela"]);
  });

  it("o <audio> do bot nasce sob a chave em que o volume é gravado", () => {
    // regressão: com a identidade crua, nasciam dois ouvintes — "cuid-bot"
    // (sem faixa) e "bot:1" (com a faixa, mas lendo volumes["bot:1"], que o
    // controle deslizante nunca escreve) — e o volume do bot não descia
    const donos = sala.map(donoDoParticipante);
    expect(ouvintesRemotos([{ user: { id: "cuid-bot" } }], donos, "eu")).toEqual(["cuid-bot", "u1"]);
  });
});

describe("mesmoConjunto", () => {
  it("compara conteúdo, não referência", () => {
    expect(mesmoConjunto(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(mesmoConjunto(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    expect(mesmoConjunto(new Set(["a"]), new Set(["b"]))).toBe(false);
    expect(mesmoConjunto(NINGUEM, new Set())).toBe(true);
  });
});

describe("proximoConjunto", () => {
  it("mantém a referência quando o conjunto não muda — é o que evita re-render", () => {
    const atual = new Set(["a", "b"]);
    // o LiveKit reordena `activeSpeakers` por nível a cada aviso: mesma gente,
    // ordem diferente, e a barra lateral não pode re-renderizar por isso
    expect(proximoConjunto(atual, new Set(["b", "a"]))).toBe(atual);
  });

  it("troca a referência quando alguém entra ou sai da conversa", () => {
    const atual = new Set(["a"]);
    const depois = proximoConjunto(atual, new Set(["a", "b"]));
    expect(depois).not.toBe(atual);
    expect([...depois]).toEqual(["a", "b"]);
  });
});

describe("comFalante", () => {
  it("acrescenta e remove uma pessoa só", () => {
    const vazio: ReadonlySet<string> = new Set();
    const comEu = comFalante(vazio, "eu", true);
    expect([...comEu]).toEqual(["eu"]);
    expect([...comFalante(comEu, "eu", false)]).toEqual([]);
  });

  it("não cria conjunto novo quando a resposta já era essa", () => {
    const atual: ReadonlySet<string> = new Set(["eu"]);
    expect(comFalante(atual, "eu", true)).toBe(atual);
    expect(comFalante(atual, "outro", false)).toBe(atual);
  });
});

describe("rmsDeAmostras", () => {
  it("silêncio (tudo em 128) é zero", () => {
    expect(rmsDeAmostras(new Uint8Array(64).fill(128))).toBe(0);
  });

  it("saturação total é 1", () => {
    expect(rmsDeAmostras(new Uint8Array(64).fill(0))).toBe(1);
  });

  it("bloco vazio não divide por zero", () => {
    expect(rmsDeAmostras(new Uint8Array(0))).toBe(0);
  });
});

describe("passoDeFala", () => {
  const acima = LIMIAR_DE_FALA * 2;
  const abaixo = LIMIAR_DE_FALA / 2;

  it("acende na hora que o nível passa do limiar", () => {
    const depois = passoDeFala(FALA_INICIAL, acima, 1_000);
    expect(depois.falando).toBe(true);
    expect(depois.ateMs).toBe(1_000 + SOLTURA_DA_FALA_MS);
  });

  it("não acende com o nível abaixo do limiar", () => {
    expect(passoDeFala(FALA_INICIAL, abaixo, 1_000)).toBe(FALA_INICIAL);
  });

  it("segura aceso durante a folga — a fala tem pausas entre as sílabas", () => {
    const falando = passoDeFala(FALA_INICIAL, acima, 1_000);
    const naPausa = passoDeFala(falando, abaixo, 1_000 + SOLTURA_DA_FALA_MS - 1);
    expect(naPausa.falando).toBe(true);
  });

  it("apaga quando a folga vence", () => {
    const falando = passoDeFala(FALA_INICIAL, acima, 1_000);
    const depois = passoDeFala(falando, abaixo, 1_000 + SOLTURA_DA_FALA_MS);
    expect(depois.falando).toBe(false);
  });

  it("cada sílaba renova a folga", () => {
    let estado = passoDeFala(FALA_INICIAL, acima, 1_000);
    estado = passoDeFala(estado, acima, 1_200);
    expect(estado.ateMs).toBe(1_200 + SOLTURA_DA_FALA_MS);
    expect(passoDeFala(estado, abaixo, 1_300).falando).toBe(true);
  });
});
