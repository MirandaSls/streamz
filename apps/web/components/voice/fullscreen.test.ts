import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A tela cheia do palco, defeito relatado três vezes no mesmo botão: "o botão
 * de tela cheia do palco deixa o **app** em tela cheia, em vez da tela".
 *
 * A causa não estava na ordem das chamadas nem no estado — estava na escolha
 * do caminho: dentro do Tauri a Fullscreen API do DOM não funciona (ver o topo
 * de `fullscreen.ts`), e o código caía na tela cheia da janela, que é
 * exatamente a queixa. Estes testes travam a escolha e o que cada caminho faz,
 * que é a parte testável sem um DOM de verdade.
 */

// ── as dependências, de mentira ─────────────────────────────────────────────

const falsas = vi.hoisted(() => ({
  tauri: false,
  janelaCheia: false,
  definirTelaCheia: vi.fn(async (_valor: boolean) => true),
  setTelaCheia: vi.fn((_valor: boolean) => {}),
}));

vi.mock("@/lib/desktop", () => ({
  isTauri: () => falsas.tauri,
  janelaEmTelaCheia: async () => falsas.janelaCheia,
  definirTelaCheiaDaJanela: (valor: boolean) => falsas.definirTelaCheia(valor),
}));

vi.mock("@/stores/voice", () => ({
  useVoice: Object.assign(() => undefined, {
    getState: () => ({ setTelaCheia: falsas.setTelaCheia }),
  }),
}));

/** Um elemento só com o que o módulo toca: os dois métodos de atributo. */
function elementoFalso(nome: string) {
  const atributos = new Set<string>();
  return {
    nome,
    atributos,
    setAttribute: (chave: string) => void atributos.add(chave),
    removeAttribute: (chave: string) => void atributos.delete(chave),
    requestFullscreen: vi.fn(async () => {}),
  };
}

type ElementoFalso = ReturnType<typeof elementoFalso>;

/** O módulo recarregado, para o estado por elemento não vazar entre os casos. */
async function carregar() {
  vi.resetModules();
  return await import("./fullscreen");
}

