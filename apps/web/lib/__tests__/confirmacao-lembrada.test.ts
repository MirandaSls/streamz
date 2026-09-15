import { describe, expect, it, vi } from "vitest";
import { confirmacaoLembrada, lembrarConfirmacao } from "@/lib/confirmacao-lembrada";

/**
 * "Não perguntar de novo": a escolha é por chave, fica no `localStorage` com o
 * prefixo do app e, se o armazenamento falhar, a confirmação volta a aparecer
 * (o lado seguro) em vez de lançar.
 */
describe("confirmação lembrada", () => {
  it("começa sem nada lembrado", () => {
    expect(confirmacaoLembrada("apagar-mensagem")).toBe(false);
  });

  it("lembra só a chave marcada, com o prefixo do app", () => {
    lembrarConfirmacao("apagar-mensagem");
    expect(confirmacaoLembrada("apagar-mensagem")).toBe(true);
    expect(confirmacaoLembrada("outra-coisa")).toBe(false);
    expect(localStorage.getItem("streamz:confirmacao:apagar-mensagem")).not.toBeNull();
  });

  it("armazenamento que lança vira `false`, sem erro", () => {
    const quebrado = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    vi.stubGlobal("window", { localStorage: quebrado });
    expect(() => lembrarConfirmacao("apagar-mensagem")).not.toThrow();
    expect(confirmacaoLembrada("apagar-mensagem")).toBe(false);
  });
});
