"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCard, { FieldLabel, inputClass, submitClass } from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth, REGRAS_CREDENCIAIS, validarCredenciais } from "@/lib/auth-mensagens";
import { useAuth } from "@/stores/auth";

export default function RegisterPage() {
  // `useSearchParams` exige Suspense no App Router (a página é pré-renderizada)
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // h-moderacao: quem chegou por um link de convite volta para ele depois de
  // criar a conta. Só caminho interno — `next` não redireciona para fora.
  const proximo = searchParams.get("next");
  const destino = proximo?.startsWith("/") && !proximo.startsWith("//") ? proximo : "/app";
  const setSession = useAuth((s) => s.setSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const invalido = validarCredenciais(username.trim(), password);
    if (invalido) {
      setError(invalido);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { user, tokens } = await api.register(username.trim(), password);
      setSession(user, tokens);
      router.replace(destino);
    } catch (err) {
      setError(mensagemDeAuth(err, "registro"));
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Criar uma conta">
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="username" invalid={!!error} hint={error ?? undefined}>
          Usuário
        </FieldLabel>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          aria-invalid={error ? true : undefined}
          aria-describedby="dica-usuario"
          className={`${inputClass} mb-2`}
          autoFocus
        />
        <p id="dica-usuario" className="mb-5 text-xs text-txt-muted">
          {REGRAS_CREDENCIAIS.usuario.min} a {REGRAS_CREDENCIAIS.usuario.max} caracteres —
          letras, números, _ . e -
        </p>

        <FieldLabel htmlFor="password" invalid={!!error}>
          Senha
        </FieldLabel>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          aria-invalid={error ? true : undefined}
          aria-describedby="dica-senha"
          className={`${inputClass} mb-2`}
        />
        <p id="dica-senha" className="mb-5 text-xs text-txt-muted">
          Mínimo de {REGRAS_CREDENCIAIS.senha.min} caracteres
        </p>

        <p role="alert" aria-live="polite" className="sr-only">
          {error}
        </p>

        <button type="submit" disabled={loading} className={submitClass}>
          {loading ? "Criando…" : "Continuar"}
        </button>

        <p className="mt-2 text-sm">
          <Link
            href={destino === "/app" ? "/login" : `/login?next=${encodeURIComponent(destino)}`}
            className="font-medium text-txt-link hover:underline"
          >
            Já tem uma conta?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
