"use client";

import { useUI } from "@/stores/ui";

/**
 * Avisos temporários no canto — o que antes era `alert()`.
 *
 * Fica em `aria-live="polite"` para que o leitor de tela anuncie o aviso sem
 * roubar o foco de quem está digitando.
 */
export default function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[320px] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg px-3 py-2 text-sm shadow-lg ${
            toast.kind === "error"
              ? "bg-red-900/90 text-red-100"
              : "bg-panel text-neutral-200"
          }`}
        >
          <span className="min-w-0 flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dispensar aviso"
            className="text-neutral-400 transition hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
