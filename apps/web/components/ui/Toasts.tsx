"use client";

import { X } from "lucide-react";
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
              ? "border border-red/40 bg-[#111214] text-txt-normal"
              : "bg-[#111214] text-txt-normal"
          }`}
        >
          <span className="min-w-0 flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dispensar aviso"
            className="text-txt-muted transition hover:text-txt-primary"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
