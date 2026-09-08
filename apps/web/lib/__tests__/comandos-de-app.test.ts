import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComandoDeApp, PublicUser } from "@streamz/shared";
import {
  interpretarComando,
  sugestoesDeComandosDeApp,
  type ResultadoComando,
} from "../comandos-barra";

/**
 * ── j-bots ── o `/` do composer com comandos de bot.
 *
 * Só a parte pura: o parse do que foi digitado (`lib/comandos-barra.ts`) e a
 * store que guarda a lista do servidor aberto. O vitest do web roda em
 * `environment: "node"` e só coleta `*.test.ts`, então o componente fica de
 * fora — é o que a prova visual cobre.
 */

const BOT: PublicUser = {
  id: "u-bot",
  username: "musicabot",
  displayName: "Música Bot",
  avatarUrl: null,
  status: "ONLINE",
  customStatusText: null,
  customStatusEmoji: null,
  bot: true,
};

function comando(parcial: Partial<ComandoDeApp>): ComandoDeApp {
  return {
    id: "cmd1",
    snowflake: "1000",
    name: "play",
    description: "Toca uma música",
    options: [],
    applicationId: "app1",
    applicationName: "Música",
    botUser: BOT,
    ...parcial,
  };
}

const PLAY = comando({
  options: [{ name: "url", description: "link", type: 3, required: true }],
});

describe("interpretarComando com comandos de bot", () => {
  it("/play <link>: opção única leva o resto inteiro", () => {
    expect(interpretarComando("/play https://youtu.be/dQw4w9WgXcQ", [PLAY])).toEqual({
      tipo: "interacao",
      commandId: "cmd1",
      opcoes: [{ name: "url", type: 3, value: "https://youtu.be/dQw4w9WgXcQ" }],
    });
  });

  it("o `https:` do link não vira nome de opção", () => {
    const r = interpretarComando("/play https://exemplo.com/a?x=1", [PLAY]) as Extract<
      ResultadoComando,
      { tipo: "interacao" }
    >;
    expect(r.opcoes[0].value).toBe("https://exemplo.com/a?x=1");
  });

  it("nomeadas, com aspas para o valor com espaço", () => {
    const busca = comando({
      name: "buscar",
      options: [
        { name: "termo", description: "", type: 3, required: true },
        { name: "fonte", description: "", type: 3, required: false },
      ],
    });
    expect(interpretarComando('/buscar termo:"never gonna give" fonte:youtube', [busca])).toEqual({
      tipo: "interacao",
      commandId: "cmd1",
      opcoes: [
        { name: "termo", type: 3, value: "never gonna give" },
        { name: "fonte", type: 3, value: "youtube" },
      ],
    });
  });

  it("número vira number (e o inteiro trunca)", () => {
    const vol = comando({
      name: "volume",
      options: [
        { name: "nivel", description: "", type: 4, required: true },
        { name: "ganho", description: "", type: 10, required: false },
      ],
    });
    expect(interpretarComando("/volume nivel:70.9 ganho:1.5", [vol])).toEqual({
      tipo: "interacao",
      commandId: "cmd1",
      opcoes: [
        { name: "nivel", type: 4, value: 70 },
        { name: "ganho", type: 10, value: 1.5 },
      ],
    });
  });

  it("número que não é número conta como não preenchido", () => {
    const vol = comando({
      name: "volume",
      options: [{ name: "nivel", description: "", type: 4, required: true }],
    });
    expect(interpretarComando("/volume nivel:muito", [vol])).toEqual({
      tipo: "faltaOpcao",
      comando: "volume",
      opcao: "nivel",
    });
  });

  it("booleano aceita true, sim e 1 — o resto é falso", () => {
    const loop = comando({
      name: "loop",
      options: [{ name: "ligado", description: "", type: 5, required: true }],
    });
    for (const texto of ["true", "sim", "1"]) {
      expect(interpretarComando(`/loop ligado:${texto}`, [loop])).toEqual({
        tipo: "interacao",
        commandId: "cmd1",
        opcoes: [{ name: "ligado", type: 5, value: true }],
      });
    }
    expect(interpretarComando("/loop ligado:nao", [loop])).toEqual({
      tipo: "interacao",
      commandId: "cmd1",
      opcoes: [{ name: "ligado", type: 5, value: false }],
    });
  });

  it("obrigatória faltando avisa em vez de mandar", () => {
    expect(interpretarComando("/play", [PLAY])).toEqual({
      tipo: "faltaOpcao",
      comando: "play",
      opcao: "url",
    });
  });

  it("opcional em branco simplesmente não vai", () => {
    const c = comando({
      name: "fila",
      options: [{ name: "pagina", description: "", type: 4, required: false }],
    });
    expect(interpretarComando("/fila", [c])).toEqual({
      tipo: "interacao",
      commandId: "cmd1",
      opcoes: [],
    });
  });

  it("o comando nativo ganha do comando de bot com o mesmo nome", () => {
    const meDoBot = comando({ name: "me", options: [] });
    expect(interpretarComando("/me dança", [meDoBot])).toEqual({
      tipo: "enviar",
      content: "*dança*",
    });
  });

  it("comando de bot de outro servidor continua desconhecido", () => {
    expect(interpretarComando("/play algo", [])).toEqual({ tipo: "desconhecido", nome: "play" });
  });
});

