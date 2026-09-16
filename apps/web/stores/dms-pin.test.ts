import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversaFixadaEvent, DMChannelView } from "@streamz/shared";

/**
 * Fixar/desafixar conversa de DM (`docs/CONTRATO-MENUS.md` §1), do lado do
 * cliente: `fixar`/`desafixar` são otimistas (a linha muda de bloco antes da
 * resposta) com rollback e toast de erro, e a ordem da lista (`fixadaEm`
 * crescente no bloco de cima, depois por atividade) é refeita a cada mudança
 * — tanto pela própria ação quanto pelo eco `dm.pinUpdated`
 * (`handleDmPinUpdated`, idempotente).
 */

const api = vi.hoisted(() => ({
  fixarDM: vi.fn(
    async (channelId: string): Promise<ConversaFixadaEvent> => ({
      channelId,
      fixadaEm: "2026-09-16T12:00:00.000Z",
    }),
  ),
  desafixarDM: vi.fn(
    async (channelId: string): Promise<ConversaFixadaEvent> => ({
      channelId,
      fixadaEm: null,
    }),
  ),
}));
vi.mock("@/lib/api", () => ({ api }));

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/stores/ui", () => ({
  ui: {
    toast,
    confirm: vi.fn(async () => true),
    setView: vi.fn(),
    openModal: vi.fn(),
  },
}));

import { useDMs } from "./dms";

function dm(id: string, opts: Partial<DMChannelView> = {}): DMChannelView {
  return {
    id,
    guildId: null,
    name: null,
    type: "DM",
    position: 0,
    private: false,
    readOnly: false,
    syncedWithCategory: false,
    lastMessageAt: null,
    lastReadAt: null,
    mentionCount: 0,
    categoryId: null,
    topic: null,
    slowmodeSeconds: 0,
    nsfw: false,
    others: [],
    iconUrl: null,
    ownerId: null,
    unreadCount: 0,
    fixadaEm: null,
    ...opts,
  };
}

function ids(): string[] {
  return useDMs.getState().channels.map((d) => d.id);
}

beforeEach(() => {
  useDMs.setState({ channels: [], activeId: null, loadingList: false });
  api.fixarDM.mockClear();
  api.desafixarDM.mockClear();
  toast.mockClear();
});

describe("fixar", () => {
  it("sobe a conversa para o bloco das fixadas na hora (otimista) e aplica o valor da resposta", async () => {
    useDMs.setState({
      channels: [
        dm("a", { lastMessageAt: "2026-09-16T10:00:00.000Z" }),
        dm("b", { lastMessageAt: "2026-09-16T09:00:00.000Z" }),
      ],
    });
    const promessa = useDMs.getState().fixar("b");
    // otimista: já fixada e no topo antes da resposta da API chegar
    expect(ids()).toEqual(["b", "a"]);
    expect(useDMs.getState().channels.find((d) => d.id === "b")?.fixadaEm).toBeTruthy();
    await promessa;
    expect(useDMs.getState().channels.find((d) => d.id === "b")?.fixadaEm).toBe(
      "2026-09-16T12:00:00.000Z",
    );
    expect(api.fixarDM).toHaveBeenCalledWith("b");
  });

  it("entra no FIM do bloco das fixadas: quem já estava fixada continua na frente", async () => {
    useDMs.setState({
      channels: [dm("a", { fixadaEm: "2026-09-16T08:00:00.000Z" }), dm("b")],
    });
    await useDMs.getState().fixar("b");
    expect(ids()).toEqual(["a", "b"]);
  });

  it("desfaz e avisa por toast quando a API recusa", async () => {
    api.fixarDM.mockRejectedValueOnce(new Error("falhou"));
    useDMs.setState({ channels: [dm("a"), dm("b")] });
    await useDMs.getState().fixar("b");
    expect(ids()).toEqual(["a", "b"]);
    expect(useDMs.getState().channels.find((d) => d.id === "b")?.fixadaEm).toBeFalsy();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("não faz nada com uma conversa que não está na lista", async () => {
    useDMs.setState({ channels: [dm("a")] });
    await useDMs.getState().fixar("desconhecida");
    expect(api.fixarDM).not.toHaveBeenCalled();
    expect(ids()).toEqual(["a"]);
  });
});

describe("desafixar", () => {
  it("tira do bloco das fixadas na hora e reordena só por atividade", async () => {
    useDMs.setState({
      channels: [
        dm("a", { fixadaEm: "2026-09-16T08:00:00.000Z" }),
        dm("b", { lastMessageAt: "2026-09-16T09:00:00.000Z" }),
      ],
    });
    await useDMs.getState().desafixar("a");
    expect(useDMs.getState().channels.find((d) => d.id === "a")?.fixadaEm).toBeNull();
    expect(ids()).toEqual(["b", "a"]);
    expect(api.desafixarDM).toHaveBeenCalledWith("a");
  });

  it("desfaz e avisa por toast quando a API recusa", async () => {
    api.desafixarDM.mockRejectedValueOnce(new Error("falhou"));
    useDMs.setState({ channels: [dm("c", { fixadaEm: "2026-09-16T08:00:00.000Z" })] });
    await useDMs.getState().desafixar("c");
    expect(useDMs.getState().channels.find((d) => d.id === "c")?.fixadaEm).toBe(
      "2026-09-16T08:00:00.000Z",
    );
    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe("handleDmPinUpdated", () => {
  it("aplica o evento (fixar ou desafixar) e reordena", () => {
    useDMs.setState({ channels: [dm("a"), dm("b")] });
    useDMs.getState().handleDmPinUpdated({ channelId: "b", fixadaEm: "2026-09-16T08:00:00.000Z" });
    expect(ids()).toEqual(["b", "a"]);

    useDMs.getState().handleDmPinUpdated({ channelId: "b", fixadaEm: null });
    expect(useDMs.getState().channels.find((d) => d.id === "b")?.fixadaEm).toBeNull();
  });

  it("é idempotente: reaplicar o mesmo valor (eco da própria aba) não muda nada", () => {
    useDMs.setState({ channels: [dm("a"), dm("b")] });
    const evento = { channelId: "b", fixadaEm: "2026-09-16T08:00:00.000Z" };
    useDMs.getState().handleDmPinUpdated(evento);
    useDMs.getState().handleDmPinUpdated(evento);
    expect(ids()).toEqual(["b", "a"]);
  });

  it("ignora conversa que já não está na lista (ex.: fechada)", () => {
    useDMs.setState({ channels: [dm("a")] });
    useDMs.getState().handleDmPinUpdated({ channelId: "fantasma", fixadaEm: "2026-09-16T08:00:00.000Z" });
    expect(ids()).toEqual(["a"]);
  });
});
