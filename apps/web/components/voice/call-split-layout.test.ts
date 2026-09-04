import { describe, expect, it } from "vitest";
import {
  LARGURA_MIN,
  LARGURA_PADRAO,
  PALCO_MIN,
  larguraDoChat,
  larguraGuardavel,
  tetoDoChat,
} from "./call-split-layout";

describe("teto da conversa", () => {
  it("deixa o palco com o piso dele", () => {
    expect(tetoDoChat(1600)).toBe(1600 - PALCO_MIN);
  });

  it("em coluna curta o piso da conversa vence o do palco", () => {
    expect(tetoDoChat(500)).toBe(LARGURA_MIN);
  });
});

describe("largura da conversa", () => {
  it("respeita a preferência quando cabe", () => {
    expect(larguraDoChat(LARGURA_PADRAO, 1900)).toBe(LARGURA_PADRAO);
  });

  it("não engole o palco", () => {
    expect(larguraDoChat(1800, 1900)).toBe(1900 - PALCO_MIN);
  });

  it("não some de vez", () => {
    expect(larguraDoChat(40, 1900)).toBe(LARGURA_MIN);
  });

  it("sem medida ainda, devolve o padrão medido na print", () => {
    expect(larguraDoChat(999, 0)).toBe(LARGURA_PADRAO);
  });
});

describe("largura guardável", () => {
  it("aceita a faixa sensata", () => {
    expect(larguraGuardavel(520)).toBe(520);
  });

  it("ignora lixo e extremos", () => {
    expect(larguraGuardavel(Number.NaN)).toBeNull();
    expect(larguraGuardavel(12)).toBeNull();
    expect(larguraGuardavel(4000)).toBeNull();
  });
});
