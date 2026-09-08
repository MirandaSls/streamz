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
    /*
      Celular (`max-md:`, o mesmo corte de 768px do `hooks/useEhMobile`):
      - `min-h-[100dvh]` no lugar de `100vh` — `vh` é a janela **sem** a barra
        de endereço do navegador móvel, e com ela na tela sobrava uma faixa
        rolável embaixo do cartão;
      - as áreas seguras entram no padding para a marca e o cartão não caírem
        atrás do entalhe nem da barra de gestos (é o `viewportFit: "cover"` do
        `app/layout.tsx` que faz o `env()` responder alguma coisa).
      No desktop as duas são inertes: `100dvh` = `100vh` numa janela sem barra
      que some, e `env(safe-area-inset-*)` vale zero.
    */
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-void p-4 max-md:px-[max(1rem,env(safe-area-inset-left))] max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:pt-[max(4.5rem,env(safe-area-inset-top))]">
      <AuthBackground />

      <MarcaLockup
        size={26}
        className="absolute left-6 top-6 text-txt-primary max-md:left-[max(1.5rem,env(safe-area-inset-left))] max-md:top-[max(1.5rem,env(safe-area-inset-top))] md:left-10 md:top-8"
      />

      {/* 24px de respiro no celular: com os 32 do desktop sobram 294px de
          conteúdo numa tela de 390 */}
      <div className="relative w-full max-w-[480px] rounded-[5px] bg-chat p-8 shadow-[0_16px_48px_rgba(0,0,0,.6),0_4px_12px_rgba(0,0,0,.45)] max-md:p-6">
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

// a borda escura é o que separa o campo do corpo do cartão: `bg-void` sozinho
// encosta no `bg-chat` sem aresta e o campo some
//
// `max-md:h-12` nos dois: 40 e 43px são alvos de dedo curtos (o piso das
// diretrizes de toque é 44), e no celular o texto do campo passa a 16px por
// causa da regra do `globals.css` que evita o zoom do iOS — numa caixa de 40px
// ele fica encostado nas bordas. 48px acomoda os dois. No desktop nada muda.
export const inputClass =
  "mb-5 h-10 w-full rounded-[3px] border border-black/30 bg-void px-2.5 text-txt-normal outline-none placeholder:text-txt-muted disabled:opacity-60 max-md:h-12";

export const submitClass =
  "h-11 w-full rounded-[3px] bg-accent font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 max-md:h-12";

/** Link de apoio dos formulários de conta (voltar, ajuda, alternativas). */
export const linkClass = "font-medium text-txt-link hover:underline";
