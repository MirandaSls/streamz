"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { exigeMfa } from "@streamz/shared";
import AuthCard, { FieldLabel, inputClass, submitClass } from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarLogin } from "@/lib/auth-mensagens";
import { useAuth } from "@/stores/auth";

/**
 * Login em dois passos: credenciais e, quando a conta tem 2FA, o código.
 *
 * O `ticket` que sustenta o segundo passo mora só no estado desta tela — é de
 * curta duração e não autentica nada sozinho, então não vai para o storage.
 */
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
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const invalido = validarLogin(identificador.trim(), password);
    if (invalido) {
      setError(invalido);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const resultado = await api.login(identificador.trim(), password);
      if (exigeMfa(resultado)) {
        setTicket(resultado.ticket);
        setPassword("");
        setLoading(false);
        return;
      }
      setSession(resultado.user, resultado.tokens);
      router.replace(destino);
    } catch (err) {
      setError(mensagemDeAuth(err, "login"));
      setLoading(false);
    }
  }

  async function onSubmitCodigo(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !ticket) return;
    setError(null);
    setLoading(true);
    try {
      const { user, tokens } = await api.loginMfa(ticket, code.trim());
      setSession(user, tokens);
      router.replace("/app");
    } catch (err) {
      setError(mensagemDeAuth(err, "conta"));
      setLoading(false);
    }
  }

  if (ticket) {
    return (
      <AuthCard
        title="Verificação em duas etapas"
        subtitle="Digite o código do seu app autenticador — ou um código de recuperação."
      >
        <form onSubmit={onSubmitCodigo} noValidate>
          <FieldLabel htmlFor="code" invalid={!!error} hint={error ?? undefined}>
            Código
          </FieldLabel>
          <input
            id="code"
            name="code"
            inputMode="text"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
            aria-invalid={error ? true : undefined}
            className={`${inputClass} tracking-[0.3em]`}
            autoFocus
          />

          <p role="alert" aria-live="polite" className="sr-only">
            {error}
          </p>

          <button type="submit" disabled={loading || !code.trim()} className={submitClass}>
            {loading ? "Verificando…" : "Entrar"}
          </button>

          <button
            type="button"
            onClick={() => {
              setTicket(null);
              setCode("");
              setError(null);
            }}
            className="mt-3 w-full text-sm font-medium text-txt-link hover:underline"
          >
            Voltar
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Bem-vindo de volta!" subtitle="Estamos muito animados em te ver novamente!">
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="identificador" invalid={!!error} hint={error ?? undefined}>
          E-mail ou usuário
        </FieldLabel>
        <input
          id="identificador"
          name="identificador"
          autoComplete="username"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
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
          className={`${inputClass} mb-2`}
        />
        <p className="mb-5 text-sm">
          <Link href="/forgot-password" className="font-medium text-txt-link hover:underline">
            Esqueceu sua senha?
          </Link>
        </p>

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
