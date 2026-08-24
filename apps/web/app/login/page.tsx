"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
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
    setError(null);
    setLoading(true);
    try {
      const { user, tokens } = await api.login(username, password);
      setSession(user, tokens);
      router.replace("/app");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex h-screen items-center justify-center">
      <form
        onSubmit={onSubmit}
        className="w-[380px] rounded-lg bg-panel p-6 shadow-xl"
      >
        <h1 className="mb-1 text-xl font-bold text-white">Bem-vindo de volta</h1>
        <p className="mb-5 text-sm text-neutral-400">Entre para conversar.</p>

        <label className="mb-1 block text-xs font-semibold uppercase text-neutral-300">
          Usuário
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-3 w-full rounded bg-rail px-3 py-2 text-sm outline-none"
          autoFocus
        />

        <label className="mb-1 block text-xs font-semibold uppercase text-neutral-300">
          Senha
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded bg-rail px-3 py-2 text-sm outline-none"
        />

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <button
          disabled={loading}
          className="w-full rounded bg-accent py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <p className="mt-4 text-sm text-neutral-400">
          Não tem conta?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Registre-se
          </Link>
        </p>
      </form>
    </main>
  );
}
