import { describe, expect, it } from "vitest";
import { MAX_AVATAR_SIZE, MAX_BANNER_SIZE, MAX_IMAGEM_DE_PERFIL_GIF } from "@streamz/shared";
import { ehGif, erroDeTamanho, limiteDe } from "@/lib/imagem-de-perfil";

const png = (size: number) => ({ type: "image/png", name: "foto.png", size });
const gif = (size: number, name = "festa.gif") => ({ type: "image/gif", name, size });

describe("ehGif", () => {
  it("pega o tipo declarado", () => {
    expect(ehGif(gif(10))).toBe(true);
    expect(ehGif(png(10))).toBe(false);
  });

  it("pega também pela extensão, quando o browser não declara tipo", () => {
    // arrastar de certas pastas dá `type: ""`; sem isto o GIF cairia no
    // recorte e voltaria parado
    expect(ehGif({ type: "", name: "festa.GIF", size: 10 })).toBe(true);
  });
});

describe("limite por formato", () => {
  it("estático segue o teto de cada rota", () => {
    expect(limiteDe(png(10), "avatar")).toBe(MAX_AVATAR_SIZE);
    expect(limiteDe(png(10), "banner")).toBe(MAX_BANNER_SIZE);
  });

  it("GIF tem 8 MB nos dois", () => {
    expect(limiteDe(gif(10), "avatar")).toBe(MAX_IMAGEM_DE_PERFIL_GIF);
    expect(limiteDe(gif(10), "banner")).toBe(MAX_IMAGEM_DE_PERFIL_GIF);
  });
});

describe("erroDeTamanho", () => {
  it("deixa passar o que cabe", () => {
    expect(erroDeTamanho(png(MAX_AVATAR_SIZE), "avatar")).toBeNull();
    expect(erroDeTamanho(gif(MAX_IMAGEM_DE_PERFIL_GIF), "avatar")).toBeNull();
  });

  it("barra o que passa do teto, com o número que vale para o arquivo", () => {
    expect(erroDeTamanho(png(MAX_AVATAR_SIZE + 1), "avatar")).toContain("4 MB");
    expect(erroDeTamanho(gif(MAX_IMAGEM_DE_PERFIL_GIF + 1), "avatar")).toContain("8 MB");
    expect(erroDeTamanho(png(MAX_BANNER_SIZE + 1), "banner")).toContain("6 MB");
  });

  it("um GIF de 5 MB passa onde um PNG de 5 MB não passaria", () => {
    const cinco = 5 * 1024 * 1024;
    expect(erroDeTamanho(gif(cinco), "avatar")).toBeNull();
    expect(erroDeTamanho(png(cinco), "avatar")).not.toBeNull();
  });

  it("nomeia a foto e o banner na mensagem", () => {
    expect(erroDeTamanho(png(MAX_AVATAR_SIZE + 1), "avatar")).toContain("A foto");
    expect(erroDeTamanho(png(MAX_BANNER_SIZE + 1), "banner")).toContain("O banner");
  });
});
