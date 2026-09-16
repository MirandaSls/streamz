import { describe, expect, it } from "vitest";
import type { ComandoDeApp, PublicUser } from "@streamz/shared";
import { aplicarEscolha, detectarGatilho, estadoDaListaDoBot, mover } from "../composer-autocomplete";
import {
  GRUPO_NATIVOS,
  agruparComandos,
  aplicarValorDeOpcao,
  buscarComandos,
  chaveDeEscolha,
  estadoDoComando,
  interpretarComando,
  pedidoDeAutocomplete,
  separarComando,
  type EscolhaFeita,
} from "../comandos-barra";
import { buscarEmojisUnicode } from "../emojis-unicode";

/** Atalho: detecta com o cursor no fim do texto (o caso normal ao digitar). */
function no(texto: string) {
  return detectarGatilho(texto, texto.length);
}

describe("detectarGatilho", () => {
  it("abre no `:` só depois de duas letras", () => {
    expect(no("oi :f")).toBeNull();
    expect(no("oi :fe")).toMatchObject({ tipo: ":", termo: "fe", inicio: 3 });
  });

  it("abre no `@` já no primeiro caractere", () => {
    expect(no("@")).toMatchObject({ tipo: "@", termo: "" });
    expect(no("fala @ana")).toMatchObject({ tipo: "@", termo: "ana", inicio: 5 });
  });

  it("abre no `#` para canal", () => {
    expect(no("vai pro #ger")).toMatchObject({ tipo: "#", termo: "ger" });
  });

  it("`/` só vale no começo da mensagem", () => {
    expect(no("/shr")).toMatchObject({ tipo: "/", termo: "shr" });
    expect(no("caminho /usr")).toBeNull();
  });

  // ── j-bots ── o nome de um comando de barra do Discord aceita `[-_a-z0-9]`,
  // e um bot pode registrar `/play-next`. Com o padrão antigo (`[a-z]*`) o
  // popup sumia no instante do hífen ou do dígito, escondendo um comando que
  // existe e que o composer aceita enviar.
  it("aceita hífen, dígito e sublinhado no nome do comando (comandos de bot)", () => {
    expect(no("/play-next")).toMatchObject({ tipo: "/", termo: "play-next" });
    expect(no("/r6stats")).toMatchObject({ tipo: "/", termo: "r6stats" });
    expect(no("/nota_fiscal")).toMatchObject({ tipo: "/", termo: "nota_fiscal" });
    // o espaço continua fechando o popup: é onde o argumento começa
    expect(no("/play never gonna")).toBeNull();
  });

  it("não abre no meio de uma palavra", () => {
    expect(no("email@dominio")).toBeNull();
    expect(no("10:30:00")).toBeNull();
  });

  it("espaço encerra o termo", () => {
    expect(no("@ana beleza")).toBeNull();
    expect(no(":festa: e mais")).toBeNull();
  });

  it("respeita a posição do cursor, não o fim do texto", () => {
    const texto = "@an resto";
    expect(detectarGatilho(texto, 3)).toMatchObject({ tipo: "@", termo: "an" });
    expect(detectarGatilho(texto, 9)).toBeNull();
  });

  it("pega o gatilho mais recente quando há vários", () => {
    expect(no("@ana olha :fes")).toMatchObject({ tipo: ":", termo: "fes" });
  });
});

describe("aplicarEscolha", () => {
  it("troca o trecho e deixa o cursor depois do espaço", () => {
    const texto = "fala @an";
    const g = detectarGatilho(texto, texto.length)!;
    const r = aplicarEscolha(texto, g, "@ana");
    expect(r.texto).toBe("fala @ana ");
    expect(r.caret).toBe(10);
  });

  it("não duplica o espaço quando já existe um depois", () => {
    const texto = "fala @an tudo bem";
    const g = detectarGatilho(texto, 8)!;
    const r = aplicarEscolha(texto, g, "@ana");
    expect(r.texto).toBe("fala @ana tudo bem");
  });

  it("preserva o que vinha antes do gatilho", () => {
    const texto = "bom dia :fes";
    const g = detectarGatilho(texto, texto.length)!;
    expect(aplicarEscolha(texto, g, ":festa:").texto).toBe("bom dia :festa: ");
  });
});

describe("mover", () => {
  it("circula nas duas pontas", () => {
    expect(mover(0, -1, 3)).toBe(2);
    expect(mover(2, 1, 3)).toBe(0);
    expect(mover(0, 1, 0)).toBe(0);
  });
});

