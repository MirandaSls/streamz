import { describe, expect, it } from "vitest";
import { iconesDeSilencio } from "./icones-de-silencio";

const livre = { muted: false, deafened: false, serverMute: false, serverDeaf: false };

describe("iconesDeSilencio", () => {
  it("ninguém silenciado: nenhum ícone", () => {
    expect(iconesDeSilencio(livre)).toEqual({ microfone: null, fone: null });
    // evento antigo, sem os campos de moderação
    expect(iconesDeSilencio({ muted: false, deafened: false })).toEqual({ microfone: null, fone: null });
  });

  it("silenciado pelo servidor: microfone vermelho", () => {
    expect(iconesDeSilencio({ ...livre, serverMute: true })).toEqual({ microfone: "servidor", fone: null });
  });

  it("áudio desativado pelo servidor: microfone e fone vermelhos", () => {
    // a surdez de servidor também tira o microfone, então os dois aparecem
    expect(iconesDeSilencio({ ...livre, serverDeaf: true })).toEqual({ microfone: "servidor", fone: "servidor" });
    expect(iconesDeSilencio({ ...livre, serverMute: true, serverDeaf: true })).toEqual({
      microfone: "servidor",
      fone: "servidor",
    });
  });

  it("o servidor vence o silêncio da própria pessoa", () => {
    expect(iconesDeSilencio({ ...livre, muted: true, serverMute: true })).toEqual({
      microfone: "servidor",
      fone: null,
    });
    expect(iconesDeSilencio({ ...livre, muted: true, deafened: true, serverDeaf: true })).toEqual({
      microfone: "servidor",
      fone: "servidor",
    });
    // mudo pelo servidor e surdo por conta própria: cada ícone com a sua origem
    expect(iconesDeSilencio({ ...livre, deafened: true, serverMute: true })).toEqual({
      microfone: "servidor",
      fone: "proprio",
    });
  });

  it("silêncio só da própria pessoa: um ícone cinza, como antes", () => {
    expect(iconesDeSilencio({ ...livre, muted: true })).toEqual({ microfone: "proprio", fone: null });
    expect(iconesDeSilencio({ ...livre, muted: true, deafened: true })).toEqual({ microfone: null, fone: "proprio" });
  });
});
