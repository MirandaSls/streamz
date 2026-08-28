"use client";

import type { ReactNode } from "react";
import AuthBackground from "@/components/auth/AuthBackground";
import MarcaLockup from "@/components/ui/MarcaLockup";

/**
 * Moldura das telas de conta: a cena da marca cobrindo a viewport, o lockup no
 * canto da **página** e o cartão elevado no centro.
 *
 * O lockup saiu de dentro do cartão de propósito: o cartão é o formulário, e
 * repetir a marca acima do título rouba a primeira linha de leitura do que a
 * pessoa veio fazer. A marca identifica a página, não a caixa.
 *
 * Coluna única de 480px. O Discord põe o bloco de "entrar com QR Code" ao lado
 * do formulário, mas isso pressupõe um app móvel para escanear — fora do escopo
 * aqui, e um QR que não autentica ninguém seria só enfeite.
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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-rail p-4">
      <AuthBackground />

      <MarcaLockup
        size={26}
        className="absolute left-6 top-6 text-txt-primary md:left-10 md:top-8"
      />

      <div className="relative w-full max-w-[480px] rounded-[5px] bg-chat p-8 shadow-[0_16px_48px_rgba(0,0,0,.6),0_4px_12px_rgba(0,0,0,.45)]">
        <h1 className="text-center font-display text-2xl font-semibold leading-8 tracking-title text-txt-primary">
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

/** Rótulo de campo opcional: sem asterisco, mas com o mesmo desenho. */
export function OptionalFieldLabel({
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
      {hint && <span className="normal-case italic"> - {hint}</span>}
    </label>
  );
}

// a borda escura é o que separa o campo do corpo do cartão: `bg-rail` sozinho
// encosta no `bg-chat` sem aresta e o campo some
export const inputClass =
  "mb-5 h-10 w-full rounded-[3px] border border-black/30 bg-rail px-2.5 text-txt-normal outline-none placeholder:text-txt-muted disabled:opacity-60";

export const submitClass =
  "h-11 w-full rounded-[3px] bg-accent font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60";

/** Link de apoio dos formulários de conta (voltar, ajuda, alternativas). */
export const linkClass = "font-medium text-txt-link hover:underline";
