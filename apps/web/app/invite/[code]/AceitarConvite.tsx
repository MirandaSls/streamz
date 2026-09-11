"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Hash } from "@/components/ui/icones";
import { displayNameOf, type InviteFullPreview } from "@streamz/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { errorMessage } from "@/stores/socket-adapter";

/** Iniciais do nome, como o rail faz com servidor sem ícone. */
function acronimo(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

/**
 * Página pública do convite (`/invite/:code`).
 *
 * Abre **sem login**: mostra a prévia do servidor e, se o visitante não estiver
 * autenticado, manda para `/login?next=/invite/:code` — que volta para cá
 * depois de entrar. É o fluxo do Discord, e é o que faz um link de convite
 * colado em qualquer lugar funcionar para quem ainda nem tem conta.
 */
export default function AceitarConvite() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;
  const user = useAuth((s) => s.user);
  const loadFromStorage = useAuth((s) => s.loadFromStorage);

  const [preview, setPreview] = useState<InviteFullPreview | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => loadFromStorage(), [loadFromStorage]);

  useEffect(() => {
    if (!code) return;
    let ativo = true;
    void api
      .previewInvite(code)
      .then((p) => ativo && setPreview(p))
      .catch((e) => ativo && setErro(errorMessage(e, "Convite inválido")));
    return () => {
      ativo = false;
    };
    // a prévia muda com a sessão: logado, ela também diz se já sou membro
  }, [code, user?.id]);

  async function aceitar() {
    if (!preview || entrando) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);
      return;
    }
    if (preview.member) {
      router.replace("/app");
      return;
    }
    setEntrando(true);
    try {
      await api.redeemInvite(code);
      router.replace("/app");
    } catch (e) {
      setErro(errorMessage(e, "Não foi possível entrar no servidor"));
      setEntrando(false);
    }
  }

  const invalido = erro !== null || (preview !== null && !preview.valid);
  const recado = erro ?? preview?.reason ?? "Este convite não vale mais.";

  return (
    /* `min-h-[100dvh]` e não `min-h-screen`: no celular `100vh` é a janela
       **sem** a barra de endereço, e o cartão nascia empurrado para baixo dela.
       As áreas seguras entram no padding para o cartão não encostar no entalhe
       nem na barra de gestos. */
    <main className="grid min-h-[100dvh] place-items-center bg-input-background-default bg-[radial-gradient(ellipse_at_top_left,rgba(155,227,31,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(155,227,31,0.05),transparent_60%)] p-4 celular:px-[max(1rem,env(safe-area-inset-left))] celular:pb-[max(1rem,env(safe-area-inset-bottom))] celular:pt-[max(1rem,env(safe-area-inset-top))]">
      {/*
        `w-full max-w-[420px]`, e não `w-[420px] max-w-full`: com `justify-items:
        center` o item da grade é dimensionado pelo conteúdo, e o `max-width:
        100%` passa a valer sobre a *área* da grade — que a largura fixa de 420
        já havia esticado. Medido em 390×844: a página rolava 436px na
        horizontal e o botão "Entrar para aceitar o convite" saía pela direita.
      */}
      <div className="w-full max-w-[420px] rounded-[5px] bg-background-base-lower p-8 text-center shadow-popout celular:p-6">
        {preview === null && !erro && <p className="text-text-muted">Carregando convite…</p>}

        {(preview || erro) && (
          <>
            <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-3xl bg-input-background-default text-xl font-semibold text-text-strong">
              {preview?.guild.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.guild.iconUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                acronimo(preview?.guild.name ?? "?")
              )}
            </div>

            <p className="mt-4 text-sm text-text-muted">
              {preview?.inviter
                ? `${displayNameOf(preview.inviter)} convidou você para`
                : "Você foi convidado para"}
            </p>
            <h1 className="mt-1 font-headline text-2xl font-extrabold text-text-strong">
              {preview?.guild.name ?? "Servidor"}
            </h1>

            {preview?.description && (
              <p className="mt-2 break-words text-sm text-text-muted">{preview.description}</p>
            )}

            {preview && (
              <p className="mt-3 flex items-center justify-center gap-4 text-sm text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-status-positive" />
                  {preview.onlineCount} online
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-channels-default" />
                  {preview.memberCount} membros
                </span>
              </p>
            )}

            {preview?.channelName && (
              <p className="mt-2 flex items-center justify-center gap-1 text-sm text-text-muted">
                <Hash size={14} aria-hidden="true" />
                {preview.channelName}
              </p>
            )}

            {invalido ? (
              <>
                <p role="alert" className="mt-5 text-sm text-status-danger">
                  {recado}
                </p>
                <button
                  type="button"
                  onClick={() => router.replace(user ? "/app" : "/login")}
                  className="mt-5 h-11 w-full rounded-[3px] bg-border-normal font-medium text-white transition hover:bg-border-strong celular:h-[48px]"
                >
                  {user ? "Voltar para o app" : "Ir para o login"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={entrando}
                onClick={() => void aceitar()}
                className="mt-6 h-11 w-full rounded-[3px] bg-brand-500 font-medium text-control-primary-text-default transition hover:bg-control-primary-background-hover disabled:opacity-60 celular:h-[48px]"
                autoFocus
              >
                {preview?.member
                  ? "Você já é membro — abrir servidor"
                  : entrando
                    ? "Entrando…"
                    : user
                      ? "Aceitar convite"
                      : "Entrar para aceitar o convite"}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
