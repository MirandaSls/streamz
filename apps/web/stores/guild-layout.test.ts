import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuildLayout } from "@streamz/shared";

const put = vi.fn();
const toast = vi.fn();
vi.mock("@/lib/api", () => ({ api: { guildLayout: { get: vi.fn(), put: (l: GuildLayout) => put(l) } } }));
vi.mock("@/stores/ui", () => ({ ui: { toast: (...a: unknown[]) => toast(...a) } }));

import { useGuildLayout, layoutResolvido } from "./guild-layout";

const L = (...ids: string[]): GuildLayout => ({ items: ids.map((guildId) => ({ kind: "guild" as const, guildId })) });
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  put.mockReset();
  toast.mockReset();
  useGuildLayout.getState().limpar();
});

describe("guild-layout", () => {
  it("aplica otimista e mantém o resultado do PUT", async () => {
    put.mockImplementation(async (l) => l);
    const a = L("a", "b");
    useGuildLayout.getState().aplicar(a);
    expect(useGuildLayout.getState().layout).toBe(a);
    await tick();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("reverte e avisa quando o PUT falha", async () => {
    const base = L("a");
    useGuildLayout.getState().receber(base);
    put.mockRejectedValue(new Error("x"));
    useGuildLayout.getState().aplicar(L("a", "b"));
    await tick();
    expect(useGuildLayout.getState().layout).toBe(base);
    expect(toast).toHaveBeenCalledWith(expect.any(String), "error");
  });

  it("ignora layout igual ao atual", () => {
    const a = L("a");
    useGuildLayout.getState().receber(a);
    useGuildLayout.getState().aplicar(a);
    expect(put).not.toHaveBeenCalled();
  });

  it("serializa PUTs: um em voo, o último vence", async () => {
    const liberar: Array<() => void> = [];
    put.mockImplementation((l) => new Promise((res) => liberar.push(() => res(l))));
    const [a, b, c] = [L("a"), L("b"), L("c")];
    const s = useGuildLayout.getState();
    s.aplicar(a);
    s.aplicar(b);
    s.aplicar(c);
    expect(put).toHaveBeenCalledTimes(1);
    liberar[0]();
    await tick();
    expect(put).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenLastCalledWith(c);
    liberar[1]();
    await tick();
    expect(useGuildLayout.getState().layout).toBe(c);
  });

  it("receber não dispara PUT", () => {
    const a = L("a");
    useGuildLayout.getState().receber(a);
    expect(useGuildLayout.getState().layout).toBe(a);
    expect(put).not.toHaveBeenCalled();
  });

  it("layoutResolvido acrescenta servidor esquecido", () => {
    expect(layoutResolvido(null, ["x"]).items).toHaveLength(1);
  });
});
