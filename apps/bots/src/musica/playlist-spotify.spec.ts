import { describe, expect, it } from "vitest";
import { resolverEmOrdem } from "./playlist-spotify";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("resolverEmOrdem", () => {
  it("preserva a ordem mesmo com tempos de resposta invertidos", async () => {
    const itens = [1, 2, 3, 4, 5, 6];
    const { achadas, puladas } = await resolverEmOrdem(itens, async (n) => {
      await dormir((7 - n) * 5);
      return `f${n}`;
    });
    expect(achadas).toEqual(["f1", "f2", "f3", "f4", "f5", "f6"]);
    expect(puladas).toBe(0);
  });

  it("nunca passa de 4 buscas simultâneas", async () => {
    let ativas = 0;
    let pico = 0;
    await resolverEmOrdem(Array.from({ length: 12 }, (_, i) => i), async (n) => {
      ativas++;
      pico = Math.max(pico, ativas);
      await dormir(5);
      ativas--;
      return n;
    });
    expect(pico).toBe(4);
  });

  it("conta como puladas as faixas sem resultado ou que lançam", async () => {
    const { achadas, puladas } = await resolverEmOrdem([1, 2, 3, 4], async (n) => {
      if (n === 2) return null;
      if (n === 3) throw new Error("falhou");
      return n;
    });
    expect(achadas).toEqual([1, 4]);
    expect(puladas).toBe(2);
  });
});
