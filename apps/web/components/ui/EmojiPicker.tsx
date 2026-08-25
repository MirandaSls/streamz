"use client";

import { useEffect, useRef } from "react";
import Picker, { EmojiStyle, Theme } from "emoji-picker-react";

/**
 * Seletor de emoji completo (busca, categorias, tons de pele), no tema escuro —
 * o mesmo papel do seletor do Discord. Fecha com Esc ou clique fora.
 */
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
      className={`z-[70] overflow-hidden rounded-lg shadow-high ${className}`}
    >
      <Picker
        onEmojiClick={(e) => onPick(e.emoji)}
        theme={Theme.DARK}
        emojiStyle={EmojiStyle.NATIVE}
        lazyLoadEmojis
        skinTonesDisabled={false}
        searchPlaceholder="Buscar emoji"
        previewConfig={{ showPreview: false }}
        width={352}
        height={420}
        style={
          {
            "--epr-bg-color": "#2b2d31",
            "--epr-category-label-bg-color": "#2b2d31",
            "--epr-search-input-bg-color": "#1e1f22",
            "--epr-picker-border-color": "#1e1f22",
            "--epr-hover-bg-color": "#35373c",
            "--epr-text-color": "#dbdee1",
            "--epr-search-input-text-color": "#dbdee1",
            "--epr-category-icon-active-color": "#5865f2",
          } as React.CSSProperties
        }
      />
    </div>
  );
}
