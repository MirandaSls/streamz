"use client";

import { useState } from "react";
import Link from "next/link";
import AuthCard, { FieldLabel, inputClass, submitClass } from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth } from "@/lib/auth-mensagens";

/**
 * "Esqueci a senha".
 *
 * A resposta é sempre a mesma, exista ou não a conta — a API não revela quem
 * tem cadastro, e a tela não pode desmentir isso mostrando dois textos
 * diferentes.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      setEnviado(true);
    } catch (err) {
      setError(mensagemDeAuth(err, "conta"));
    } finally {
      setLoading(false);
    }
  }

  if (enviado) {
    return (
      <AuthCard
        title="Confira seu e-mail"
        subtitle="Se houver uma conta com esse e-mail, o link de redefinição acabou de sair. Ele vale por 1 hora."
      >
        <Link href="/login" className={`${submitClass} grid place-items-center`}>
          Voltar ao login
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Redefinir a senha"
      subtitle="Informe o e-mail da conta e mandamos um link para criar uma senha nova."
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="email" invalid={!!error} hint={error ?? undefined}>
          E-mail
        </FieldLabel>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          aria-invalid={error ? true : undefined}
          className={inputClass}
          autoFocus
        />

        <p role="alert" aria-live="polite" className="sr-only">
          {error}
        </p>

        <button type="submit" disabled={loading || !email.trim()} className={submitClass}>
          {loading ? "Enviando…" : "Enviar link"}
        </button>

        <p className="mt-2 text-sm">
          <Link href="/login" className="font-medium text-text-link hover:underline">
            Voltar ao login
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
