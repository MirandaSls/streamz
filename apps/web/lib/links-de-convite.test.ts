import { describe, expect, it } from "vitest";
import { codigoDeConvite, urlDeConvite } from "./links-de-convite";

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

/**
 * O outro lado do mesmo defeito: **gerar** o link.
 *
 * O modal "Convidar amigos" montava a URL com `window.location.origin` e, no
 * desktop, mandava `http://tauri.localhost/invite/<código>` para o amigo — um
 * endereço que só existe dentro do WebView2 de quem convidou. O link tem que
 * nascer no host público, e o que nasce ali tem que ser reconhecido como
 * convite dos dois lados (é o cartão com "Entrar" do #104).
 */
describe("gerar o link do convite", () => {
  it("usa o host público mesmo com o app servido do tauri.localhost", () => {
    expect(urlDeConvite("vyuo3x0x", NOSSAS)).toBe("https://streamz.chat/invite/vyuo3x0x");
  });

  it("o link gerado é reconhecido como convite (o cartão com Entrar)", () => {
    const url = urlDeConvite("vyuo3x0x", NOSSAS);
    expect(codigoDeConvite(url, NOSSAS)).toBe("vyuo3x0x");
  });

  it("sem host público configurado cai na origem da janela", () => {
    expect(urlDeConvite("x", ["", "http://localhost:3000"])).toBe("http://localhost:3000/invite/x");
  });
});
