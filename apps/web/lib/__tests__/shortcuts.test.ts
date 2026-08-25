import { describe, expect, it } from "vitest";
import {
  SHORTCUTS,
  actionForEvent,
  formatShortcut,
  matchesShortcut,
  normalizeKey,
  parseShortcut,
  shortcutFromEvent,
} from "@/lib/shortcuts";

/** Evento de teclado mínimo, com todos os modificadores desligados. */
function tecla(key: string, mods: Partial<Record<"ctrl" | "alt" | "shift" | "meta", boolean>> = {}) {
  return {
    key,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
  };
}

describe("parseShortcut", () => {
  it("lê modificadores e tecla", () => {
    expect(parseShortcut("Ctrl+Shift+M")).toEqual({
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
      key: "m",
    });
  });

  it("aceita apelidos de seta", () => {
    expect(parseShortcut("Alt+Up")?.key).toBe("arrowup");
    expect(parseShortcut("Alt+ArrowUp")?.key).toBe("arrowup");
  });

  it("trata o próprio '+' como tecla", () => {
    expect(parseShortcut("Ctrl++")).toEqual({
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      key: "=",
    });
  });

  it("recusa combinação só de modificadores", () => {
    expect(parseShortcut("Ctrl+Shift")).toBeNull();
    expect(parseShortcut("")).toBeNull();
  });
});

describe("normalizeKey", () => {
  it("iguala '+' a '=' (a mesma tecla física)", () => {
    expect(normalizeKey("+")).toBe("=");
    expect(normalizeKey("=")).toBe("=");
  });

  it("baixa a caixa das letras", () => {
    expect(normalizeKey("M")).toBe("m");
  });
});

describe("matchesShortcut", () => {
  it("casa a combinação exata", () => {
    expect(matchesShortcut(tecla("M", { ctrl: true, shift: true }), "Ctrl+Shift+M")).toBe(true);
  });

  it("recusa quando sobra modificador", () => {
    expect(matchesShortcut(tecla("M", { ctrl: true, shift: true, alt: true }), "Ctrl+Shift+M")).toBe(
      false,
    );
  });

  it("recusa quando falta modificador", () => {
    expect(matchesShortcut(tecla("M", { ctrl: true }), "Ctrl+Shift+M")).toBe(false);
  });

  it("aceita Meta no lugar de Ctrl (macOS)", () => {
    expect(matchesShortcut(tecla("k", { meta: true }), "Ctrl+K")).toBe(true);
  });

  it("não confunde Alt+↑ com Alt+Shift+↑", () => {
    expect(matchesShortcut(tecla("ArrowUp", { alt: true }), "Alt+ArrowUp")).toBe(true);
    expect(matchesShortcut(tecla("ArrowUp", { alt: true, shift: true }), "Alt+ArrowUp")).toBe(false);
  });
});

describe("actionForEvent", () => {
  it("resolve o atalho do quick switcher", () => {
    expect(actionForEvent(tecla("k", { ctrl: true }))).toBe("quickSwitcher");
  });

  it("separa Esc de Shift+Esc", () => {
    expect(actionForEvent(tecla("Escape"))).toBe("marcarLido");
    expect(actionForEvent(tecla("Escape", { shift: true }))).toBe("marcarServidorLido");
  });

  it("aceita as duas formas do zoom (=, Shift+=)", () => {
    expect(actionForEvent(tecla("=", { ctrl: true }))).toBe("zoomMais");
    expect(actionForEvent(tecla("+", { ctrl: true, shift: true }))).toBe("zoomMais");
    expect(actionForEvent(tecla("-", { ctrl: true }))).toBe("zoomMenos");
  });

  it("devolve null para tecla solta", () => {
    expect(actionForEvent(tecla("a"))).toBeNull();
  });
});

describe("SHORTCUTS", () => {
  it("tem todas as combinações válidas", () => {
    for (const spec of SHORTCUTS) {
      for (const combo of spec.combos) expect(parseShortcut(combo), combo).not.toBeNull();
    }
  });

  it("não repete a mesma combinação em duas ações", () => {
    const vistos = new Set<string>();
    for (const spec of SHORTCUTS) {
      for (const combo of spec.combos) {
        const chave = JSON.stringify(parseShortcut(combo));
        expect(vistos.has(chave), combo).toBe(false);
        vistos.add(chave);
      }
    }
  });
});

describe("shortcutFromEvent", () => {
  it("grava a combinação apertada", () => {
    expect(shortcutFromEvent(tecla("M", { ctrl: true, shift: true }))).toBe("Ctrl+Shift+M");
    expect(shortcutFromEvent(tecla(" ", { ctrl: true }))).toBe("Ctrl+Space");
  });

  it("ignora modificador sozinho", () => {
    expect(shortcutFromEvent(tecla("Control", { ctrl: true }))).toBeNull();
    expect(shortcutFromEvent(tecla("Shift", { shift: true }))).toBeNull();
  });

  it("volta a casar com o próprio evento", () => {
    const evento = tecla("F", { alt: true });
    const combo = shortcutFromEvent(evento)!;
    expect(matchesShortcut(evento, combo)).toBe(true);
  });
});

describe("formatShortcut", () => {
  it("mostra símbolo em vez de nome de tecla", () => {
    expect(formatShortcut("Alt+Shift+ArrowDown")).toBe("Alt + Shift + ↓");
    expect(formatShortcut("Ctrl+Shift+M")).toBe("Ctrl + Shift + M");
    expect(formatShortcut("Escape")).toBe("Esc");
  });
});
