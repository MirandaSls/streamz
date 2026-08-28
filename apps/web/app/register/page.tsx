"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MAX_DISPLAY_NAME } from "@streamz/shared";
import AuthCard, {
  FieldLabel,
  OptionalFieldLabel,
  inputClass,
  linkClass,
  submitClass,
} from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarRegistro } from "@/lib/auth-mensagens";
import { useAuth } from "@/stores/auth";
import { ui } from "@/stores/ui";

export default function RegisterPage() {
  // `useSearchParams` exige Suspense no App Router (a página é pré-renderizada)
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

type Campo = "email" | "username" | "password";

/**
 * De qual campo a mensagem de recusa fala.
 *
 * As frases vêm dos schemas de `@streamz/shared` e da API, sempre em pt-BR e
 * sempre nomeando o campo ("O usuário aceita apenas…", "A senha precisa…") — é
 * mais barato ler a frase do que fazer o contrato devolver o campo. Sem
 * palavra-chave, o erro fica no primeiro campo, que é onde o olho já está.
 */
function campoDoErro(mensagem: string): Campo {
  const texto = mensagem.toLowerCase();
  if (texto.includes("senha")) return "password";
  if (texto.includes("usuário") || texto.includes("usuario")) return "username";
  return "email";
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // h-moderacao: quem chegou por um link de convite volta para ele depois de
  // criar a conta. Só caminho interno — `next` não redireciona para fora.
  const proximo = searchParams.get("next");
  const destino = proximo?.startsWith("/") && !proximo.startsWith("//") ? proximo : "/app";
  const setSession = useAuth((s) => s.setSession);
  const setUser = useAuth((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const campo = error ? campoDoErro(error) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const dados = {
      email: email.trim(),
      username: username.trim(),
      password,
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
      const apelido = displayName.trim();
      if (apelido) {
        // o registro não recebe nome de exibição (`contaRegistroSchema` só tem
        // e-mail, usuário e senha): aplicamos logo depois, já com sessão em pé
        try {
          setUser(await api.updateProfile({ displayName: apelido }));
        } catch {
          ui.toast(
            "Conta criada, mas o nome de exibição não foi salvo. Ajuste em Configurações.",
            "error",
          );
        }
      }
      // sem etapa de confirmação: o registro não envia e-mail
      router.replace(destino);
    } catch (err) {
      setError(mensagemDeAuth(err, "registro"));
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Criar uma conta">
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel
          htmlFor="email"
          invalid={campo === "email"}
          hint={campo === "email" ? error! : undefined}
        >
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
          aria-invalid={campo === "email" ? true : undefined}
          className={inputClass}
          autoFocus
        />

        <OptionalFieldLabel htmlFor="displayName">Nome de exibição</OptionalFieldLabel>
        <input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={loading}
          maxLength={MAX_DISPLAY_NAME}
          aria-describedby="dica-exibicao"
          className={`${inputClass} mb-2`}
        />
        <p id="dica-exibicao" className="mb-5 text-xs text-txt-muted">
          É como as pessoas vão te ver. Sem isso, mostramos o seu nome de usuário.
        </p>

        <FieldLabel
          htmlFor="username"
          invalid={campo === "username"}
          hint={campo === "username" ? error! : undefined}
        >
          Nome de usuário
        </FieldLabel>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          aria-invalid={campo === "username" ? true : undefined}
          aria-describedby="dica-usuario"
          className={`${inputClass} mb-2`}
        />
        <p id="dica-usuario" className="mb-5 text-xs text-txt-muted">
          3 a 32 caracteres — letras, números, _ . e -
        </p>

        <FieldLabel
          htmlFor="password"
          invalid={campo === "password"}
          hint={campo === "password" ? error! : undefined}
        >
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
          aria-invalid={campo === "password" ? true : undefined}
          aria-describedby="dica-senha"
          className={`${inputClass} mb-2`}
        />
        <p id="dica-senha" className="mb-5 text-xs text-txt-muted">
          Ao menos 6 caracteres.
        </p>

        {/* aria-live: leitores de tela anunciam o erro sem mover o foco. O texto
            visível já está no rótulo do campo que o erro cita. */}
        <p role="alert" aria-live="polite" className="sr-only">
          {error}
        </p>

        {/* a saída para quem já tem conta vem antes do bloco legal: o botão de
            criar a conta é o último elemento do formulário */}
        <p className="mb-5 text-sm">
          <Link
            href={destino === "/app" ? "/login" : `/login?next=${encodeURIComponent(destino)}`}
            className={linkClass}
          >
            Já tem uma conta?
          </Link>
        </p>

        <p className="mb-4 text-xs leading-4 text-txt-muted">
          Ao se registrar, você concorda com os{" "}
          <span className="font-medium text-txt-normal">Termos de Serviço</span> e com a{" "}
          <span className="font-medium text-txt-normal">Política de Privacidade</span> do Streamz.
        </p>

        <button type="submit" disabled={loading} className={submitClass}>
          {loading ? "Criando…" : "Continuar"}
        </button>
      </form>
    </AuthCard>
  );
}
