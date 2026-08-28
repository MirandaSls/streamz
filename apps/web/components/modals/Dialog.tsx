"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";

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
  hideHeader = false,
  showClose = true,
  align = "center",
  bodyClassName = "",
  className = "w-[440px]",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** esconde o cabeçalho visual mantendo o título para leitores de tela
   *  (quick switcher e perfil não têm título escrito no Discord). */
  hideHeader?: boolean;
  showClose?: boolean;
  /** o quick switcher fica no terço superior, não no centro. */
  align?: "center" | "top";
  bodyClassName?: string;
  /** largura da caixa (o padrão do Discord é 440px). */
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
      className={`fixed inset-0 z-50 grid justify-items-center bg-black/85 p-4 anim-overlay ${
        align === "top" ? "items-start pt-[10vh]" : "items-center"
      }`}
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
        className={`relative flex max-h-[85vh] flex-col overflow-hidden rounded-lg bg-chat shadow-high outline-none anim-modal ${className}`}
      >
        {/* cabeçalho fica fora da área rolável: no Discord ele não sobe junto */}
        {hideHeader ? (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        ) : (
          <div className="shrink-0 px-4 pt-4">
            <h2
              id={titleId}
              className="pr-8 font-display text-xl font-bold tracking-title text-txt-primary"
            >
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-txt-muted">
                {description}
              </p>
            )}
          </div>
        )}
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-10 grid h-6 w-6 place-items-center rounded text-txt-muted transition hover:text-txt-primary"
          >
            <X size={20} />
          </button>
        )}
        {/* só o corpo rola; o rodapé fica sempre à vista */}
        <div className={`min-h-0 flex-1 overflow-y-auto p-4 ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-row-reverse items-center gap-3 bg-panel px-4 py-4 shadow-[0_-1px_0_rgba(0,0,0,.2)]">
            {footer}
          </div>
        )}
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
      className={`h-[38px] min-w-24 rounded-[3px] px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "bg-red text-white hover:bg-red-hover"
          : "bg-accent text-accent-ink hover:bg-accent-hover"
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
      className={`h-[38px] min-w-24 rounded-[3px] px-4 text-sm font-medium text-txt-normal transition hover:underline ${
        full ? "w-full bg-border-strong hover:bg-border-strong-hover hover:no-underline" : ""
      }`}
    >
      {children}
    </button>
  );
}
