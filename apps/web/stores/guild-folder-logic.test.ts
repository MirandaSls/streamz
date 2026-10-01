import { describe, expect, it } from "vitest";
import {
  MAX_FOLDER_NAME_LENGTH,
  MAX_GUILDS_PER_FOLDER,
  MAX_GUILD_FOLDERS,
  guildLayoutSchema,
  type GuildFolder,
  type GuildLayout,
  type GuildLayoutItem,
} from "@streamz/shared";
import {
  chaveDoItem,
  colorirPasta,
  localizarServidor,
  moverItemNoTopo,
  removerPasta,
  renomearPasta,
  soltarEntreItens,
  soltarServidorSobrePasta,
  soltarServidorSobreServidor,
  tirarDaPasta,
  todosOsIdsNaOrdemVisual,
} from "@/stores/guild-folder-logic";

function g(guildId: string): GuildLayoutItem {
  return { kind: "guild", guildId };
}

function f(id: string, guildIds: string[], extras: Partial<GuildFolder> = {}): GuildLayoutItem {
  return { kind: "folder", folder: { id, name: null, color: null, guildIds, ...extras } };
}

/**
 * Layout congelado em profundidade: qualquer mutação da entrada lança
 * TypeError (módulo ES = modo estrito), então todo teste também prova que as
 * funções não mexem no que receberam.
 */
function L(...items: GuildLayoutItem[]): GuildLayout {
  for (const item of items) {
    if (item.kind === "folder") {
      Object.freeze(item.folder.guildIds);
      Object.freeze(item.folder);
    }
    Object.freeze(item);
  }
  return Object.freeze({ items: Object.freeze(items) as GuildLayoutItem[] });
}

/** Forma curta do layout para comparar: "a" = solto, "f1[x,y]" = pasta. */
function resumo(layout: GuildLayout): string[] {
  return layout.items.map((item) =>
    item.kind === "guild" ? item.guildId : `${item.folder.id}[${item.folder.guildIds.join(",")}]`,
  );
}

function valido(layout: GuildLayout): boolean {
  return guildLayoutSchema.safeParse(layout).success;
}

function muitasPastas(n: number): GuildLayoutItem[] {
  return Array.from({ length: n }, (_, i) => f(`p${i}`, [`s${i}`]));
}

function pastaCheia(id: string): GuildLayoutItem {
  return f(id, Array.from({ length: MAX_GUILDS_PER_FOLDER }, (_, i) => `c${i}`));
}

describe("chaveDoItem / localizarServidor", () => {
  it("prefixa o tipo na chave", () => {
    expect(chaveDoItem(g("a"))).toBe("guild:a");
    expect(chaveDoItem(f("p", ["a"]))).toBe("folder:p");
  });

  it("acha servidor solto e dentro de pasta", () => {
    const layout = L(g("a"), f("p", ["x", "y"]));
    expect(localizarServidor(layout, "a")).toEqual({ indiceNoTopo: 0, pastaId: null, indiceNaPasta: null });
    expect(localizarServidor(layout, "y")).toEqual({ indiceNoTopo: 1, pastaId: "p", indiceNaPasta: 1 });
    expect(localizarServidor(layout, "fantasma")).toBeNull();
  });
});

