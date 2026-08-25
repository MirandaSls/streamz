"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * Caixa de diálogo acessível — a base de todos os modais do app.
 *
 * Os modais antigos eram `div`s soltas: sem papel semântico, sem foco, sem Esc.
 * Aqui o contrato é único: `role="dialog"` + `aria-modal`, foco inicial no
 * primeiro elemento útil, Tab preso dentro da caixa, Esc e clique fora fecham, e
 * o foco volta para quem abriu.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  className = "w-[380px]",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** largura da caixa (as do app variam entre 360px e 400px). */
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // `data-autofocus` deixa o modal escolher o alvo (ex.: um confirm
    // destrutivo abre com o foco em "Cancelar", não no botão que apaga)
    const target =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    target?.focus();
    // devolve o foco para o botão que abriu o modal
    return () => previous?.focus?.();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((node) => node.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`max-h-[85vh] overflow-y-auto rounded-lg bg-panel p-6 shadow-xl outline-none ${className}`}
      >
        <h2 id={titleId} className="mb-1 text-lg font-bold text-white">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mb-3 text-sm text-neutral-400">
            {description}
          </p>
        )}
        {children}
        {footer && <div className="mt-4 flex gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Botão primário do rodapé de um modal. */
export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = "button",
  danger = false,
  autoFocus = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  danger?: boolean;
  /** marca este botão como o alvo do foco inicial do modal. */
  autoFocus?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-autofocus={autoFocus ? "" : undefined}
      className={`flex-1 rounded py-2 text-sm font-medium text-white transition disabled:opacity-40 ${
        danger ? "bg-red-600 hover:brightness-110" : "bg-accent hover:brightness-110"
      }`}
    >
      {children}
    </button>
  );
}

/** Botão secundário (cancelar/fechar). */
export function SecondaryButton({
  children,
  onClick,
  full = false,
  autoFocus = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  full?: boolean;
  /** marca este botão como o alvo do foco inicial do modal. */
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-autofocus={autoFocus ? "" : undefined}
      className={`rounded bg-rail py-2 text-sm text-neutral-300 transition hover:text-white ${
        full ? "w-full" : "px-4"
      }`}
    >
      {children}
    </button>
  );
}
