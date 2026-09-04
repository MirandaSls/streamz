import { describe, expect, it } from "vitest";
import { codigoDeConvite } from "./links-de-convite";

/**
 * O defeito preso aqui: no desktop o app é servido de `http://tauri.localhost`,
 * e o link do convite é `https://streamz.chat/invite/...`. Quem comparasse com
 * a origem da janela perdia o convite do host público; quem comparasse só com o
 * host público perdia o link relativo do próprio app. As duas origens valem.
 */
const NOSSAS = ["https://streamz.chat", "http://tauri.localhost"];

describe("reconhecer um convite", () => {
  it("reconhece o link público colado no chat", () => {
    expect(codigoDeConvite("https://streamz.chat/invite/x", NOSSAS)).toBe("x");
    expect(codigoDeConvite("https://streamz.chat/invite/jsc2zafi", NOSSAS)).toBe("jsc2zafi");
  });

  it("reconhece o link na origem do app de desktop", () => {
    expect(codigoDeConvite("http://tauri.localhost/invite/x", NOSSAS)).toBe("x");
  });

  it("não reconhece o mesmo caminho em outro site", () => {
    expect(codigoDeConvite("https://exemplo.com/invite/x", NOSSAS)).toBeNull();
    expect(codigoDeConvite("https://streamz.chat.exemplo.com/invite/x", NOSSAS)).toBeNull();
  });

  it("o protocolo não separa o mesmo convite", () => {
    // colado como http, o host continua sendo o nosso
    expect(codigoDeConvite("http://streamz.chat/invite/x", NOSSAS)).toBe("x");
  });

  it("aceita a barra final e recusa o resto do app", () => {
    expect(codigoDeConvite("https://streamz.chat/invite/x/", NOSSAS)).toBe("x");
    expect(codigoDeConvite("https://streamz.chat/app", NOSSAS)).toBeNull();
    expect(codigoDeConvite("https://streamz.chat/invite", NOSSAS)).toBeNull();
    expect(codigoDeConvite("https://streamz.chat/invite/x/y", NOSSAS)).toBeNull();
  });

  it("ignora o que não é URL http(s)", () => {
    expect(codigoDeConvite("não é uma url", NOSSAS)).toBeNull();
    expect(codigoDeConvite("javascript:alert(1)", NOSSAS)).toBeNull();
    expect(codigoDeConvite("streamz.chat/invite/x", NOSSAS)).toBeNull();
  });

  it("sem host nosso configurado, nada é convite", () => {
    expect(codigoDeConvite("https://streamz.chat/invite/x", [])).toBeNull();
    expect(codigoDeConvite("https://streamz.chat/invite/x", [""])).toBeNull();
  });

  it("a porta faz parte do host (desenvolvimento)", () => {
    expect(codigoDeConvite("http://localhost:3000/invite/x", ["http://localhost:3000"])).toBe("x");
    expect(codigoDeConvite("http://localhost:3001/invite/x", ["http://localhost:3000"])).toBeNull();
  });
});
