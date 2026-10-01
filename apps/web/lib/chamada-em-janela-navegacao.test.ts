import { describe, expect, it } from "vitest";
import type { Category, Channel } from "@streamz/shared";
import { primeiroCanalDeTexto } from "./chamada-em-janela-navegacao";

const c = (id: string, type: string, position: number, categoryId: string | null = null) =>
  ({ id, type, position, categoryId, name: id }) as unknown as Channel;
const cat = (id: string, position: number) => ({ id, name: id, position }) as unknown as Category;

describe("primeiroCanalDeTexto", () => {
  it("pula voz e canal sem permissão, na ordem da barra", () => {
    const canais = [c("v", "VOICE", 0), c("t2", "TEXT", 1, "k"), c("t1", "TEXT", 0, "k"), c("solto", "TEXT", 5)];
    const r = primeiroCanalDeTexto(canais, [cat("k", 0)], [], (x) => x.id !== "solto");
    expect(r?.id).toBe("t1");
  });
  it("sem texto visível devolve null", () => {
    expect(primeiroCanalDeTexto([c("v", "VOICE", 0)], [], [], () => true)).toBeNull();
  });
});
