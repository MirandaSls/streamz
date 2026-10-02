import { describe, expect, it } from "vitest";
import { escolherMelhor, normalizar } from "./escolher-faixa";

const c = (title: string, author: string, duration: number, sourceName = "soundcloud") => ({
  title,
  author,
  duration,
  sourceName,
});

describe("escolherMelhor", () => {
  it("prefere a oficial a cover e remix", () => {
    const lista = [
      c("Headstrong (Cover)", "Fulano", 230_000),
      c("Headstrong (Club Remix)", "DJ X", 235_000),
      c("Headstrong", "Trapt", 285_000),
    ];
    expect(escolherMelhor(lista, { titulo: "Headstrong", artista: "Trapt", duracaoMs: 285_000 })).toBe(2);
  });

  it("não penaliza a marca quando o pedido a contém", () => {
    const lista = [c("Song (Live)", "Banda", 200_000), c("Song", "Banda", 180_000)];
    expect(escolherMelhor(lista, { titulo: "Song live", artista: "Banda" })).toBe(0);
  });

  it("rejeita duração absurda", () => {
    const lista = [c("Headstrong", "Trapt", 60_000), c("Headstrong", "Trapt", 900_000)];
    expect(escolherMelhor(lista, { titulo: "Headstrong", artista: "Trapt", duracaoMs: 285_000 })).toBeNull();
  });

  it("devolve null quando nada bate", () => {
    const lista = [c("Outra Música Qualquer", "Alguém", 200_000)];
    expect(escolherMelhor(lista, { titulo: "Headstrong", artista: "Trapt" })).toBeNull();
    expect(escolherMelhor([], { titulo: "Headstrong" })).toBeNull();
  });

  it("aceita artista no título", () => {
    const lista = [c("Trapt - Headstrong", "uploader123", 285_000), c("Headstrong", "Cover Band", 285_000)];
    expect(escolherMelhor(lista, { titulo: "Headstrong", artista: "Trapt" })).toBe(0);
  });

  it("ignora acento e caixa", () => {
    expect(escolherMelhor([c("CORAÇÃO", "Fulano", 0)], { titulo: "coracao" })).toBe(0);
    expect(normalizar("Água (Official Video)")).toBe("agua");
  });
});