describe("soltarServidorSobreServidor", () => {
  it("alvo solto: cria a pasta no lugar do alvo, com [alvo, arrastado]", () => {
    const layout = L(g("a"), g("b"), g("c"));
    const out = soltarServidorSobreServidor(layout, "a", "c", "nova");
    expect(resumo(out)).toEqual(["b", "nova[c,a]"]);
    expect(out.items[1]).toEqual(f("nova", ["c", "a"]));
    expect(valido(out)).toBe(true);
  });

  it("alvo solto acima do arrastado: a pasta fica na posição do alvo", () => {
    const out = soltarServidorSobreServidor(L(g("a"), g("b"), g("c")), "c", "a", "nova");
    expect(resumo(out)).toEqual(["nova[a,c]", "b"]);
  });

  it("arrastado sai de outra pasta, que continua com o resto", () => {
    const out = soltarServidorSobreServidor(L(f("p1", ["x", "y"]), g("a")), "x", "a", "nova");
    expect(resumo(out)).toEqual(["p1[y]", "nova[a,x]"]);
  });

  it("arrastado sai de pasta que esvazia: ela some", () => {
    const out = soltarServidorSobreServidor(L(f("p1", ["x"]), g("a")), "x", "a", "nova");
    expect(resumo(out)).toEqual(["nova[a,x]"]);
    expect(valido(out)).toBe(true);
  });

  it("pode reaproveitar o id da pasta que acabou de sumir", () => {
    const out = soltarServidorSobreServidor(L(f("p1", ["x"]), g("a")), "x", "a", "p1");
    expect(resumo(out)).toEqual(["p1[a,x]"]);
  });

  it("alvo dentro de pasta: o arrastado entra logo depois do alvo", () => {
    const layout = L(f("p1", ["x", "y"], { name: "Jogos", color: "#ff0000" }), g("a"));
    const out = soltarServidorSobreServidor(layout, "a", "x", "nova");
    expect(resumo(out)).toEqual(["p1[x,a,y]"]);
    // nome e cor da pasta de destino não se perdem
    expect(out.items[0]).toEqual(f("p1", ["x", "a", "y"], { name: "Jogos", color: "#ff0000" }));
  });

  it("alvo em pasta, arrastado de outra pasta que esvazia", () => {
    const out = soltarServidorSobreServidor(L(f("p1", ["x"]), f("p2", ["y"])), "x", "y", "nova");
    expect(resumo(out)).toEqual(["p2[y,x]"]);
  });

  it("reordena dentro da mesma pasta", () => {
    const out = soltarServidorSobreServidor(L(f("p1", ["x", "y", "z"])), "z", "x", "nova");
    expect(resumo(out)).toEqual(["p1[x,z,y]"]);
  });

  it("soltar onde já estava devolve o mesmo objeto", () => {
    const layout = L(f("p1", ["x", "y"]));
    expect(soltarServidorSobreServidor(layout, "y", "x", "nova")).toBe(layout);
  });

  it("sobre si mesmo: inalterado", () => {
    const layout = L(g("a"), g("b"));
    expect(soltarServidorSobreServidor(layout, "a", "a", "nova")).toBe(layout);
  });

  it("servidor desconhecido (arrastado ou alvo): inalterado", () => {
    const layout = L(g("a"), g("b"));
    expect(soltarServidorSobreServidor(layout, "fantasma", "a", "nova")).toBe(layout);
    expect(soltarServidorSobreServidor(layout, "a", "fantasma", "nova")).toBe(layout);
  });

  it("id de pasta nova que já existe: inalterado", () => {
    const layout = L(f("p1", ["x"]), g("a"), g("b"));
    expect(soltarServidorSobreServidor(layout, "a", "b", "p1")).toBe(layout);
  });

  it(`não cria a pasta ${MAX_GUILD_FOLDERS + 1}`, () => {
    const layout = L(...muitasPastas(MAX_GUILD_FOLDERS), g("a"), g("b"));
    expect(soltarServidorSobreServidor(layout, "a", "b", "nova")).toBe(layout);
  });

  it("no teto de pastas, cria se a de origem esvaziar (a conta não sobe)", () => {
    const layout = L(...muitasPastas(MAX_GUILD_FOLDERS), g("a"));
    const out = soltarServidorSobreServidor(layout, "s0", "a", "nova");
    expect(out).not.toBe(layout);
    expect(out.items.filter((i) => i.kind === "folder")).toHaveLength(MAX_GUILD_FOLDERS);
    expect(resumo(out).at(-1)).toBe("nova[a,s0]");
    expect(valido(out)).toBe(true);
  });

  it(`não põe o servidor ${MAX_GUILDS_PER_FOLDER + 1} numa pasta`, () => {
    const layout = L(pastaCheia("p1"), g("a"));
    expect(soltarServidorSobreServidor(layout, "a", "c0", "nova")).toBe(layout);
  });

  it("reordenar dentro de pasta cheia continua permitido", () => {
    const layout = L(pastaCheia("p1"));
    const out = soltarServidorSobreServidor(layout, "c5", "c0", "nova");
    expect(out).not.toBe(layout);
    const pasta = out.items[0] as Extract<GuildLayoutItem, { kind: "folder" }>;
    expect(pasta.folder.guildIds.slice(0, 3)).toEqual(["c0", "c5", "c1"]);
    expect(pasta.folder.guildIds).toHaveLength(MAX_GUILDS_PER_FOLDER);
  });
});

describe("soltarServidorSobrePasta", () => {
  it("servidor solto entra no fim da pasta", () => {
    const out = soltarServidorSobrePasta(L(g("a"), f("p1", ["x", "y"])), "a", "p1");
    expect(resumo(out)).toEqual(["p1[x,y,a]"]);
    expect(valido(out)).toBe(true);
  });

  it("vindo de outra pasta que esvazia: ela some", () => {
    const out = soltarServidorSobrePasta(L(f("p1", ["x"]), f("p2", ["y"])), "x", "p2");
    expect(resumo(out)).toEqual(["p2[y,x]"]);
  });

  it("vindo de outra pasta que continua", () => {
    const out = soltarServidorSobrePasta(L(f("p1", ["x", "z"]), f("p2", ["y"])), "x", "p2");
    expect(resumo(out)).toEqual(["p1[z]", "p2[y,x]"]);
  });

  it("já está na pasta: inalterado (não salta para o fim)", () => {
    const layout = L(f("p1", ["x", "y"]));
    expect(soltarServidorSobrePasta(layout, "x", "p1")).toBe(layout);
  });

  it("pasta ou servidor desconhecido: inalterado", () => {
    const layout = L(g("a"), f("p1", ["x"]));
    expect(soltarServidorSobrePasta(layout, "a", "fantasma")).toBe(layout);
    expect(soltarServidorSobrePasta(layout, "fantasma", "p1")).toBe(layout);
  });

  it("pasta cheia: inalterado", () => {
    const layout = L(g("a"), pastaCheia("p1"));
    expect(soltarServidorSobrePasta(layout, "a", "p1")).toBe(layout);
  });
});

