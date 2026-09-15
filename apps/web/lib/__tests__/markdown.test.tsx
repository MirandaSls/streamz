import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Channel, DMChannelView, ResumoDeCanal, ThreadView } from "@streamz/shared";

/*
 * Render do markdown sem DOM: `renderToStaticMarkup` (react-dom/server) no
 * ambiente node do vitest. Efeitos não rodam no render de servidor, então o
 * que depende de efeito (pedir o resumo do canal) é conferido pelo estado que
 * a store falsa já traz, e a store de verdade tem o seu próprio bloco no fim.
 *
 * As stores são trocadas por falsas: as de verdade puxam socket, API e metade
 * do app, e a pílula só lê o estado por seletor (`useX(sel)`) e `getState()`.
 */

// `vi.mock` é içado para o topo do arquivo: tudo o que a fábrica lê nasce aqui
const falsas = vi.hoisted(() => {
  function loja<S extends object>(estado: S) {
    const hook = <T,>(sel: (s: S) => T): T => sel(estado);
    return Object.assign(hook, { getState: () => estado });
  }
  const channels = { channels: [] as Channel[], select: vi.fn() };
  const threads = { items: [] as ThreadView[] };
  const dms = { channels: [] as DMChannelView[] };
  const resumos = {
    porId: {} as Record<string, unknown>,
    garantir: vi.fn(),
  };
  return {
    channels,
    threads,
    dms,
    resumos,
    useChannels: loja(channels),
    useThreads: loja(threads),
    useDMs: loja(dms),
    useResumosDeCanal: loja(resumos),
    useAuth: loja({ user: null }),
    useGuilds: loja({ members: [] as { user: unknown }[] }),
    useMessages: loja({ openThread: vi.fn() }),
    useUI: loja({ openProfile: vi.fn(), toast: vi.fn() }),
    api: { resumoDoCanal: vi.fn() },
  };
});

vi.mock("@/stores/channels", () => ({ useChannels: falsas.useChannels }));
vi.mock("@/stores/messages-threads", () => ({ useThreads: falsas.useThreads }));
vi.mock("@/stores/dms", () => ({
  useDMs: falsas.useDMs,
  dmTitle: (dm: DMChannelView) => dm.name ?? "Conversa",
}));
vi.mock("@/stores/resumos-de-canal", () => ({ useResumosDeCanal: falsas.useResumosDeCanal }));
vi.mock("@/stores/auth", () => ({ useAuth: falsas.useAuth }));
vi.mock("@/stores/guilds", () => ({ useGuilds: falsas.useGuilds }));
vi.mock("@/stores/messages", () => ({ useMessages: falsas.useMessages }));
vi.mock("@/stores/messages-navigate", () => ({ goToChannel: vi.fn() }));
vi.mock("@/stores/ui", () => ({ useUI: falsas.useUI, anchorOf: () => ({}) }));
vi.mock("@/lib/api", () => ({ api: falsas.api }));
// a dica e o botão de ícone trazem portal e posicionamento, que não interessam
// ao texto renderizado. Sem JSX na fábrica: ela é içada acima dos imports.
vi.mock("@/components/ui/primitivos", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  BotaoDeIcone: () => null,
}));

import { formatarCarimbo, Markdown } from "../markdown";
import { CLASSE_EMOJI_INLINE, CLASSE_EMOJI_JUMBO } from "@/components/ui/Emoji";

const html = (text: string, extra: Partial<Parameters<typeof Markdown>[0]> = {}) =>
  renderToStaticMarkup(<Markdown text={text} {...extra} />);

function canal(parcial: Partial<Channel> & Pick<Channel, "id" | "name">): Channel {
  return { guildId: "g1", type: "TEXT", ...parcial } as Channel;
}

beforeEach(() => {
  falsas.channels.channels = [];
  falsas.threads.items = [];
  falsas.dms.channels = [];
  falsas.resumos.porId = {};
});

describe("Markdown: link mascarado", () => {
  it("mostra só o texto, com o href e a cor de link", () => {
    const saida = html("veja [o site](https://exemplo.com/a) agora");
    expect(saida).toContain('href="https://exemplo.com/a"');
    expect(saida).toContain('target="_blank"');
    expect(saida).toContain('rel="noreferrer noopener"');
    expect(saida).toMatch(/<a [^>]*class="[^"]*text-text-link[^"]*"[^>]*>o site<\/a>/);
    expect(saida).not.toContain("[o site]");
  });
});

describe("Markdown: carimbo <t:…>", () => {
  it("vira <time> com o texto do estilo pedido e a data ISO", () => {
    const unix = 1_700_000_000;
    const saida = html(`até <t:${unix}:D>`);
    // o nome do atributo sai como o React o escreve; em HTML tanto faz a caixa
    expect(saida.toLowerCase()).toContain(`datetime="${new Date(unix * 1000).toISOString().toLowerCase()}"`);
    expect(saida).toContain(`>${formatarCarimbo(unix, "D")}</time>`);
    expect(saida).toContain("bg-background-mod-normal");
    expect(saida).not.toContain("&lt;t:");
  });
});