describe("comandos de barra", () => {
  it("separa nome e argumento", () => {
    expect(separarComando("/me dança")).toEqual({ nome: "me", argumento: "dança" });
    expect(separarComando("/shrug")).toEqual({ nome: "shrug", argumento: "" });
    expect(separarComando("oi /me")).toBeNull();
  });

  it("/shrug acrescenta o sufixo ao que foi escrito", () => {
    expect(interpretarComando("/shrug deu ruim")).toEqual({
      tipo: "enviar",
      content: "deu ruim ¯\\_(ツ)_/¯",
    });
    expect(interpretarComando("/shrug")).toEqual({ tipo: "enviar", content: "¯\\_(ツ)_/¯" });
  });

  it("/me vira itálico e /spoiler embrulha tudo", () => {
    expect(interpretarComando("/me chegou")).toEqual({ tipo: "enviar", content: "*chegou*" });
    expect(interpretarComando("/spoiler ele morre")).toEqual({
      tipo: "enviar",
      content: "||ele morre||",
    });
  });

  it("/giphy abre o seletor com o termo", () => {
    expect(interpretarComando("/giphy gato")).toEqual({ tipo: "gif", termo: "gato" });
  });

  it("/nick muda ou remove o apelido no servidor", () => {
    expect(interpretarComando("/nick João")).toEqual({
      tipo: "apelido",
      apelido: "João",
    });
    expect(interpretarComando("/nick")).toEqual({ tipo: "apelido", apelido: "" });
  });

  it("texto comum não é comando", () => {
    expect(interpretarComando("bom dia")).toEqual({ tipo: "nenhum" });
    expect(interpretarComando("2/3 do total")).toEqual({ tipo: "nenhum" });
  });

  it("comando inexistente é reportado, não enviado às cegas", () => {
    expect(interpretarComando("/xyz")).toEqual({ tipo: "desconhecido", nome: "xyz" });
  });

  it("busca por prefixo", () => {
    expect(buscarComandos("s").map((c) => c.nome)).toEqual(["shrug", "spoiler"]);
    expect(buscarComandos("").length).toBeGreaterThan(4);
  });
});

describe("buscarEmojisUnicode", () => {
  it("prefixo vem antes de quem só contém o termo", () => {
    const r = buscarEmojisUnicode("fire");
    expect(r[0]?.nome).toBe("fire");
  });

  it("encontra por palavra em português", () => {
    expect(buscarEmojisUnicode("foguete").map((e) => e.nome)).toContain("rocket");
  });

  it("respeita o limite", () => {
    expect(buscarEmojisUnicode("", 3)).toHaveLength(3);
  });
});

// ── onda 3 · autocomplete de opção pedido ao bot (cartão 3g) ────────────────

const BOT_AC: PublicUser = {
  id: "u-bot",
  username: "musicabot",
  displayName: "Música Bot",
  avatarUrl: null,
  status: "ONLINE",
  customStatusText: null,
  customStatusEmoji: null,
  bot: true,
};

/** `/tocar musica:<autocomplete> volume:<4, autocomplete> fonte:<choices>` */
const TOCAR: ComandoDeApp = {
  id: "cmd-tocar",
  snowflake: "2000",
  name: "tocar",
  description: "Toca uma música",
  options: [
    { name: "musica", description: "", type: 3, required: true, autocomplete: true },
    { name: "volume", description: "", type: 4, required: false, autocomplete: true },
    {
      name: "fonte",
      description: "",
      type: 3,
      required: false,
      choices: [
        { name: "YouTube", value: "yt" },
        { name: "SoundCloud", value: "sc" },
      ],
    },
  ],
  applicationId: "app1",
  applicationName: "Música",
  botUser: BOT_AC,
};

/** Estado e pedido com o cursor no fim do texto. */
function pedidoNoFim(texto: string, escolhas?: ReadonlyMap<string, EscolhaFeita>) {
  const estado = estadoDoComando(texto, texto.length, [TOCAR]);
  if (!estado) throw new Error("sem estado");
  return pedidoDeAutocomplete(texto, estado, escolhas);
}