describe("moverItemNoTopo", () => {
  it("desce uma pasta inteira (índice medido com ela no lugar)", () => {
    const layout = L(f("p1", ["x"]), g("a"), g("b"));
    expect(resumo(moverItemNoTopo(layout, "folder:p1", 2))).toEqual(["a", "p1[x]", "b"]);
    expect(resumo(moverItemNoTopo(layout, "folder:p1", 3))).toEqual(["a", "b", "p1[x]"]);
  });

  it("sobe uma pasta para o topo", () => {
    const out = moverItemNoTopo(L(g("a"), g("b"), f("p1", ["x"])), "folder:p1", 0);
    expect(resumo(out)).toEqual(["p1[x]", "a", "b"]);
  });

  it("move servidor solto pela chave", () => {
    const out = moverItemNoTopo(L(g("a"), g("b"), g("c")), "guild:a", 2);
    expect(resumo(out)).toEqual(["b", "a", "c"]);
  });

  it("soltar no vão de cima ou de baixo de si mesmo: mesmo objeto", () => {
    const layout = L(g("a"), f("p1", ["x"]), g("b"));
    expect(moverItemNoTopo(layout, "folder:p1", 1)).toBe(layout);
    expect(moverItemNoTopo(layout, "folder:p1", 2)).toBe(layout);
  });

  it("índice fora da faixa é preso às pontas", () => {
    const layout = L(f("p1", ["x"]), g("a"));
    expect(resumo(moverItemNoTopo(layout, "folder:p1", 99))).toEqual(["a", "p1[x]"]);
    expect(resumo(moverItemNoTopo(layout, "guild:a", -5))).toEqual(["a", "p1[x]"]);
  });

  it("chave desconhecida, ou id sem o prefixo: inalterado", () => {
    const layout = L(f("p1", ["x"]), g("a"));
    expect(moverItemNoTopo(layout, "folder:fantasma", 0)).toBe(layout);
    expect(moverItemNoTopo(layout, "p1", 2)).toBe(layout);
  });
});

describe("tirarDaPasta", () => {
  it("tira de pasta que continua e solta antes de tudo", () => {
    const out = tirarDaPasta(L(g("a"), f("p1", ["x", "y"]), g("b")), "x", 0);
    expect(resumo(out)).toEqual(["x", "a", "p1[y]", "b"]);
  });

  it("tira de pasta que continua e solta no fim", () => {
    const out = tirarDaPasta(L(g("a"), f("p1", ["x", "y"]), g("b")), "x", 3);
    expect(resumo(out)).toEqual(["a", "p1[y]", "b", "x"]);
  });

  it("pasta que esvazia some e o índice desconta o lugar dela", () => {
    const layout = L(g("a"), f("p1", ["x"]), g("b"));
    // vão 2 = entre a pasta e "b": sem a pasta, o servidor fica onde ela estava
    expect(resumo(tirarDaPasta(layout, "x", 2))).toEqual(["a", "x", "b"]);
    expect(resumo(tirarDaPasta(layout, "x", 3))).toEqual(["a", "b", "x"]);
    expect(resumo(tirarDaPasta(layout, "x", 0))).toEqual(["x", "a", "b"]);
  });

  it("servidor já solto apenas muda de lugar", () => {
    const layout = L(g("a"), g("b"), g("c"));
    expect(resumo(tirarDaPasta(layout, "a", 2))).toEqual(["b", "a", "c"]);
    expect(tirarDaPasta(layout, "a", 1)).toBe(layout);
  });

  it("servidor desconhecido: inalterado", () => {
    const layout = L(g("a"));
    expect(tirarDaPasta(layout, "fantasma", 0)).toBe(layout);
  });
});

