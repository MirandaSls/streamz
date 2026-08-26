"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MIN_ACCOUNT_AGE_YEARS } from "@streamz/shared";
import AuthCard, {
  FieldLabel,
  MedidorDeSenha,
  inputClass,
  submitClass,
} from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarRegistro } from "@/lib/auth-mensagens";
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
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const dados = {
      email: email.trim(),
      username: username.trim(),
      password,
      birthDate: birthDate || undefined,
    };
    const invalido = validarRegistro(dados);
    if (invalido) {
      setError(invalido);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { user, tokens } = await api.register(dados);
      setSession(user, tokens);
      // a conta já está utilizável; a tela seguinte só pede a confirmação
      router.replace("/verify-email");
    } catch (err) {
      setError(mensagemDeAuth(err, "registro"));
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Criar uma conta">
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="email" invalid={!!error}>
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

        <FieldLabel htmlFor="username" invalid={!!error}>
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
        />
        <p id="dica-usuario" className="mb-5 text-xs text-txt-muted">
          3 a 32 caracteres — letras, números, _ . e -
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
          className={`${inputClass} mb-2`}
        />
        <MedidorDeSenha senha={password} />

        <label
          htmlFor="birthDate"
          className="mb-2 block text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary"
        >
          Data de nascimento
          <span className="normal-case italic text-txt-muted"> - opcional</span>
        </label>
        <input
          id="birthDate"
          name="birthDate"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          disabled={loading}
          aria-describedby="dica-nascimento"
          className={`${inputClass} mb-2`}
        />
        <p id="dica-nascimento" className="mb-5 text-xs text-txt-muted">
          É preciso ter ao menos {MIN_ACCOUNT_AGE_YEARS} anos para criar uma conta.
        </p>

        {error && (
          <p role="alert" aria-live="polite" className="mb-3 text-sm text-red">
            {error}
          </p>
        )}

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
