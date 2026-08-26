"use client";

import type { ReactNode } from "react";
import MarcaLockup from "../ui/MarcaLockup";

/**
 * Moldura das telas de conta: fundo Void Ink com um brilho de limão, cartão de
 * 480px, lockup da marca acima do título.
 */
export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  /** opcional: telas de resultado ("e-mail confirmado") são só título e texto. */
  children?: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-rail bg-[radial-gradient(ellipse_at_top_left,rgba(155,227,31,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(155,227,31,0.05),transparent_60%)] p-4">
      <div className="w-[480px] max-w-full rounded-[5px] bg-chat p-8 shadow-high">
        <MarcaLockup size={34} className="mb-5 flex w-full justify-center text-txt-primary" />
        <h1 className="text-center font-display text-2xl font-extrabold uppercase leading-[30px] tracking-wordmark text-txt-primary">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-center text-txt-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}

/** Rótulo em caixa-alta com o asterisco vermelho de obrigatório. */
export function FieldLabel({
  htmlFor,
  children,
  invalid = false,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  invalid?: boolean;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-2 block font-display text-xs font-bold uppercase tracking-[0.02em] ${
        invalid ? "text-red" : "text-txt-secondary"
      }`}
    >
      {children}
      {hint ? (
        <span className="normal-case italic"> - {hint}</span>
      ) : (
        <span className="text-red" aria-hidden="true">
          {" "}
          *
        </span>
      )}
    </label>
  );
}

export const inputClass =
  "mb-5 h-10 w-full rounded-[3px] bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted disabled:opacity-60";

export const submitClass =
  "h-11 w-full rounded-[3px] bg-accent font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60";