describe("Markdown: menção de canal <#id>", () => {
  it("canal do servidor aberto sai com o nome e clicável", () => {
    falsas.channels.channels = [canal({ id: "c1", name: "geral" })];
    const saida = html("vai no <#c1>");
    expect(saida).toMatch(/role="button"[^>]*>.*geral<\/span>/);
    expect(saida).not.toContain("desconhecido");
  });

  it("canal de voz sai sem role de botão (clicar não entra na chamada)", () => {
    falsas.channels.channels = [canal({ id: "v1", name: "Sala", type: "VOICE" })];
    const saida = html("<#v1>");
    expect(saida).toContain("Sala");
    expect(saida).not.toContain('role="button"');
  });

  it("thread carregada sai com o nome da thread", () => {
    falsas.threads.items = [{ id: "t1", name: "bug do login", channelId: "c1" } as ThreadView];
    expect(html("<#t1>")).toContain("bug do login");
  });

  it("conversa da lista sai com o título da conversa", () => {
    falsas.dms.channels = [{ id: "d1", name: "Amigos", type: "GROUP", guildId: null } as DMChannelView];
    expect(html("<#d1>")).toContain("Amigos");
  });

  it("canal de outro servidor sai com o nome do resumo da API", () => {
    const resumo: ResumoDeCanal = { id: "x1", name: "anuncios", type: "ANNOUNCEMENT", guildId: "g2" };
    falsas.resumos.porId = { x1: { estado: "ok", resumo } };
    expect(html("<#x1>")).toContain("anuncios");
  });

  it("403/404 viram a pílula de sem acesso, sem botão", () => {
    falsas.resumos.porId = { x2: { estado: "sem-acesso" } };
    const saida = html("<#x2>");
    expect(saida).toContain("Sem acesso");
    expect(saida).not.toContain('role="button"');
  });

  it("enquanto o resumo não chega, não diz desconhecido", () => {
    const saida = html("<#x3>");
    expect(saida).toContain('aria-busy="true"');
    expect(saida).not.toContain("desconhecido");
  });
});

describe("Markdown: jumbo", () => {
  it("mensagem só de emoji usa a caixa jumbo", () => {
    const saida = html("😀😀");
    expect(saida).toContain(`class="${CLASSE_EMOJI_JUMBO} "`);
    expect(saida).not.toContain(CLASSE_EMOJI_INLINE);
  });

  it("emoji no meio de frase continua do tamanho da linha", () => {
    const saida = html("oi 😀 tudo bem");
    expect(saida).toContain(`class="${CLASSE_EMOJI_INLINE} "`);
    expect(saida).not.toContain(CLASSE_EMOJI_JUMBO);
  });
});

describe("Markdown: emLinha e sufixo", () => {
  const editado = <span data-editado="">(editado)</span>;

  it("sufixo entra dentro do último parágrafo", () => {
    const saida = html("primeira\nsegunda", { sufixo: editado });
    expect(saida).toContain('<div>segunda<span data-editado="">(editado)</span></div>');
  });

  it("emLinha primeiro/ultimo/ambos põe `inline` só nas pontas", () => {
    expect(html("a\nb\nc", { emLinha: "primeiro" })).toContain('<div class="inline">a</div><div>b</div><div>c</div>');
    expect(html("a\nb\nc", { emLinha: "ultimo" })).toContain('<div>a</div><div>b</div><div class="inline">c</div>');
    expect(html("a\nb", { emLinha: "ambos" })).toContain('<div class="inline">a</div><div class="inline">b</div>');
  });

  it("sem emLinha nenhum parágrafo ganha classe", () => {
    expect(html("a\nb")).toContain("<div>a</div><div>b</div>");
  });

  it("último bloco que não é parágrafo: sufixo logo depois dele", () => {
    const saida = html("texto\n```\ncodigo\n```", { sufixo: editado });
    expect(saida).toMatch(/<\/pre><span data-editado="">\(editado\)<\/span><\/span>$/);
    expect(saida).toContain("<div>texto</div>");
  });
});

describe("useResumosDeCanal", () => {
  it("deduplica o pedido e grava ok / sem-acesso", async () => {
    const { useResumosDeCanal } = await vi.importActual<typeof import("@/stores/resumos-de-canal")>(
      "@/stores/resumos-de-canal",
    );
    const { ApiError } = await import("@/lib/api-error");
    const resumo: ResumoDeCanal = { id: "c9", name: "geral", type: "TEXT", guildId: "g9" };
    falsas.api.resumoDoCanal.mockImplementation(async (id: string) => {
      if (id === "c9") return resumo;
      if (id === "c403") throw new ApiError(403, "Canal privado");
      throw new ApiError(500, "Erro 500");
    });

    const loja = useResumosDeCanal.getState();
    loja.garantir("c9");
    loja.garantir("c9");
    loja.garantir("c403");
    loja.garantir("c500");
    expect(useResumosDeCanal.getState().porId.c9).toEqual({ estado: "carregando" });
    expect(falsas.api.resumoDoCanal).toHaveBeenCalledTimes(3);

    await new Promise((r) => setTimeout(r, 0));
    const { porId } = useResumosDeCanal.getState();
    expect(porId.c9).toEqual({ estado: "ok", resumo });
    expect(porId.c403).toEqual({ estado: "sem-acesso" });
    // erro que não é de acesso não fica gravado: a próxima pílula tenta de novo
    expect(porId.c500).toBeUndefined();
  });
});