describe("sugestoesDeComandosDeApp", () => {
  it("casa por prefixo e traz o bot para o avatar", () => {
    const r = sugestoesDeComandosDeApp("pl", [PLAY]);
    expect(r).toEqual([
      {
        chave: "app:cmd1",
        valor: "/play",
        rotulo: "/play",
        detalhe: "Toca uma música",
        botUser: BOT,
      },
    ]);
  });

  it("termo vazio traz todos", () => {
    expect(sugestoesDeComandosDeApp("", [PLAY])).toHaveLength(1);
  });

  it("some quem colide com um nativo (o nativo é quem vai rodar)", () => {
    expect(sugestoesDeComandosDeApp("m", [comando({ name: "me" })])).toEqual([]);
  });
});

// ── a store ──────────────────────────────────────────────────

const apiFalsa = vi.hoisted(() => ({
  comandosDeApp: vi.fn(async (_guildId: string): Promise<ComandoDeApp[]> => []),
}));
vi.mock("@/lib/api", () => ({ api: apiFalsa }));

async function carregarStore() {
  vi.resetModules();
  return (await import("@/stores/comandos-de-app")).useComandosDeApp;
}

describe("useComandosDeApp", () => {
  beforeEach(() => {
    apiFalsa.comandosDeApp.mockReset();
  });

  it("carrega os comandos do servidor e limpa a lista do anterior", async () => {
    apiFalsa.comandosDeApp.mockResolvedValue([PLAY]);
    const store = await carregarStore();

    await store.getState().loadForGuild("g1");
    expect(store.getState()).toMatchObject({ guildId: "g1", comandos: [PLAY], carregando: false });

    store.getState().clear();
    expect(store.getState()).toMatchObject({ guildId: null, comandos: [] });
  });

  it("na corrida entre dois servidores, só a última carga escreve", async () => {
    const store = await carregarStore();
    let liberarPrimeira: (v: ComandoDeApp[]) => void = () => {};
    apiFalsa.comandosDeApp
      .mockImplementationOnce(() => new Promise((res) => (liberarPrimeira = res)))
      .mockResolvedValueOnce([PLAY]);

    const primeira = store.getState().loadForGuild("g1");
    await store.getState().loadForGuild("g2");
    liberarPrimeira([comando({ id: "velho" })]);
    await primeira;

    expect(store.getState().guildId).toBe("g2");
    expect(store.getState().comandos).toEqual([PLAY]);
  });

  it("falha na rota deixa a lista vazia, sem estourar", async () => {
    apiFalsa.comandosDeApp.mockRejectedValue(new Error("500"));
    const store = await carregarStore();

    await store.getState().loadForGuild("g1");
    expect(store.getState()).toMatchObject({ comandos: [], carregando: false });
  });

  it("o evento só recarrega o servidor que está aberto", async () => {
    apiFalsa.comandosDeApp.mockResolvedValue([PLAY]);
    const store = await carregarStore();
    await store.getState().loadForGuild("g1");
    apiFalsa.comandosDeApp.mockClear();

    store.getState().aplicarAtualizacao("g2");
    expect(apiFalsa.comandosDeApp).not.toHaveBeenCalled();

    store.getState().aplicarAtualizacao("g1");
    expect(apiFalsa.comandosDeApp).toHaveBeenCalledWith("g1");
  });
});
