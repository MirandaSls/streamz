"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { mensagemDeAuth, REGRAS_CREDENCIAIS, validarCredenciais } from "@/lib/auth-mensagens";
import { useAuth } from "@/stores/auth";

export default function RegisterPage() {
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
      const { user, tokens } = await api.register(username.trim(), password);
      setSession(user, tokens);
      router.replace("/app");
    } catch (err) {
      setError(mensagemDeAuth(err, "registro"));
      setLoading(false);
    }
  }

  return (
    <main className="flex h-screen items-center justify-center">
      <form
        onSubmit={onSubmit}
        noValidate
        className="w-[380px] rounded-lg bg-panel p-6 shadow-xl"
      >
        <h1 className="mb-1 text-xl font-bold text-white">Criar conta</h1>
        <p className="mb-5 text-sm text-neutral-400">Escolha um usuário e senha.</p>

        <label
          htmlFor="username"
          className="mb-1 block text-xs font-semibold uppercase text-neutral-300"
        >
          Usuário
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          aria-invalid={error ? true : undefined}
          aria-describedby="dica-usuario"
          className="w-full rounded bg-rail px-3 py-2 text-sm outline-none disabled:opacity-60"
          autoFocus
        />
        <p id="dica-usuario" className="mb-3 mt-1 text-xs text-neutral-500">
          {REGRAS_CREDENCIAIS.usuario.min} a {REGRAS_CREDENCIAIS.usuario.max} caracteres —
          letras, números, _ . e -
        </p>

        <label
          htmlFor="password"
          className="mb-1 block text-xs font-semibold uppercase text-neutral-300"
        >
          Senha
        </label>
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
          className="w-full rounded bg-rail px-3 py-2 text-sm outline-none disabled:opacity-60"
        />
        <p id="dica-senha" className="mb-4 mt-1 text-xs text-neutral-500">
          Mínimo de {REGRAS_CREDENCIAIS.senha.min} caracteres
        </p>

        {/* aria-live: leitores de tela anunciam o erro sem mover o foco */}
        <p role="alert" aria-live="polite" className="mb-3 text-sm text-red-400 empty:mb-0">
          {error}
        </p>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Criando…" : "Registrar"}
        </button>

        <p className="mt-4 text-sm text-neutral-400">
          Já tem conta?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}
