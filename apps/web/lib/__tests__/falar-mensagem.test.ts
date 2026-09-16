import { describe, expect, it, vi } from "vitest";
import { limparTextoParaFala, podeFalarMensagem } from "@/lib/falar-mensagem";

/**
 * A limpeza é o que decide o que a fala vai ler: sem marcação do Discord e
 * sem id cru de menção (ninguém entende `<@ckx…>` ouvindo).
 */
describe("limparTextoParaFala", () => {
  it("tira ênfase (negrito, itálico, sublinhado, riscado, spoiler)", () => {
    expect(limparTextoParaFala("**negrito** e *itálico* e __sublinhado__")).toBe(
      "negrito e itálico e sublinhado",
    );
    expect(limparTextoParaFala("~~riscado~~ e ||segredo||")).toBe("riscado e segredo");
    expect(limparTextoParaFala("***tudo junto***")).toBe("tudo junto");
  });

  it("tira bloco e código em linha, mantendo o conteúdo do código em linha", () => {
    expect(limparTextoParaFala("olha isto: ```const x = 1;``` e `y`")).toBe("olha isto: e y");
  });

  it("troca menção crua por uma palavra falável", () => {
    expect(limparTextoParaFala("oi <@abc123>, olha <@&role1> e <#canal1>")).toBe(
      "oi alguém, olha um cargo e um canal",
    );
  });

  it("mantém só o texto visível de link mascarado e imagem", () => {
    expect(limparTextoParaFala("veja [o site](https://exemplo.com)")).toBe("veja o site");
    expect(limparTextoParaFala("![minha foto](https://exemplo.com/x.png)")).toBe("minha foto");
  });

  it("tira marcador de título, subtexto, citação e lista", () => {
    expect(limparTextoParaFala("# Título\n- item um\n> citação")).toBe("Título item um citação");
  });

  it("emoji personalizado vira só o nome", () => {
    expect(limparTextoParaFala("bom dia <:sol:123456789012345678>")).toBe("bom dia sol");
  });

  it("colapsa espaço e quebra de linha", () => {
    expect(limparTextoParaFala("linha um\n\nlinha   dois")).toBe("linha um linha dois");
  });

  it("texto vazio (ou só marcação) vira string vazia", () => {
    expect(limparTextoParaFala("")).toBe("");
    expect(limparTextoParaFala("   ")).toBe("");
    expect(limparTextoParaFala("**  **")).toBe("");
  });
});

describe("podeFalarMensagem", () => {
  it("falso sem `speechSynthesis` no `window`", () => {
    expect(podeFalarMensagem("qualquer coisa")).toBe(false);
  });

  it("falso quando não sobra texto depois de limpar", () => {
    vi.stubGlobal("window", { speechSynthesis: {} });
    expect(podeFalarMensagem("**  **")).toBe(false);
    expect(podeFalarMensagem("oi")).toBe(true);
  });
});
