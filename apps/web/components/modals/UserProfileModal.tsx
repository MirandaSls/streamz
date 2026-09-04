"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MessageSquare, MoreHorizontal, UserPlus } from "@/components/ui/icones";
import {
  customStatusOf,
  displayNameOf,
  type MemberRole,
  type UserProfile,
} from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useGuilds } from "@/stores/guilds";
import { resolveStatus, usePresence } from "@/stores/presence";
import { errorMessage } from "@/stores/socket-adapter";
import { anchorOf, ui, useUI, type MenuItem } from "@/stores/ui";

const PAPEL: Record<MemberRole, string> = {
  OWNER: "Dono do servidor",
  ADMIN: "Administrador",
  MEMBER: "Membro",
};

type Aba = "sobre" | "servidores" | "amigos";

/** "25 de agosto de 2026" — a data dos selos "membro desde". */
const DATA_SELO = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Perfil completo — o "ver perfil" do Discord.
 *
 * O cartão não tem título escrito: começa no banner, com as ações sobrepostas à
 * faixa e o resto do conteúdo em **abas** (Sobre mim, Servidores mútuos, Amigos
 * mútuos). Empilhar tudo numa coluna só, como antes, fazia o cartão crescer sem
 * fim e enterrava os botões no fim da rolagem.
 *
 * Os "em comum" e a relação são calculados pelo servidor por espectador
 * (`GET /users/:id/profile`), por isso o modal busca em vez de ler das stores.
 */
