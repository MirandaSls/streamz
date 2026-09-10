import { describe, expect, it } from "vitest";
import { embedDoPainel, linhaDaLista, mensagemDoPainel, truncar } from "./formatar";
import type { Painel } from "./estado";

const base: Painel = {
  canalId: "111",
  titulo: "Cargos do servidor",
  descricao: "Escolha o que quer receber.",
  modo: "normal",
  criadoEm: "2026-01-01T00:00:00.000Z",
  itens: {},
};

describe("embed do painel", () => {
  it("o cargo entra como menção, para acompanhar a renomeação", () => {
    const embed = embedDoPainel({
      ...base,
      itens: { "u:🎧": { cargoId: "cargo-1", rotulo: "Live", emoji: "🎧", paraReagir: "🎧" } },
    });
    expect(embed.description).toContain("<@&cargo-1>");
    expect(embed.description).toContain("🎧");
    expect(embed.description).toContain("Live");
  });

  it("item sem rótulo mostra só o cargo", () => {
    const embed = embedDoPainel({
      ...base,
      itens: { "u:🎧": { cargoId: "cargo-1", rotulo: "", emoji: "🎧", paraReagir: "🎧" } },
    });
    expect(embed.description).toContain("🎧 — <@&cargo-1>");
  });

  it("painel vazio diz qual é o próximo passo", () => {
    expect(embedDoPainel(base).description).toMatch(/painel adicionar/);
  });

  it("o rodapé explica o modo — é onde quem lê descobre que é um por vez", () => {
    expect(embedDoPainel({ ...base, modo: "unico" }).description).toMatch(/um cargo por vez/);
  });

  it("não estoura o limite de 4096 do embed", () => {
    const itens: Painel["itens"] = {};
    for (let i = 0; i < 400; i++) {
      itens[`u:${i}`] = { cargoId: `c${i}`, rotulo: "x".repeat(80), emoji: "🎧", paraReagir: "🎧" };
    }
    expect(embedDoPainel({ ...base, itens }).description!.length).toBeLessThanOrEqual(4000);
  });
});

describe("mensagem do painel", () => {
  it("o título vai no `content` — mensagem só com embed é recusada pela API", () => {
    // `POST /channels/:id/messages` responde `50035 content[BASE_TYPE_REQUIRED]`
    // a uma mensagem sem texto. O painel sem título nenhum não sairia do canal.
    const m = mensagemDoPainel(base);
    expect(m.content).toContain("Cargos do servidor");
    expect(m.content.trim()).not.toBe("");
    expect(m.embeds).toHaveLength(1);
  });

  it("o título não aparece duas vezes", () => {
    const m = mensagemDoPainel(base);
    expect(m.embeds[0]!.title).toBeUndefined();
  });
});

describe("linha da lista", () => {
  it("mostra id, canal, modo e quantos cargos", () => {
    const linha = linhaDaLista("555", {
      ...base,
      modo: "travado",
      itens: { "u:🎧": { cargoId: "c", rotulo: "", emoji: "🎧", paraReagir: "🎧" } },
    });
    expect(linha).toContain("`555`");
    expect(linha).toContain("<#111>");
    expect(linha).toContain("travado");
    expect(linha).toContain("1 cargo");
  });
});

describe("truncar", () => {
  it("não passa do limite pedido, com reticência", () => {
    expect(truncar("abcdef", 4)).toBe("abc…");
    expect(truncar("abc", 4)).toBe("abc");
  });
});
