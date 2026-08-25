"use client";

import { useEffect, useRef } from "react";

/** Emojis mais usados no Discord, em grade — o MVP não tem o seletor completo. */
export const EMOJIS = [
  "👍", "❤️", "😂", "🔥", "🎉", "😢", "😮", "🙏",
  "👏", "💯", "🤔", "👀", "😍", "🥳", "😎", "🤝",
  "✅", "❌", "⭐", "🚀", "💀", "🫡", "🤣", "😭",
];

/** Grade de emojis num popover escuro; fecha com Esc ou clique fora. */
export default function EmojiPicker({
  onPick,
  onClose,
  className = "",
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Escolher emoji"
      className={`z-[70] w-[264px] rounded-lg bg-panel p-2 shadow-high ${className}`}
    >
      <div className="mb-1 px-1 text-xs font-bold uppercase text-txt-muted">Frequentes</div>
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={`Emoji ${e}`}
            onClick={() => onPick(e)}
            className="grid h-8 w-8 place-items-center rounded text-xl transition hover:bg-hov"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
