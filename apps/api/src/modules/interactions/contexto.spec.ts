import { describe, expect, it } from "vitest";
import { conferirAlvoDoComando, lerTiposDeComando, tipoDoDataGuardado } from "./contexto";

/** ── menus de contexto ── as regras puras de `contexto.ts`. */

describe("lerTiposDeComando (`?tipos=`)", () => {
  it("ausente ou vazio é só o comando de barra", () => {
    expect(lerTiposDeComando(undefined)).toEqual([1]);
    expect(lerTiposDeComando("")).toEqual([1]);
  });

  it("lista separada por vírgula, sem repetição", () => {
    expect(lerTiposDeComando("2,3")).toEqual([2, 3]);
    expect(lerTiposDeComando(" 3 , 2,3")).toEqual([3, 2]);
    expect(lerTiposDeComando("1")).toEqual([1]);
  });

  it("valor inválido é null (400 no controller)", () => {
    for (const bruto of ["0", "4", "2,x", "2,", "12", "-1", "2.0"]) {
      expect(lerTiposDeComando(bruto), bruto).toBeNull();
    }
    // `?tipos=1&tipos=2` chega como array
    expect(lerTiposDeComando(["1", "2"])).toBeNull();
  });
});

describe("conferirAlvoDoComando", () => {
  it("barra sem alvo passa; com alvo é 400", () => {
    expect(conferirAlvoDoComando(1, undefined, 2)).toBeNull();
    expect(conferirAlvoDoComando(1, "m_1", 0)).toEqual({
      status: 400,
      mensagem: "Comando de barra não tem alvo",
    });
  });

  it("contexto exige alvo e recusa opções", () => {
    for (const tipo of [2, 3]) {
      expect(conferirAlvoDoComando(tipo, "x", 0)).toBeNull();
      expect(conferirAlvoDoComando(tipo, undefined, 0)).toEqual({
        status: 400,
        mensagem: "Comando de contexto sem alvo",
      });
      expect(conferirAlvoDoComando(tipo, "x", 1)?.status).toBe(400);
    }
  });
});

describe("tipoDoDataGuardado", () => {
  it("lê `type` 1/2/3 e ignora o resto", () => {
    expect(tipoDoDataGuardado({ type: 3 })).toBe(3);
    expect(tipoDoDataGuardado({ type: 2 })).toBe(2);
    expect(tipoDoDataGuardado({ type: 1 })).toBe(1);
    expect(tipoDoDataGuardado({ type: "3" })).toBeUndefined();
    expect(tipoDoDataGuardado({ custom_id: "x" })).toBeUndefined();
    expect(tipoDoDataGuardado(null)).toBeUndefined();
    expect(tipoDoDataGuardado([])).toBeUndefined();
  });
});