/** `document`/`window`/`Element` mínimos — o ambiente de teste é node puro. */
function prepararDOM(opcoes: { comAPI: boolean }) {
  vi.stubGlobal("document", {
    fullscreenEnabled: opcoes.comAPI,
    fullscreenElement: null,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("Element", { prototype: opcoes.comAPI ? { requestFullscreen: () => {} } : {} });
}

beforeEach(() => {
  falsas.tauri = false;
  falsas.janelaCheia = false;
  falsas.definirTelaCheia.mockClear();
  falsas.setTelaCheia.mockClear();
});

// ── a escolha do caminho, que é onde o defeito morava ───────────────────────

describe("caminhoDeTelaCheia", () => {
  it("emula dentro do app desktop, mesmo com a API do DOM respondendo que sim", async () => {
    const { caminhoDeTelaCheia } = await carregar();
    // o WebView2 **diz** que suporta e promove o elemento só até a borda da
    // janela; acreditar nele foi o defeito
    expect(caminhoDeTelaCheia({ tauri: true, domSuporta: true })).toBe("emulado");
    expect(caminhoDeTelaCheia({ tauri: true, domSuporta: false })).toBe("emulado");
  });

  it("usa a API do navegador quando não é o app — ela é melhor que a emulação", async () => {
    const { caminhoDeTelaCheia } = await carregar();
    expect(caminhoDeTelaCheia({ tauri: false, domSuporta: true })).toBe("dom");
  });

  it("não tem caminho no navegador sem a API, e a UI esconde o botão", async () => {
    const { caminhoDeTelaCheia, suportaTelaCheia } = await carregar();
    expect(caminhoDeTelaCheia({ tauri: false, domSuporta: false })).toBe("nenhum");
    prepararDOM({ comAPI: false });
    expect(suportaTelaCheia()).toBe(false);
  });

  it("suportaTelaCheia é sempre `true` no app, porque a emulação não é recusável", async () => {
    const { suportaTelaCheia } = await carregar();
    falsas.tauri = true;
    prepararDOM({ comAPI: false }); // WKWebView do macOS: sem tela cheia de elemento
    expect(suportaTelaCheia()).toBe(true);
  });
});

// ── o caminho emulado (app desktop) ─────────────────────────────────────────

describe("tela cheia emulada", () => {
  beforeEach(() => {
    falsas.tauri = true;
    prepararDOM({ comAPI: false });
  });

  it("promove o elemento **e** põe a janela em tela cheia; o segundo clique desfaz os dois", async () => {
    const { alternarTelaCheiaDe, ATRIBUTO_DE_TELA_CHEIA } = await carregar();
    const palco = elementoFalso("palco");

    await alternarTelaCheiaDe(palco as unknown as HTMLElement);
    expect(palco.atributos.has(ATRIBUTO_DE_TELA_CHEIA)).toBe(true);
    expect(falsas.definirTelaCheia).toHaveBeenCalledWith(true);
    expect(falsas.setTelaCheia).toHaveBeenLastCalledWith(true);
    // a emulação não usa a API do DOM: pedi-la no app é o que não funcionava
    expect(palco.requestFullscreen).not.toHaveBeenCalled();

    await alternarTelaCheiaDe(palco as unknown as HTMLElement);
    expect(palco.atributos.has(ATRIBUTO_DE_TELA_CHEIA)).toBe(false);
    expect(falsas.definirTelaCheia).toHaveBeenLastCalledWith(false);
    expect(falsas.setTelaCheia).toHaveBeenLastCalledWith(false);
  });

  it("não tira da tela cheia a janela que o usuário já tinha posto lá", async () => {
    const { alternarTelaCheiaDe } = await carregar();
    falsas.janelaCheia = true; // F11 / semáforo verde, antes do clique
    const palco = elementoFalso("palco");

    await alternarTelaCheiaDe(palco as unknown as HTMLElement);
    expect(falsas.definirTelaCheia).not.toHaveBeenCalled();

    await alternarTelaCheiaDe(palco as unknown as HTMLElement);
    // desfazemos só a nossa metade; a janela continua como o usuário a deixou
    expect(falsas.definirTelaCheia).not.toHaveBeenCalled();
  });

  it("trocar de elemento troca o dono sem mexer na janela de novo", async () => {
    const { alternarTelaCheiaDe, ATRIBUTO_DE_TELA_CHEIA } = await carregar();
    const tile = elementoFalso("tile");
    const palco = elementoFalso("palco");

    await alternarTelaCheiaDe(tile as unknown as HTMLElement);
    await alternarTelaCheiaDe(palco as unknown as HTMLElement);

    expect(tile.atributos.has(ATRIBUTO_DE_TELA_CHEIA)).toBe(false);
    expect(palco.atributos.has(ATRIBUTO_DE_TELA_CHEIA)).toBe(true);
    expect(falsas.definirTelaCheia).toHaveBeenCalledTimes(1);
    expect(falsas.definirTelaCheia).toHaveBeenCalledWith(true);
  });

  it("o desmonte só desfaz a tela cheia de quem a ligou", async () => {
    const { alternarTelaCheiaDe, soltarTelaCheiaDe, ATRIBUTO_DE_TELA_CHEIA } = await carregar();
    const dono = elementoFalso("dono");
    const outro = elementoFalso("outro");

    await alternarTelaCheiaDe(dono as unknown as HTMLElement);
    soltarTelaCheiaDe(outro as unknown as HTMLElement);
    expect(dono.atributos.has(ATRIBUTO_DE_TELA_CHEIA)).toBe(true);

    soltarTelaCheiaDe(dono as unknown as HTMLElement);
    expect(dono.atributos.has(ATRIBUTO_DE_TELA_CHEIA)).toBe(false);
    // a janela não pode ficar sem moldura depois que o elemento morreu
    await vi.waitFor(() => expect(falsas.definirTelaCheia).toHaveBeenLastCalledWith(false));
  });

  it("sai mesmo quando o elemento já desmontou e o clique chega com `null`", async () => {
    const { alternarTelaCheiaDe, ATRIBUTO_DE_TELA_CHEIA } = await carregar();
    const palco = elementoFalso("palco");

    await alternarTelaCheiaDe(palco as unknown as HTMLElement);
    await alternarTelaCheiaDe(null);
    expect(palco.atributos.has(ATRIBUTO_DE_TELA_CHEIA)).toBe(false);
    expect(falsas.definirTelaCheia).toHaveBeenLastCalledWith(false);
  });
});

// ── o caminho do navegador ──────────────────────────────────────────────────

describe("tela cheia no navegador", () => {
  it("usa a API do DOM e nunca toca na janela do app", async () => {
    const { alternarTelaCheiaDe, ATRIBUTO_DE_TELA_CHEIA } = await carregar();
    prepararDOM({ comAPI: true });
    const palco: ElementoFalso = elementoFalso("palco");

    await alternarTelaCheiaDe(palco as unknown as HTMLElement);
    expect(palco.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(falsas.definirTelaCheia).not.toHaveBeenCalled();
    // nada de CSS nosso: quem promove é o compositor
    expect(palco.atributos.has(ATRIBUTO_DE_TELA_CHEIA)).toBe(false);
  });
});
