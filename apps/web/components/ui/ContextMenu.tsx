"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useUI } from "@/stores/ui";

const WIDTH = 220;

/**
 * Menu de contexto (botão direito) no estilo do Discord: caixa escura, itens
 * de 32px, hover azul. Um só na tela, aberto por `ui.openContextMenu(x, y, items)`.
 *
 * Fecha com Esc, clique fora, rolagem ou redimensionamento — qualquer coisa que
 * deixaria o menu solto longe do que o abriu.
 */
export default function ContextMenuHost() {
  const menu = useUI((s) => s.contextMenu);
  const close = useUI((s) => s.closeContextMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // mantém o menu dentro da viewport
  useLayoutEffect(() => {
    if (!menu) {
      setPos(null);
      return;
    }
    const h = ref.current?.offsetHeight ?? 0;
    const x = Math.min(menu.x, window.innerWidth - WIDTH - 8);
    const y = Math.min(menu.y, window.innerHeight - h - 8);
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, close]);

  useEffect(() => {
    if (menu) ref.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
  }, [menu]);

  if (!menu) return null;

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, width: WIDTH }}
      className={`fixed z-[80] rounded bg-overlay p-1.5 shadow-high ${pos ? "" : "invisible"}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        "separator" in item ? (
          <div key={i} role="separator" className="mx-1 my-1 h-px bg-border" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              close();
              item.onSelect();
            }}
            className={`flex h-8 w-full items-center justify-between rounded-[3px] px-2 text-sm font-medium disabled:opacity-40 ${
              item.danger
                ? "text-red hover:bg-red hover:text-white focus-visible:bg-red focus-visible:text-white"
                : "text-txt-secondary hover:bg-accent hover:text-accent-ink focus-visible:bg-accent focus-visible:text-accent-ink"
            }`}
          >
            <span>{item.label}</span>
            {item.icon ? <span className="ml-2 opacity-80">{item.icon as ReactNode}</span> : null}
          </button>
        ),
      )}
    </div>
  );
}
