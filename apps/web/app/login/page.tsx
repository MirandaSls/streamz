"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCard, { FieldLabel, inputClass, submitClass } from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarCredenciais } from "@/lib/auth-mensagens";
import { useAuth } from "@/stores/auth";

export default function LoginPage() {
  // `useSearchParams` exige Suspense no App Router (a página é pré-renderizada)
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // h-moderacao: `?next=` traz de volta para onde a pessoa estava indo — é o
  // que faz o link público de convite funcionar para quem ainda não entrou.
  // Só caminho interno: `next` vindo da URL não pode virar um redirecionamento
  // para outro site.
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
      const { user, tokens } = await api.login(username.trim(), password);
      setSession(user, tokens);
      router.replace(destino);
    } catch (err) {
      setError(mensagemDeAuth(err, "login"));
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Bem-vindo de volta!" subtitle="Estamos muito animados em te ver novamente!">
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
          className={inputClass}
          autoFocus
        />

        <FieldLabel htmlFor="password" invalid={!!error}>
          Senha
        </FieldLabel>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          aria-invalid={error ? true : undefined}
          className={inputClass}
        />

        {/* aria-live: leitores de tela anunciam o erro sem mover o foco */}
        <p role="alert" aria-live="polite" className="sr-only">
          {error}
        </p>

        <button type="submit" disabled={loading} className={submitClass}>
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <p className="mt-2 text-sm text-txt-muted">
          Precisando de uma conta?{" "}
          <Link
            href={destino === "/app" ? "/register" : `/register?next=${encodeURIComponent(destino)}`}
            className="font-medium text-txt-link hover:underline"
          >
            Registre-se
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
