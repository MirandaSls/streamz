"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthCard, {
  FieldLabel,
  inputClass,
  submitClass,
} from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarSenha } from "@/lib/auth-mensagens";
import { useAuth } from "@/stores/auth";

/**
 * Cria a senha nova a partir do link do e-mail.
 *
 * Redefinir **derruba todas as sessões** na API — inclusive esta aba, se havia
 * uma. Por isso a tela limpa a sessão local antes de mandar para o login: sem
 * isso o app abriria com tokens que já não valem e cairia em 401 na primeira
 * requisição.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const logout = useAuth((s) => s.logout);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !token) return;
    const invalido = validarSenha(password);
    if (invalido) {
      setError(invalido);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      logout();
      setPronto(true);
    } catch (err) {
      setError(mensagemDeAuth(err, "conta"));
      setLoading(false);
    }
  }

  if (pronto) {
    return (
      <AuthCard
        title="Senha alterada"
        subtitle="Todas as sessões foram encerradas. Entre de novo com a senha nova."
      >
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className={submitClass}
          autoFocus
        >
          Ir para o login
        </button>
      </AuthCard>
    );
  }

  if (token === null) {
    return (
      <AuthCard
        title="Link inválido"
        subtitle="Este endereço não traz um token de redefinição. Peça um link novo."
      >
        <Link href="/forgot-password" className={`${submitClass} grid place-items-center`}>
          Pedir um link novo
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Criar uma senha nova">
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="password" invalid={!!error} hint={error ?? undefined}>
          Nova senha
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
          className={`${inputClass} mb-2`}
          autoFocus
        />

        <p role="alert" aria-live="polite" className="sr-only">
          {error}
        </p>

        <button type="submit" disabled={loading || !password} className={submitClass}>
          {loading ? "Salvando…" : "Salvar senha"}
        </button>

        <p className="mt-2 text-sm">
          <Link href="/login" className="font-medium text-txt-link hover:underline">
            Voltar ao login
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
