/**
 * A moldura do palco entra e sai deslizando: o que mora em cima vem de cima, o
 * que mora embaixo vem de baixo. Os casos travam o sentido de cada lado e a
 * regra de quem esconde a moldura ao sair do palco — só o mouse.
 */
import { describe, expect, it } from "vitest";
import { classeDaMoldura, saidaEscondeAMoldura } from "./moldura-animada";

describe("classeDaMoldura", () => {
  it("à vista não desloca nem bloqueia o ponteiro", () => {
    for (const lado of ["cima", "baixo"] as const) {
      const classe = classeDaMoldura(true, lado);
      expect(classe).toContain("opacity-100");
      expect(classe).not.toContain("translate-y");
      expect(classe).not.toContain("pointer-events-none");
    }
  });

  it("escondida em cima sobe; embaixo desce", () => {
    expect(classeDaMoldura(false, "cima")).toContain("-translate-y-4");
    expect(classeDaMoldura(false, "baixo")).toMatch(/(^|\s)translate-y-4/);
    expect(classeDaMoldura(false, "baixo")).not.toContain("-translate-y-4");
  });

  it("escondida some e não recebe ponteiro", () => {
    for (const lado of ["cima", "baixo"] as const) {
      const classe = classeDaMoldura(false, lado);
      expect(classe).toContain("opacity-0");
      expect(classe).toContain("pointer-events-none");
    }
  });

  it("anima opacidade e deslocamento nos dois estados", () => {
    expect(classeDaMoldura(true, "cima")).toContain("transition-[opacity,transform]");
    expect(classeDaMoldura(false, "baixo")).toContain("transition-[opacity,transform]");
  });
});

describe("saidaEscondeAMoldura", () => {
  it("o mouse que sai do palco esconde na hora", () => {
    expect(saidaEscondeAMoldura("mouse")).toBe(true);
  });

  it("dedo e caneta não: levantar o dedo também é 'sair'", () => {
    expect(saidaEscondeAMoldura("touch")).toBe(false);
    expect(saidaEscondeAMoldura("pen")).toBe(false);
  });
});