describe("soltarEntreItens", () => {
  it("id de pasta move a pasta inteira", () => {
    const out = soltarEntreItens(L(f("p1", ["x", "y"]), g("a")), "p1", 2);
    expect(resumo(out)).toEqual(["a", "p1[x,y]"]);
  });

  it("id de servidor em pasta o deixa solto no vão", () => {
    const out = soltarEntreItens(L(f("p1", ["x", "y"]), g("a")), "y", 2);
    expect(resumo(out)).toEqual(["p1[x]", "a", "y"]);
    expect(valido(out)).toBe(true);
  });

  it("id de servidor solto o reordena", () => {
    const out = soltarEntreItens(L(g("a"), g("b")), "b", 0);
    expect(resumo(out)).toEqual(["b", "a"]);
  });

  it("id desconhecido: inalterado", () => {
    const layout = L(g("a"));
    expect(soltarEntreItens(layout, "fantasma", 0)).toBe(layout);
  });
});

describe("renomearPasta", () => {
  const layout = L(f("p1", ["x"], { name: "Jogos" }), g("a"));

  it("apara o nome", () => {
    const out = renomearPasta(layout, "p1", "  Trabalho  ");
    expect(out.items[0]).toEqual(f("p1", ["x"], { name: "Trabalho" }));
  });

  it("vazio, só espaços ou null voltam a null (nome derivado)", () => {
    for (const nome of ["", "   ", null]) {
      const out = renomearPasta(layout, "p1", nome);
      expect((out.items[0] as Extract<GuildLayoutItem, { kind: "folder" }>).folder.name).toBeNull();
    }
  });

  it(`corta em ${MAX_FOLDER_NAME_LENGTH} sem partir emoji`, () => {
    const longo = "a".repeat(MAX_FOLDER_NAME_LENGTH + 10);
    const cortado = renomearPasta(layout, "p1", longo);
    const nome = (cortado.items[0] as Extract<GuildLayoutItem, { kind: "folder" }>).folder.name;
    expect(nome).toBe("a".repeat(MAX_FOLDER_NAME_LENGTH));
    expect(valido(cortado)).toBe(true);

    // o emoji ocupa 2 unidades UTF-16: não cabe inteiro, então sai inteiro
    const comEmoji = "a".repeat(MAX_FOLDER_NAME_LENGTH - 1) + "😀";
    const out = renomearPasta(layout, "p1", comEmoji);
    const nomeEmoji = (out.items[0] as Extract<GuildLayoutItem, { kind: "folder" }>).folder.name;
    expect(nomeEmoji).toBe("a".repeat(MAX_FOLDER_NAME_LENGTH - 1));
    expect(valido(out)).toBe(true);
  });

  it("mesmo nome (depois de aparar) devolve o mesmo objeto", () => {
    expect(renomearPasta(layout, "p1", " Jogos ")).toBe(layout);
  });

  it("pasta desconhecida: inalterado", () => {
    expect(renomearPasta(layout, "fantasma", "X")).toBe(layout);
  });
});

describe("colorirPasta", () => {
  const layout = L(f("p1", ["x"], { color: "#00ff00" }));

  it("troca a cor e volta à padrão com null", () => {
    const vermelha = colorirPasta(layout, "p1", "#FF0000");
    expect(vermelha.items[0]).toEqual(f("p1", ["x"], { color: "#FF0000" }));
    const padrao = colorirPasta(layout, "p1", null);
    expect(padrao.items[0]).toEqual(f("p1", ["x"], { color: null }));
  });

  it("cor fora de #RRGGBB: inalterado", () => {
    for (const cor of ["red", "#fff", "#12345g", "00ff00"]) {
      expect(colorirPasta(layout, "p1", cor)).toBe(layout);
    }
  });

  it("mesma cor ou pasta desconhecida: mesmo objeto", () => {
    expect(colorirPasta(layout, "p1", "#00ff00")).toBe(layout);
    expect(colorirPasta(layout, "fantasma", "#ff0000")).toBe(layout);
  });
});

describe("removerPasta", () => {
  it("solta os servidores no lugar da pasta, na mesma ordem", () => {
    const out = removerPasta(L(g("a"), f("p1", ["x", "y"]), g("b")), "p1");
    expect(resumo(out)).toEqual(["a", "x", "y", "b"]);
    expect(valido(out)).toBe(true);
  });

  it("pasta desconhecida: inalterado", () => {
    const layout = L(g("a"));
    expect(removerPasta(layout, "fantasma")).toBe(layout);
  });
});

describe("todosOsIdsNaOrdemVisual", () => {
  it("inclui os de pasta aberta e pula os de pasta fechada", () => {
    const layout = L(g("a"), f("p1", ["x", "y"]), f("p2", ["z"]), g("b"));
    expect(todosOsIdsNaOrdemVisual(layout, new Set(["p1"]))).toEqual(["a", "x", "y", "b"]);
    expect(todosOsIdsNaOrdemVisual(layout, new Set())).toEqual(["a", "b"]);
  });
});
