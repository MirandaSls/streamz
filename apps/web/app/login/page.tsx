"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { exigeMfa } from "@streamz/shared";
import AuthCard, { linkClass } from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth, validarLogin } from "@/lib/auth-mensagens";
import { Button, Campo, TextInput } from "@/components/ui/primitivos";
import { useAuth } from "@/stores/auth";

/**
 * Login em dois passos: credenciais e, quando a conta tem 2FA, o código.
 *
 * O `ticket` que sustenta o segundo passo mora só no estado desta tela — é de
 * curta duração e não autentica nada sozinho, então não vai para o storage.
 *
 * Rótulos e erro (cartão textinput-e-telas-de-auth): os três campos saíram do
 * `FieldLabel` da `AuthCard` para `Campo`. O `FieldLabel` escrevia o erro
 * *dentro* do rótulo (" - mensagem", no lugar do asterisco) e pintava o rótulo
 * de vermelho. No Discord o rótulo continua `--text-strong` com o asterisco, e
 * o erro fica abaixo do controle com ícone de alerta de 16 e 12px normal —
 * é justamente esta tela no print `publico/desktop/04-esqueci-senha-erro-SIMULADO-viewport.png`
 * ("Este campo é obrigatório" sob "E-mail ou número de telefone"), por isso
 * `estiloDoErro="ajuda"`. A mensagem vai só sob o primeiro campo, como lá; a
 * senha ganha só a borda de erro. O `<p sr-only role="alert">` que duplicava
 * o anúncio saiu: o erro do `Campo` já tem `role="alert"` embutido.
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
  // o mesmo endpoint aceita o código do app e o de recuperação: alternar aqui
  // muda só o que a tela pede, não para onde manda
  const [backup, setBackup] = useState(false);
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
      <AuthCard title="Verificação em duas etapas" subtitle="Sua conta está protegida.">
        <form onSubmit={onSubmitCodigo} noValidate>
          <Campo
            rotulo={backup ? "Código de recuperação" : "Digite o código de autenticação"}
            htmlFor="code"
            obrigatorio
            erro={error}
            estiloDoErro="ajuda"
          >
            <TextInput
              id="code"
              name="code"
              inputMode="text"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
              erro={!!error}
              aria-describedby="apoio-2fa"
              className="tracking-[0.3em]"
              autoFocus
            />
          </Campo>
          <p id="apoio-2fa" className="mb-5 mt-2 text-text-sm text-text-muted">
            {backup
              ? "Use um dos códigos que você guardou ao ligar a verificação em duas etapas. Cada um vale uma vez só."
              : "Abra o seu app autenticador e informe o código de 6 dígitos da conta do Streamz."}
          </p>

          <Button
            type="submit"
            variante="primario"
            tamanho="md"
            larguraTotal
            disabled={loading || !code.trim()}
            className="celular:h-[48px]"
          >
            {loading ? "Verificando…" : "Entrar"}
          </Button>

          <p className="mt-4 text-text-sm">
            <Button
              variante="link"
              tamanho="sm"
              onClick={() => {
                setBackup((v) => !v);
                setCode("");
                setError(null);
              }}
            >
              {backup ? "Usar o app autenticador" : "Usar código de backup"}
            </Button>
          </p>
          <p className="mt-2 text-text-sm">
            {/* sem central de ajuda: para quem perdeu o segundo fator, redefinir
                a senha é o caminho que existe hoje */}
            <Link href="/forgot-password" className={linkClass}>
              Precisa de ajuda?
            </Link>
          </p>

          <Button
            variante="link"
            tamanho="sm"
            larguraTotal
            onClick={() => {
              setTicket(null);
              setCode("");
              setBackup(false);
              setError(null);
            }}
            className="mt-4"
          >
            Voltar
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      // Título do Discord real: "Boas-vindas de volta!" (print 1:1
      // publico/desktop/01-login-viewport.png e o HTML capturado
      // 01-login.html, <h1> antes do formulário). O subtítulo já batia
      // palavra por palavra com o mesmo print.
      title="Boas-vindas de volta!"
      subtitle="Estamos muito animados em te ver novamente!"
    >
      <form onSubmit={onSubmit} noValidate>
        {/* Discord: "E-mail ou número de telefone" — divergência funcional, não
            de forma: o Streamz não tem cadastro por telefone e a API aceita
            e-mail OU usuário (`contaLoginSchema`, mensagem 401 "Usuário ou
            senha incorretos"). O rótulo segue trocando só a parte que não
            existe aqui, mantendo a medida do Discord (16px, peso 500,
            asterisco vermelho depois — `Campo`, `primitivos/TextInput.tsx`). */}
        <Campo
          rotulo="E-mail ou usuário"
          htmlFor="identificador"
          obrigatorio
          erro={error}
          estiloDoErro="ajuda"
          className="mb-5"
        >
          <TextInput
            id="identificador"
            name="identificador"
            autoComplete="username"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            disabled={loading}
            erro={!!error}
            autoFocus
          />
        </Campo>

        <Campo rotulo="Senha" htmlFor="password" obrigatorio className="mb-2">
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            erro={!!error}
          />
        </Campo>
        <p className="mb-5 text-text-sm">
          <Link href="/forgot-password" className={linkClass}>
            Esqueceu sua senha?
          </Link>
        </p>

        <Button
          type="submit"
          variante="primario"
          tamanho="md"
          larguraTotal
          disabled={loading}
          className="celular:h-[48px]"
        >
          {loading ? "Entrando…" : "Entrar"}
        </Button>

        <p className="mt-2 text-text-sm text-text-muted">
          Precisando de uma conta?{" "}
          <Link
            href={destino === "/app" ? "/register" : `/register?next=${encodeURIComponent(destino)}`}
            className={linkClass}
          >
            Registre-se
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
