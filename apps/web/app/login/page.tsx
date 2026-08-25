"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthCard, { FieldLabel, inputClass, submitClass } from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarCredenciais } from "@/lib/auth-mensagens";
import { useAuth } from "@/stores/auth";

export default function LoginPage() {
  const router = useRouter();
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
      router.replace("/app");
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
          <Link href="/register" className="font-medium text-txt-link hover:underline">
            Registre-se
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