describe("pedidoDeAutocomplete", () => {
  it("a opção em foco vai com focused e o texto digitado", () => {
    expect(pedidoNoFim("/tocar musica:never gon")).toEqual({
      commandId: "cmd-tocar",
      chave: "cmd-tocar:musica",
      options: [{ name: "musica", type: 3, value: "never gon", focused: true }],
    });
  });

  it("abre já com o valor vazio, no instante em que a opção fica ativa", () => {
    expect(pedidoNoFim("/tocar musica:")?.options).toEqual([
      { name: "musica", type: 3, value: "", focused: true },
    ]);
  });

  it("número em foco vai **em texto**, como no Discord", () => {
    expect(pedidoNoFim("/tocar musica:abc volume:7")?.options).toEqual([
      { name: "musica", type: 3, value: "abc" },
      { name: "volume", type: 4, value: "7", focused: true },
    ]);
  });

  it("as outras opções vão convertidas, e escolha fixa pelo value", () => {
    expect(pedidoNoFim("/tocar fonte:YouTube volume:30 musica:ra")?.options).toEqual([
      { name: "musica", type: 3, value: "ra", focused: true },
      { name: "volume", type: 4, value: 30 },
      { name: "fonte", type: 3, value: "yt" },
    ]);
  });

  it("aspas abertas não entram no texto procurado", () => {
    expect(pedidoNoFim('/tocar musica:"never gon')?.options[0]).toMatchObject({ value: "never gon" });
  });

  it("opção com choices continua local: não há pedido", () => {
    expect(pedidoNoFim("/tocar musica:abc fonte:You")).toBeNull();
  });

  it("opção sem autocomplete, nativo e nenhuma opção ativa: não há pedido", () => {
    const semAc: ComandoDeApp = { ...TOCAR, options: [{ name: "musica", description: "", type: 3, required: true }] };
    const e1 = estadoDoComando("/tocar musica:a", 15, [semAc]);
    expect(e1 && pedidoDeAutocomplete("/tocar musica:a", e1)).toBeNull();
    const e2 = estadoDoComando("/me dança", 9, [TOCAR]);
    expect(e2 && pedidoDeAutocomplete("/me dança", e2)).toBeNull();
    const e3 = estadoDoComando("/tocar ", 7, [TOCAR]);
    expect(e3 && pedidoDeAutocomplete("/tocar ", e3)).toBeNull();
  });

  it("a escolha feita numa opção já preenchida vai pelo value", () => {
    const escolhas = new Map([[chaveDeEscolha("cmd-tocar", "musica"), { name: "Never Gonna Give You Up", value: "dQw4" }]]);
    expect(pedidoNoFim('/tocar musica:"Never Gonna Give You Up" volume:', escolhas)?.options).toEqual([
      { name: "musica", type: 3, value: "dQw4" },
      { name: "volume", type: 4, value: "", focused: true },
    ]);
  });
});

describe("interpretarComando com escolhas do autocomplete", () => {
  const escolhas = new Map<string, EscolhaFeita>([
    [chaveDeEscolha("cmd-tocar", "musica"), { name: "Never Gonna Give You Up", value: "dQw4" }],
    [chaveDeEscolha("cmd-tocar", "volume"), { name: "Alto (80)", value: 80 }],
  ]);

  it("o campo mostra o name e o bot recebe o value, no tipo da opção", () => {
    expect(interpretarComando('/tocar musica:"Never Gonna Give You Up" volume:"Alto (80)"', [TOCAR], escolhas)).toEqual({
      tipo: "interacao",
      commandId: "cmd-tocar",
      opcoes: [
        { name: "musica", type: 3, value: "dQw4" },
        { name: "volume", type: 4, value: 80 },
      ],
    });
  });

  it("texto editado depois da escolha vale como foi escrito", () => {
    expect(interpretarComando("/tocar musica:outra coisa", [TOCAR], escolhas)).toEqual({
      tipo: "interacao",
      commandId: "cmd-tocar",
      opcoes: [{ name: "musica", type: 3, value: "outra coisa" }],
    });
  });

  it("sem escolhas, o comportamento de antes", () => {
    expect(interpretarComando("/tocar musica:abc", [TOCAR])).toEqual({
      tipo: "interacao",
      commandId: "cmd-tocar",
      opcoes: [{ name: "musica", type: 3, value: "abc" }],
    });
  });
});

describe("estadoDaListaDoBot", () => {
  const base = { chave: "c:musica", carregando: false, falhou: false, escolhas: [] as unknown[] };

  it("carregando enquanto a store não tem a opção pedida", () => {
    expect(estadoDaListaDoBot("c:musica", null)).toBe("carregando");
    expect(estadoDaListaDoBot("c:musica", { ...base, chave: "c:volume", falhou: true })).toBe("carregando");
    expect(estadoDaListaDoBot("c:musica", { ...base, carregando: true })).toBe("carregando");
  });

  it("com escolhas na mão mostra a lista, mesmo esperando o pedido novo", () => {
    expect(estadoDaListaDoBot("c:musica", { ...base, carregando: true, escolhas: [{}] })).toBe("pronto");
  });

  it("vazio quando o bot respondeu sem nada; falhou quando a store marcou falha", () => {
    expect(estadoDaListaDoBot("c:musica", base)).toBe("vazio");
    expect(estadoDaListaDoBot("c:musica", { ...base, falhou: true })).toBe("falhou");
  });
});

