import { describe, expect, it } from "vitest";
import type { CustomEmoji, SelectDeBot as ComponenteDeSelect } from "@streamz/shared";
import {
  dentroDoLimite,
  filtrarPorTexto,
  limitesDoComponente,
  multiploDoComponente,
  normalizarBusca,
  placeholderPadrao,
  resolverEmojiDeOpcao,
  valoresIniciais,
} from "./select-opcoes";

function selectDeTexto(overrides: Partial<ComponenteDeSelect> = {}): ComponenteDeSelect {
  return {
    type: 3,
    custom_id: "c1",
    options: [
      { label: "Formiga", value: "ant" },
      { label: "Borboleta", value: "butterfly", default: true },
    ],
    ...overrides,
  } as ComponenteDeSelect;
}

function selectDeUsuario(overrides: Partial<ComponenteDeSelect> = {}): ComponenteDeSelect {
  return { type: 5, custom_id: "c2", ...overrides } as ComponenteDeSelect;
}

describe("multiploDoComponente / limitesDoComponente", () => {
  it("sem min_values/max_values, o padrão do Discord é 1 e 1 — não múltiplo", () => {
    expect(multiploDoComponente({ max_values: undefined })).toBe(false);
    expect(limitesDoComponente({ min_values: undefined, max_values: undefined })).toEqual({ min: 1, max: 1 });
  });

  it("max_values > 1 é múltiplo", () => {
    expect(multiploDoComponente({ max_values: 3 })).toBe(true);
  });

  it("min_values 0 (nenhuma escolha obrigatória) é respeitado", () => {
    expect(limitesDoComponente({ min_values: 0, max_values: 3 })).toEqual({ min: 0, max: 3 });
  });
});

describe("dentroDoLimite", () => {
  it("aceita a contagem dentro da faixa, inclusive nas pontas", () => {
    expect(dentroDoLimite(1, 1, 3)).toBe(true);
    expect(dentroDoLimite(3, 1, 3)).toBe(true);
  });

  it("recusa abaixo do mínimo e acima do máximo", () => {
    expect(dentroDoLimite(0, 1, 3)).toBe(false);
    expect(dentroDoLimite(4, 1, 3)).toBe(false);
  });
});

describe("valoresIniciais", () => {
  it("select de texto: as options com default: true", () => {
    expect(valoresIniciais(selectDeTexto())).toEqual(["butterfly"]);
  });

  it("select de texto sem nenhuma default: lista vazia", () => {
    expect(
      valoresIniciais(selectDeTexto({ options: [{ label: "Formiga", value: "ant" }] })),
    ).toEqual([]);
  });

  it("select de usuário: os ids de default_values, na ordem em que vieram", () => {
    const c = selectDeUsuario({
      default_values: [
        { id: "u1", type: "user" },
        { id: "u2", type: "user" },
      ],
    });
    expect(valoresIniciais(c)).toEqual(["u1", "u2"]);
  });

  it("select de usuário sem default_values: lista vazia, nunca undefined", () => {
    expect(valoresIniciais(selectDeUsuario())).toEqual([]);
  });
});

describe("normalizarBusca / filtrarPorTexto", () => {
  it("ignora espaço nas pontas e maiúsculas/acento no cotejo (locale pt-BR)", () => {
    expect(normalizarBusca("  Áudio  ")).toBe("áudio");
  });

  it("busca vazia devolve a lista inteira, numa cópia nova", () => {
    const lista = ["a", "b"];
    const resultado = filtrarPorTexto(lista, "", (x) => x);
    expect(resultado).toEqual(lista);
    expect(resultado).not.toBe(lista);
  });

  it("filtra por substring, sem diferenciar caixa", () => {
    const lista = [{ nome: "Geral" }, { nome: "moderação" }, { nome: "off-topic" }];
    expect(filtrarPorTexto(lista, "GER", (x) => x.nome)).toEqual([{ nome: "Geral" }]);
  });
});

describe("placeholderPadrao", () => {
  it("um texto por tipo, nenhum vazio", () => {
    for (const type of [3, 5, 6, 7, 8] as const) {
      expect(placeholderPadrao(type).length).toBeGreaterThan(0);
    }
  });
});

describe("resolverEmojiDeOpcao", () => {
  const emojisDoServidor: CustomEmoji[] = [
    { id: "e1", guildId: "g1", name: "festa", animated: false, url: "https://cdn/e1.png", createdById: "u1" },
  ];

  it("sem emoji, devolve null", () => {
    expect(resolverEmojiDeOpcao(undefined, emojisDoServidor)).toBeNull();
    expect(resolverEmojiDeOpcao(null, emojisDoServidor)).toBeNull();
  });

  it("com id encontrado na store: personalizado, com a url resolvida", () => {
    expect(resolverEmojiDeOpcao({ id: "e1", name: "festa" }, emojisDoServidor)).toEqual({
      tipo: "personalizado",
      url: "https://cdn/e1.png",
      animado: false,
      alt: "festa",
    });
  });

  it("com id que não existe mais no servidor: cai para o nome, como o Discord", () => {
    expect(resolverEmojiDeOpcao({ id: "apagado", name: "festa" }, emojisDoServidor)).toEqual({
      tipo: "nome",
      texto: "festa",
    });
  });

  it("com id que não existe e sem name: null (nada para desenhar)", () => {
    expect(resolverEmojiDeOpcao({ id: "apagado", name: null }, emojisDoServidor)).toBeNull();
  });

  it("sem id, name é o caractere Unicode", () => {
    expect(resolverEmojiDeOpcao({ name: "🔄" }, emojisDoServidor)).toEqual({
      tipo: "unicode",
      caractere: "🔄",
    });
  });
});
