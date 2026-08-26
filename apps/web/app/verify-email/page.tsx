"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthCard, { FieldLabel, inputClass, submitClass } from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth } from "@/lib/auth-mensagens";
import { lerAccessToken } from "@/lib/session";

type Estado =
  | { fase: "aguardando" }
  | { fase: "verificando" }
  | { fase: "ok"; email: string; jaEstava: boolean }
  | { fase: "erro"; mensagem: string };

/**
 * Uma tela para os dois momentos da verificação de e-mail:
 *
 * - **sem `?token=`** — logo depois do registro: "confira sua caixa de entrada",
 *   com o botão de reenviar.
 * - **com `?token=`** — o clique no link do e-mail: confirma e diz o resultado.
 *
 * O token é lido de `window.location` em vez de `useSearchParams` porque a web
 * também é exportada como HTML estático para o desktop, e ali o hook exigiria
 * uma fronteira de Suspense só para ler uma query string.
 */
export default function VerifyEmailPage() {
  const [estado, setEstado] = useState<Estado>({ fase: "aguardando" });
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const autenticado = typeof window !== "undefined" && !!lerAccessToken();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    setEstado({ fase: "verificando" });
    api
      .verifyEmail(token)
      .then((r) => setEstado({ fase: "ok", email: r.email, jaEstava: r.alreadyVerified }))
      .catch((e) => setEstado({ fase: "erro", mensagem: mensagemDeAuth(e, "conta") }));
  }, []);

  const reenviar = useCallback(async () => {
    if (enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      if (autenticado) await api.resendMyVerification();
      else await api.resendVerification(email.trim());
      setAviso("Se houver uma conta com esse e-mail, o link acabou de sair.");
    } catch (e) {
      setAviso(mensagemDeAuth(e, "conta"));
    } finally {
      setEnviando(false);
    }
  }, [autenticado, email, enviando]);

  if (estado.fase === "verificando") {
    return <AuthCard title="Confirmando seu e-mail…" subtitle="Só um instante." />;
  }

  if (estado.fase === "ok") {
    return (
      <AuthCard
        title={estado.jaEstava ? "Este e-mail já estava confirmado" : "E-mail confirmado!"}
        subtitle={estado.email}
      >
        <Link href="/app" className={`${submitClass} grid place-items-center`}>
          Ir para o app
        </Link>
      </AuthCard>
    );
  }

  if (estado.fase === "erro") {
    return (
      <AuthCard title="Não deu para confirmar" subtitle={estado.mensagem}>
        <PedirNovoLink
          autenticado={autenticado}
          email={email}
          setEmail={setEmail}
          enviando={enviando}
          reenviar={reenviar}
          aviso={aviso}
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Confira seu e-mail"
      subtitle="Mandamos um link de confirmação. Ele vale por 24 horas."
    >
      <PedirNovoLink
        autenticado={autenticado}
        email={email}
        setEmail={setEmail}
        enviando={enviando}
        reenviar={reenviar}
        aviso={aviso}
      />
      <p className="mt-4 text-center text-sm">
        <Link href="/app" className="font-medium text-txt-link hover:underline">
          Continuar sem confirmar agora
        </Link>
      </p>
    </AuthCard>
  );
}

function PedirNovoLink({
  autenticado,
  email,
  setEmail,
  enviando,
  reenviar,
  aviso,
}: {
  autenticado: boolean;
  email: string;
  setEmail: (v: string) => void;
  enviando: boolean;
  reenviar: () => void;
  aviso: string | null;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        reenviar();
      }}
      noValidate
    >
      {!autenticado && (
        <>
          <FieldLabel htmlFor="email">E-mail da conta</FieldLabel>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={enviando}
            className={inputClass}
          />
        </>
      )}

      {aviso && (
        <p role="status" aria-live="polite" className="mb-3 text-sm text-txt-muted">
          {aviso}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando || (!autenticado && !email.trim())}
        className={submitClass}
      >
        {enviando ? "Enviando…" : "Reenviar link de confirmação"}
      </button>
    </form>
  );
}