// ── rodada de correção · aspas no name de escolha do bot ────────────────────
//
// O `name` que o bot devolve é livre. Antes nada era escapado: um `volume:`
// dentro do nome virava marca de opção e cortava o valor, e aspas no nome não
// voltavam iguais — a escolha feita deixava de casar e o bot recebia o texto em
// vez do `value`.

/** Escolhe `nome` na opção `musica` a partir de `/tocar musica:`. */
function escolherMusica(nome: string) {
  const texto = "/tocar musica:";
  const estado = estadoDoComando(texto, texto.length, [TOCAR]);
  if (!estado) throw new Error("sem estado");
  return aplicarValorDeOpcao(texto, texto.length, estado, nome);
}

describe("aspas e nome:valor dentro do name da escolha", () => {
  it("aspas no nome são escapadas e voltam iguais", () => {
    const r = escolherMusica('Diga "oi" agora');
    expect(r.texto).toBe('/tocar musica:"Diga \\"oi\\" agora" ');
    expect(interpretarComando(r.texto, [TOCAR])).toEqual({
      tipo: "interacao",
      commandId: "cmd-tocar",
      opcoes: [{ name: "musica", type: 3, value: 'Diga "oi" agora' }],
    });
    const escolhas = new Map([[chaveDeEscolha("cmd-tocar", "musica"), { name: 'Diga "oi" agora', value: "id-oi" }]]);
    expect(interpretarComando(r.texto, [TOCAR], escolhas)).toEqual({
      tipo: "interacao",
      commandId: "cmd-tocar",
      opcoes: [{ name: "musica", type: 3, value: "id-oi" }],
    });
  });

  it("nome que começa e termina com aspas, sem espaço, também vai embrulhado", () => {
    const r = escolherMusica('"Hino"');
    expect(r.texto).toBe('/tocar musica:"\\"Hino\\"" ');
    const escolhas = new Map([[chaveDeEscolha("cmd-tocar", "musica"), { name: '"Hino"', value: "id-hino" }]]);
    expect(interpretarComando(r.texto, [TOCAR], escolhas)).toMatchObject({
      opcoes: [{ name: "musica", type: 3, value: "id-hino" }],
    });
  });

  it("`outra:` dentro do nome não vira marca de opção", () => {
    const nome = "Remix volume:11 edição";
    const r = escolherMusica(nome);
    expect(r.texto).toBe('/tocar musica:"Remix volume:11 edição" ');
    expect(estadoDoComando(r.texto, r.caret, [TOCAR])?.marcadas).toEqual(new Set(["musica"]));
    expect(interpretarComando(r.texto, [TOCAR])).toEqual({
      tipo: "interacao",
      commandId: "cmd-tocar",
      opcoes: [{ name: "musica", type: 3, value: nome }],
    });
    const escolhas = new Map([[chaveDeEscolha("cmd-tocar", "musica"), { name: nome, value: "id-remix" }]]);
    expect(interpretarComando(`${r.texto}volume:30`, [TOCAR], escolhas)).toEqual({
      tipo: "interacao",
      commandId: "cmd-tocar",
      opcoes: [
        { name: "musica", type: 3, value: "id-remix" },
        { name: "volume", type: 4, value: 30 },
      ],
    });
  });

  it("o pedido ao bot da opção seguinte leva o value da escolha com `outra:` no nome", () => {
    const nome = "Remix volume:11 edição";
    const escolhas = new Map([[chaveDeEscolha("cmd-tocar", "musica"), { name: nome, value: "id-remix" }]]);
    expect(pedidoNoFim(`${escolherMusica(nome).texto}volume:`, escolhas)?.options).toEqual([
      { name: "musica", type: 3, value: "id-remix" },
      { name: "volume", type: 4, value: "", focused: true },
    ]);
  });

  it("aspas abertas no meio da digitação não escondem a marca seguinte", () => {
    expect(estadoDoComando('/tocar musica:"abc volume:3', 27, [TOCAR])?.marcadas).toEqual(
      new Set(["musica", "volume"]),
    );
  });
});

describe("agruparComandos", () => {
  it("apps primeiro e os integrados por último, como no lançador do Discord", () => {
    const grupos = agruparComandos("", [TOCAR]);
    expect(grupos.map((g) => g.id)).toEqual(["app:app1", GRUPO_NATIVOS]);
  });

  it("a precedência de nome não muda: bot com nome de nativo continua fora", () => {
    const me: ComandoDeApp = { ...TOCAR, id: "cmd-me", name: "me" };
    const grupos = agruparComandos("me", [me]);
    expect(grupos.map((g) => g.id)).toEqual([GRUPO_NATIVOS]);
    expect(interpretarComando("/me dança", [me])).toEqual({ tipo: "enviar", content: "*dança*" });
  });
});