export default function UserProfileModal({
  userId,
  guildId,
}: {
  userId: string;
  guildId?: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  const me = useAuth((s) => s.user);
  const statuses = usePresence((s) => s.statuses);
  const openWith = useDMs((s) => s.openWith);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const send = useFriends((s) => s.send);
  const remove = useFriends((s) => s.remove);
  const block = useFriends((s) => s.block);
  const unblock = useFriends((s) => s.unblock);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("sobre");

  useEffect(() => {
    let vivo = true;
    api
      .profile(userId, guildId)
      .then((p) => vivo && setProfile(p))
      .catch((e) => vivo && setErro(errorMessage(e, "Não foi possível carregar o perfil")));
    return () => {
      vivo = false;
    };
  }, [userId, guildId]);

  if (!profile) return <Esqueleto erro={erro} onClose={closeModal} />;

  const user = profile.user;
  const status = resolveStatus(statuses, user);
  const nome = displayNameOf(user);
  const personalizado = customStatusOf(user);
  const euMesmo = profile.relationship === "self" || user.id === me?.id;

  function abrirMenu(alvo: HTMLElement) {
    if (!profile) return;
    const itens: MenuItem[] = [];
    if (profile.relationship === "friend") {
      itens.push({ label: "Remover amigo", danger: true, onSelect: () => void remove(user) });
    }
    itens.push(
      profile.relationship === "blocked"
        ? { label: "Desbloquear", onSelect: () => void unblock(user.id) }
        : { label: "Bloquear", danger: true, onSelect: () => void block(user) },
    );
    const r = anchorOf(alvo);
    ui.openContextMenu(r.x, r.y + r.height + 4, itens);
  }

  const abas: { id: Aba; label: string }[] = [
    { id: "sobre", label: "Sobre mim" },
    { id: "servidores", label: `Servidores mútuos — ${profile.mutualGuilds.length}` },
    { id: "amigos", label: `Amigos mútuos — ${profile.mutualFriends.length}` },
  ];

  return (
    <Dialog
      title={`Perfil de ${nome}`}
      hideHeader
      semPadding
      showClose={false}
      onClose={closeModal}
      className="w-[600px]"
    >
      <div>
        <div className="relative">
          {profile.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.bannerUrl} alt="" className="h-[120px] w-full object-cover" />
          ) : (
            <div
              className="h-[120px] w-full"
              style={{ backgroundColor: profile.bannerColor ?? "#9be31f" }}
            />
          )}

          {/* ações sobre a faixa do banner, como no Discord — não no fim do cartão */}
          <div className="absolute right-4 top-4 flex items-center gap-2">
            {!euMesmo && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    closeModal();
                    void openWith(user.id);
                  }}
                  className="flex h-8 items-center gap-2 rounded-[3px] bg-accent px-3 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
                >
                  <MessageSquare size={16} aria-hidden="true" />
                  Enviar mensagem
                </button>
                {profile.relationship === "none" && (
                  <button
                    type="button"
                    onClick={() => void send(user.username)}
                    className="flex h-8 items-center gap-2 rounded-[3px] bg-panel px-3 text-sm font-medium text-txt-normal transition hover:bg-hov"
                  >
                    <UserPlus size={16} aria-hidden="true" />
                    Adicionar amigo
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => abrirMenu(e.currentTarget)}
                  aria-label="Mais opções"
                  aria-haspopup="menu"
                  className="grid h-8 w-8 place-items-center rounded-[3px] bg-panel text-txt-normal transition hover:bg-hov"
                >
                  <MoreHorizontal size={18} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="-mt-12 mb-3 w-fit rounded-full border-[6px] border-chat">
            <Avatar user={user} size="xl" status={status} surface="border-chat" />
          </div>

          <div className="rounded-lg bg-footer p-4">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-xl font-bold text-txt-primary">{nome}</span>
              {profile.pronouns && (
                <span className="truncate text-sm text-txt-muted">{profile.pronouns}</span>
              )}
            </div>
            <div className="truncate text-sm text-txt-normal">@{user.username}</div>
            {personalizado && <div className="mt-1 text-sm text-txt-normal">{personalizado}</div>}

            <div
              role="tablist"
              aria-label="Seções do perfil"
              className="mt-3 flex gap-4 border-b border-border"
            >
              {abas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={aba === a.id}
                  onClick={() => setAba(a.id)}
                  className={`-mb-px border-b-2 pb-2 text-sm font-medium transition ${
                    aba === a.id
                      ? "border-accent text-txt-primary"
                      : "border-transparent text-txt-muted hover:text-txt-normal"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div className="mt-3 max-h-[280px] overflow-y-auto text-sm text-txt-normal">
              {aba === "sobre" && (
                <>
                  {profile.aboutMe ? (
                    <p className="whitespace-pre-wrap break-words">{profile.aboutMe}</p>
                  ) : (
                    <p className="text-txt-muted">Esta pessoa ainda não escreveu nada por aqui.</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Selo
                      titulo="Membro do Streamz desde"
                      valor={DATA_SELO.format(new Date(profile.createdAt))}
                    />
                    {guild && profile.guildRole && (
                      <Selo titulo={`Em ${guild.name}`} valor={PAPEL[profile.guildRole]} />
                    )}
                  </div>
                </>
              )}

              {aba === "servidores" &&
                (profile.mutualGuilds.length === 0 ? (
                  <p className="text-txt-muted">Nenhum servidor em comum.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {profile.mutualGuilds.map((g) => (
                      <li key={g.id} className="flex items-center gap-2 rounded px-1 py-1">
                        {g.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={g.iconUrl}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-void text-[10px] font-semibold text-txt-primary">
                            {g.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate">{g.name}</span>
                      </li>
                    ))}
                  </ul>
                ))}

              {aba === "amigos" &&
                (profile.mutualFriends.length === 0 ? (
                  <p className="text-txt-muted">Nenhum amigo em comum.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {profile.mutualFriends.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={(e) => ui.openProfile(f, anchorOf(e.currentTarget))}
                          className="flex w-full items-center gap-2 rounded px-1 py-1 hover:bg-hov"
                        >
                          <Avatar user={f} size="sm" surface="border-footer" />
                          <span className="truncate">{displayNameOf(f)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Selo com ícone de calendário: "Membro do Streamz desde 25 de agosto de 2026". */
function Selo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[4px] bg-chat px-2.5 py-1.5">
      <CalendarDays size={16} aria-hidden="true" className="shrink-0 text-txt-muted" />
      <div className="min-w-0">
        <div className="truncate text-[11px] font-bold uppercase tracking-[0.02em] text-txt-muted">
          {titulo}
        </div>
        <div className="truncate text-xs text-txt-normal">{valor}</div>
      </div>
    </div>
  );
}

/**
 * Esqueleto do próprio cartão enquanto o perfil carrega (e quando ele falha).
 *
 * Trocar o cartão por uma caixinha com "Carregando…" fazia o modal mudar de
 * tamanho e de forma no meio do caminho — o Discord mantém a moldura e preenche.
 */
function Esqueleto({ erro, onClose }: { erro: string | null; onClose: () => void }) {
  return (
    <Dialog title="Perfil" hideHeader semPadding onClose={onClose} className="w-[600px]">
      <div>
        <div className="h-[120px] w-full animate-pulse bg-panel" />
        <div className="px-4 pb-4">
          <div className="-mt-12 mb-3 w-fit rounded-full border-[6px] border-chat">
            <span className="block h-20 w-20 animate-pulse rounded-full bg-panel" />
          </div>
          <div className="rounded-lg bg-footer p-4">
            {erro ? (
              <p className="text-sm text-txt-muted">{erro}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="h-5 w-40 animate-pulse rounded bg-panel" />
                <span className="h-4 w-24 animate-pulse rounded bg-panel" />
                <span className="mt-3 h-3 w-full animate-pulse rounded bg-panel" />
                <span className="h-3 w-2/3 animate-pulse rounded bg-panel" />
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
