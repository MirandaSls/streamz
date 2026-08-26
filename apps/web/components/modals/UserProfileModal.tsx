"use client";

import { useEffect, useState } from "react";
import { MessageSquare, UserMinus, UserPlus, UserX } from "lucide-react";
import {
  customStatusOf,
  displayNameOf,
  type MemberRole,
  type UserProfile,
} from "@streamz/shared";
import Dialog from "@/components/modals/Dialog";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { horaCompleta } from "@/lib/format";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { resolveStatus, usePresence } from "@/stores/presence";
import { errorMessage } from "@/stores/socket-adapter";
import { anchorOf, ui, useUI } from "@/stores/ui";

const PAPEL: Record<MemberRole, string> = {
  OWNER: "Dono do servidor",
  ADMIN: "Administrador",
  MEMBER: "Membro",
};

/** Bloco de título + conteúdo do cartão (Sobre mim, Membro desde, …). */
function Bloco({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.02em] text-txt-primary">{label}</h3>
      <div className="text-sm text-txt-normal">{children}</div>
    </div>
  );
}

/**
 * Perfil completo — o "ver perfil" do Discord: banner, avatar grande, nome,
 * @usuário, pronomes, status personalizado, "Sobre mim", "Membro desde",
 * amigos e servidores em comum.
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
  const send = useFriends((s) => s.send);
  const remove = useFriends((s) => s.remove);
  const block = useFriends((s) => s.block);
  const unblock = useFriends((s) => s.unblock);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [erro, setErro] = useState<string | null>(null);

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

  if (erro) {
    return (
      <Dialog title="Perfil" onClose={closeModal} className="w-[600px]">
        <p className="text-sm text-txt-muted">{erro}</p>
      </Dialog>
    );
  }
  if (!profile) {
    return (
      <Dialog title="Perfil" onClose={closeModal} className="w-[600px]">
        <p className="text-sm text-txt-muted">Carregando…</p>
      </Dialog>
    );
  }

  const user = profile.user;
  const status = resolveStatus(statuses, user);
  const nome = displayNameOf(user);
  const personalizado = customStatusOf(user);
  const euMesmo = profile.relationship === "self" || user.id === me?.id;

  function acoes() {
    if (euMesmo || !profile) return null;
    const botoes: React.ReactNode[] = [
      <button
        key="msg"
        type="button"
        onClick={() => {
          closeModal();
          void openWith(user.id);
        }}
        className="flex h-9 items-center gap-2 rounded-[3px] bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-hover"
      >
        <MessageSquare size={16} aria-hidden="true" />
        Enviar mensagem
      </button>,
    ];
    if (profile.relationship === "none") {
      botoes.push(
        <button
          key="add"
          type="button"
          onClick={() => void send(user.username)}
          className="flex h-9 items-center gap-2 rounded-[3px] bg-[#4e5058] px-4 text-sm font-medium text-txt-normal transition hover:bg-[#6d6f78]"
        >
          <UserPlus size={16} aria-hidden="true" />
          Adicionar amigo
        </button>,
      );
    }
    if (profile.relationship === "friend") {
      botoes.push(
        <button
          key="rm"
          type="button"
          onClick={() => void remove(user)}
          className="flex h-9 items-center gap-2 rounded-[3px] bg-[#4e5058] px-4 text-sm font-medium text-txt-normal transition hover:bg-red hover:text-white"
        >
          <UserMinus size={16} aria-hidden="true" />
          Remover amigo
        </button>,
      );
    }
    botoes.push(
      profile.relationship === "blocked" ? (
        <button
          key="unblock"
          type="button"
          onClick={() => void unblock(user.id)}
          className="flex h-9 items-center gap-2 rounded-[3px] bg-[#4e5058] px-4 text-sm font-medium text-txt-normal transition hover:bg-[#6d6f78]"
        >
          <UserX size={16} aria-hidden="true" />
          Desbloquear
        </button>
      ) : (
        <button
          key="block"
          type="button"
          onClick={() => void block(user)}
          className="flex h-9 items-center gap-2 rounded-[3px] px-4 text-sm font-medium text-red transition hover:bg-red hover:text-white"
        >
          <UserX size={16} aria-hidden="true" />
          Bloquear
        </button>
      ),
    );
    return <div className="mt-4 flex flex-wrap gap-2">{botoes}</div>;
  }

  return (
    <Dialog title={`Perfil de ${nome}`} onClose={closeModal} className="w-[600px]">
      <div className="-mx-4 -mt-2 overflow-hidden">
        {profile.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.bannerUrl} alt="" className="h-[120px] w-full object-cover" />
        ) : (
          <div className="h-[120px] w-full" style={{ backgroundColor: profile.bannerColor ?? "#5865f2" }} />
        )}

        <div className="px-4">
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

            <div className="mt-3 border-t border-[#3f4147] pt-1" />

            <Bloco label="Status">
              {STATUS_LABEL[status]}
              {status === "OFFLINE" && profile.lastSeenAt && (
                <span className="text-txt-muted"> · visto por último {horaCompleta(profile.lastSeenAt)}</span>
              )}
            </Bloco>

            {profile.aboutMe && (
              <Bloco label="Sobre mim">
                <p className="whitespace-pre-wrap break-words">{profile.aboutMe}</p>
              </Bloco>
            )}

            <Bloco label="Membro desde">{horaCompleta(profile.createdAt)}</Bloco>

            {profile.guildRole && <Bloco label="Cargo neste servidor">{PAPEL[profile.guildRole]}</Bloco>}

            <Bloco label={`Amigos em comum — ${profile.mutualFriends.length}`}>
              {profile.mutualFriends.length === 0 ? (
                <span className="text-txt-muted">Nenhum amigo em comum.</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {profile.mutualFriends.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={(e) => ui.openProfile(f, anchorOf(e.currentTarget))}
                        className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-hov"
                      >
                        <Avatar user={f} size="sm" surface="border-footer" />
                        <span className="truncate">{displayNameOf(f)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>

            <Bloco label={`Servidores em comum — ${profile.mutualGuilds.length}`}>
              {profile.mutualGuilds.length === 0 ? (
                <span className="text-txt-muted">Nenhum servidor em comum.</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {profile.mutualGuilds.map((g) => (
                    <li key={g.id} className="flex items-center gap-2 px-1 py-0.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rail text-[10px] font-semibold text-txt-primary">
                        {g.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate">{g.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>

            {acoes()}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
