"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Hash } from "lucide-react";
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
export default function InvitePage() {
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
    <main className="grid min-h-screen place-items-center bg-accent bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(0,0,0,0.25),transparent_60%)] p-4">
      <div className="w-[420px] max-w-full rounded-[5px] bg-chat p-8 text-center shadow-high">
        {preview === null && !erro && <p className="text-txt-muted">Carregando convite…</p>}

        {(preview || erro) && (
          <>
            <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-3xl bg-rail text-xl font-semibold text-txt-primary">
              {preview?.guild.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.guild.iconUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                acronimo(preview?.guild.name ?? "?")
              )}
            </div>

            <p className="mt-4 text-sm text-txt-muted">
              {preview?.inviter
                ? `${displayNameOf(preview.inviter)} convidou você para`
                : "Você foi convidado para"}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-txt-primary">
              {preview?.guild.name ?? "Servidor"}
            </h1>

            {preview?.description && (
              <p className="mt-2 break-words text-sm text-txt-muted">{preview.description}</p>
            )}

            {preview && (
              <p className="mt-3 flex items-center justify-center gap-4 text-sm text-txt-muted">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-green" />
                  {preview.onlineCount} online
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-txt-faint" />
                  {preview.memberCount} membros
                </span>
              </p>
            )}

            {preview?.channelName && (
              <p className="mt-2 flex items-center justify-center gap-1 text-sm text-txt-muted">
                <Hash size={14} aria-hidden="true" />
                {preview.channelName}
              </p>
            )}

            {invalido ? (
              <>
                <p role="alert" className="mt-5 text-sm text-red">
                  {recado}
                </p>
                <button
                  type="button"
                  onClick={() => router.replace(user ? "/app" : "/login")}
                  className="mt-5 h-11 w-full rounded-[3px] bg-[#4e5058] font-medium text-white transition hover:bg-[#6d6f78]"
                >
                  {user ? "Voltar para o app" : "Ir para o login"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={entrando}
                onClick={() => void aceitar()}
                className="mt-6 h-11 w-full rounded-[3px] bg-accent font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
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
