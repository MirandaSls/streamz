import { describe, expect, it } from "vitest";
import type { Role } from "@streamz/shared";
import { corDeCargoNoCanal } from "./permissions";

/**
 * "Em conversa direta e em grupo o nome do autor sai colorido com a cor de
 * cargo do último servidor aberto — quatro cores diferentes num grupo que não
 * tem cargo nenhum."
 *
 * O caminho do defeito: `usePermissions` guarda os cargos do servidor **ativo**
 * e não os larga ao abrir uma conversa (a coluna do servidor continua montada
 * atrás). O seletor da cor só olhava "que cargos este usuário tem", nunca "em
 * que canal esta mensagem está" — e conversa direta e grupo são `Channel` com
 * `guildId` null (ADR-0001), onde cargo não existe. No Discord, ali o nome é a
 * cor padrão de texto.
 *
 * Testar a regra pura, e não o hook, é de propósito: assim a prova não precisa
 * de DOM nem de React, como o resto dos testes de `stores/`.
 */

function cargo(extra: Partial<Role> = {}): Role {
  return {
    id: "r1",
    guildId: "g1",
    name: "Moderação",
    color: "#e67e22",
    position: 5,
    permissions: 0,
    hoist: false,
    mentionable: false,
    isDefault: false,
    ...extra,
  };
}

describe("corDeCargoNoCanal", () => {
  it("em canal de servidor o nome sai na cor do cargo mais alto com cor", () => {
    const alto = cargo({ id: "r1", position: 9, color: "#9be31f" });
    const baixo = cargo({ id: "r2", position: 2, color: "#e67e22" });
    expect(corDeCargoNoCanal("g1", "g1", ["r1", "r2"], [alto, baixo])).toBe("#9be31f");
  });

  it("em conversa e em grupo (guildId null) não há cargo: cor padrão", () => {
    // os mesmos cargos continuam carregados — é exatamente o estado do defeito
    expect(corDeCargoNoCanal(null, "g1", ["r1"], [cargo()])).toBeNull();
  });

  it("cargo de outro servidor não colore o nome", () => {
    expect(corDeCargoNoCanal("g2", "g1", ["r1"], [cargo()])).toBeNull();
  });

  it("membro sem cargo fica na cor padrão", () => {
    expect(corDeCargoNoCanal("g1", "g1", [], [cargo()])).toBeNull();
  });

  it("cargo sem cor não pinta nada", () => {
    expect(corDeCargoNoCanal("g1", "g1", ["r1"], [cargo({ color: null })])).toBeNull();
  });
});
