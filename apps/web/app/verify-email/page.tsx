"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthCard, { linkClass } from "@/components/auth/AuthCard";
import { api } from "@/lib/api";
import { mensagemDeAuth } from "@/lib/auth-mensagens";
import { lerAccessToken } from "@/lib/session";
import { Button, Campo, TextInput } from "@/components/ui/primitivos";

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
 *
 * **Sem tela equivalente no Discord** (cartão 7m-senha-e-verificacao): a
 * verificação de e-mail dele é um banner dentro do app autenticado, não uma
 * rota pública própria — não há print 1:1 nem CSS bruto desta tela para medir
 * contra (§7 da ADR-0009: sem as três fontes, o número que fica é o que já
 * tínhamos, não um chute). O redesenho aqui é usar os primitivos certos, no
 * padrão que as telas medidas do mesmo cartão (`/forgot-password`,
 * `/reset-password`) já fixaram, para as quatro fases não divergirem entre
 * si por terem sido escritas em momentos diferentes:
 * - Campo de e-mail: `FieldLabel` (erro dentro do rótulo) → `Campo`
 *   (obrigatório, erro abaixo do controle com `role="alert"` embutido) — a
 *   mesma troca do cartão em `/forgot-password`, pelo mesmo motivo.
 * - Botão "Reenviar…": texto fixo + `carregando` no lugar de trocar para
 *   "Enviando…" — usa o carregamento do `Button` (três pontos,
 *   `.spinnerItem_a22cb0`, cabeçalho de `primitivos/Button.tsx`) em vez de
 *   reimplementar com texto.
 * - "Ir para o app" (fase `ok`): `<Link className={submitClass}>` → `<Button
 *   href>`, que já desenha `<a>` com o visual do botão (rodada c1-button).
 * - Links de apoio: `linkClass` de `AuthCard`, como as outras duas telas do
 *   cartão.
 * - **Não mudou** (fora do que este cartão pede): a fase `verificando` só
 *   tem texto, sem spinner — não existe um primitivo de spinner de página no
 *   projeto (`components/ui/icones.tsx` não tem um, e criar um sairia da
 *   lista de arquivos deste cartão); ver "não_verificado".
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
        <Button href="/app" variante="primario" tamanho="md" larguraTotal className="celular:h-[48px]">
          Ir para o app
        </Button>
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
      <p className="mt-4 text-center text-text-sm">
        <Link href="/app" className={linkClass}>
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
        <Campo rotulo="E-mail da conta" htmlFor="email" obrigatorio estiloDoErro="ajuda" className="mb-5">
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={enviando}
          />
        </Campo>
      )}

      {aviso && (
        <p role="status" aria-live="polite" className="mb-3 text-text-sm text-text-muted">
          {aviso}
        </p>
      )}

      <Button
        type="submit"
        variante="primario"
        tamanho="md"
        larguraTotal
        disabled={!autenticado && !email.trim()}
        carregando={enviando}
        className="celular:h-[48px]"
      >
        Reenviar link de confirmação
      </Button>
    </form>
  );
}
