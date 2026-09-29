import { describe, expect, it } from "vitest";
import { ladosVisiveis } from "./FileiraDeControles";

describe("ladosVisiveis", () => {
  it("palco largo mostra os dois lados", () => {
    // coluna = (512 - 0 - 64 - 320) / 2 = 64 — os dois cabem, um no limite exato
    expect(ladosVisiveis(512, 320, 40, 64, 0)).toEqual({ esquerda: true, direita: true });
  });

  it("direita maior que a esquerda: só ela transborda a coluna, some sozinha", () => {
    // coluna = (504 - 0 - 64 - 320) / 2 = 60 — esquerda (40) cabe, direita (80) não
    expect(ladosVisiveis(504, 320, 40, 80, 0)).toEqual({ esquerda: true, direita: false });
  });

  it("esquerda não cabe: somem os dois, mesmo se a direita sozinha caberia", () => {
    // mesma coluna de 60; esquerda (100) transborda, direita (50) caberia sozinha
    // mas nunca aparece sem a esquerda
    expect(ladosVisiveis(504, 320, 100, 50, 0)).toEqual({ esquerda: false, direita: false });
  });

  it("sem laterais, os dois \"cabem\" (largura zero contra qualquer coluna não negativa)", () => {
    expect(ladosVisiveis(400, 320, 0, 0, 0)).toEqual({ esquerda: true, direita: true });
  });

  it("esconder a direita não dá mais espaço à esquerda — a coluna é fixa dos dois lados", () => {
    // com direita presente ou ausente a coluna é a mesma conta: só a largura do
    // lado, contra `(raiz - padding - 2·gap - centro) / 2`, nunca "esquerda + direita"
    const semDireita = ladosVisiveis(504, 320, 65, 0, 0);
    const comDireitaPequena = ladosVisiveis(504, 320, 65, 1, 0);
    // coluna = 60 nos dois casos: 65 não cabe em nenhum, escondido ou não o vizinho
    expect(semDireita).toEqual({ esquerda: false, direita: false });
    expect(comDireitaPequena).toEqual({ esquerda: false, direita: false });
  });

  it("a folga reduz a coluna disponível, escondendo um pouco antes do limite exato", () => {
    // sem folga, coluna = 64 e os dois cabem (mesmo caso do primeiro teste)
    expect(ladosVisiveis(512, 320, 40, 64, 0)).toEqual({ esquerda: true, direita: true });
    // com 8px de folga, coluna = (512 - 8 - 64 - 320) / 2 = 60 — a direita (64) não cabe mais
    expect(ladosVisiveis(512, 320, 40, 64, 8)).toEqual({ esquerda: true, direita: false });
  });
});
