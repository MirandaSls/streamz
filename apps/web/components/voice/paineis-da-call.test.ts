import { describe, expect, it } from "vitest";
import { cliqueNosMembros, membrosVisiveis, painelDaCall } from "./paineis-da-call";

describe("só um painel na coluna da direita", () => {
  it("sem nada ligado a coluna não existe", () => {
    expect(painelDaCall(false, false)).toBeNull();
  });

  it("só a lista ligada mostra a lista", () => {
    expect(painelDaCall(false, true)).toBe("membros");
  });

  it("só a conversa aberta mostra a conversa", () => {
    expect(painelDaCall(true, false)).toBe("chat");
  });

  it("os dois ligados: a conversa da call ganha (print 102429)", () => {
    expect(painelDaCall(true, true)).toBe("chat");
    expect(membrosVisiveis(true, true)).toBe(false);
  });

  it("no canal de texto a regra é transparente: vale o `membersOpen`", () => {
    // lá não há conversa de call, então `chatAberto` é sempre falso
    expect(membrosVisiveis(false, true)).toBe(true);
    expect(membrosVisiveis(false, false)).toBe(false);
  });
});

describe("o clique no ícone de pessoas", () => {
  it("com a lista visível, esconde a lista e não mexe na conversa", () => {
    expect(cliqueNosMembros(false, true)).toEqual({ membros: false, fecharChat: false });
  });

  it("com nada na tela, liga a lista", () => {
    expect(cliqueNosMembros(false, false)).toEqual({ membros: true, fecharChat: false });
  });

  it("com a conversa aberta, mostra a lista fechando a conversa", () => {
    expect(cliqueNosMembros(true, true)).toEqual({ membros: true, fecharChat: true });
  });

  it("conversa aberta e lista desligada: um clique só já traz a lista", () => {
    // o defeito que a regra evita: alternar cegamente `membersOpen` aqui
    // ligaria a lista sem fechar a conversa, e nada mudaria na tela
    expect(cliqueNosMembros(true, false)).toEqual({ membros: true, fecharChat: true });
  });

  it("clicar duas vezes volta ao começo, sem reabrir a conversa fechada", () => {
    const primeiro = cliqueNosMembros(true, true);
    expect(primeiro).toEqual({ membros: true, fecharChat: true });
    // depois do primeiro clique a conversa está fechada e a lista ligada
    const segundo = cliqueNosMembros(false, primeiro.membros);
    expect(segundo).toEqual({ membros: false, fecharChat: false });
  });
});
