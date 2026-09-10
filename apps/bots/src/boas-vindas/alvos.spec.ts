import { describe, expect, it } from "vitest";
import { acharPorIdOuNome, idDeCanal, idDeCargo, nomeLimpo } from "./alvos";

describe("idDeCanal", () => {
  it("lê a menção e o id cru", () => {
    expect(idDeCanal("<#123>")).toBe("123");
    expect(idDeCanal(" 123 ")).toBe("123");
  });
  it("devolve null para nome de canal", () => {
    expect(idDeCanal("#geral")).toBeNull();
    expect(idDeCanal("geral")).toBeNull();
  });
  it("não confunde menção de cargo com menção de canal", () => {
    expect(idDeCanal("<@&123>")).toBeNull();
  });
});

describe("idDeCargo", () => {
  it("lê a menção de cargo e o id cru", () => {
    expect(idDeCargo("<@&99>")).toBe("99");
    expect(idDeCargo("99")).toBe("99");
  });
  it("não confunde menção de canal com menção de cargo", () => {
    expect(idDeCargo("<#99>")).toBeNull();
  });
});

describe("nomeLimpo", () => {
  it("tira o # e o @ que a pessoa digitou", () => {
    expect(nomeLimpo(" #Geral ")).toBe("geral");
    expect(nomeLimpo("@Membro")).toBe("membro");
  });
});

describe("acharPorIdOuNome", () => {
  const canais = [
    { id: "1", name: "geral" },
    { id: "2", name: "avisos" },
    // um canal cujo **nome** é o id de outro: o caso que faz o id ter de vir antes
    { id: "3", name: "1" },
  ];

  it("acha por menção", () => {
    expect(acharPorIdOuNome(canais, "<#2>", idDeCanal)?.name).toBe("avisos");
  });
  it("acha por nome, com e sem #", () => {
    expect(acharPorIdOuNome(canais, "#Geral", idDeCanal)?.id).toBe("1");
    expect(acharPorIdOuNome(canais, "avisos", idDeCanal)?.id).toBe("2");
  });
  it("o id ganha do nome quando os dois casam", () => {
    expect(acharPorIdOuNome(canais, "1", idDeCanal)?.id).toBe("1");
  });
  it("devolve null quando não existe", () => {
    expect(acharPorIdOuNome(canais, "#nao-existe", idDeCanal)).toBeNull();
  });
});
