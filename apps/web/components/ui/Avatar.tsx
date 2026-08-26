"use client";

import { Users } from "lucide-react";
import type { UserStatus } from "@streamz/shared";

/**
 * Avatar sem imagem ganha uma destas cinco, escolhida de forma estável pelo id.
 * Nenhuma é verde-limão de propósito: o avatar não pode competir com o accent
 * da marca nem ser confundido com a bolinha de status (ADR-0004). As cinco têm
 * luminância parecida, para as iniciais em Paper lerem igual em todas.
 */
const PALETTE = ["#4c7ef3", "#0e9f8a", "#c2701c", "#d24a7b", "#7c5cf0"];

export const STATUS_COLOR: Record<UserStatus, string> = {
  ONLINE: "bg-green",
  IDLE: "bg-yellow",
  DND: "bg-red",
  OFFLINE: "bg-txt-faint",
};

export const STATUS_LABEL: Record<UserStatus, string> = {
  ONLINE: "Online",
  IDLE: "Ausente",
  DND: "Não perturbe",
  OFFLINE: "Offline",
};

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const SIZE = {
  sm: { box: "h-6 w-6 text-[10px]", dot: "h-2.5 w-2.5 -bottom-0.5 -right-0.5 border-2" },
  md: { box: "h-8 w-8 text-xs", dot: "h-3.5 w-3.5 -bottom-0.5 -right-0.5 border-[3px]" },
  lg: { box: "h-10 w-10 text-sm", dot: "h-4 w-4 -bottom-0.5 -right-0.5 border-[3px]" },
  xl: { box: "h-20 w-20 text-2xl", dot: "h-7 w-7 bottom-0 right-0 border-[5px]" },
} as const;

/**
 * Avatar circular com iniciais (o MVP não tem upload de foto) e, opcionalmente,
 * a bolinha de status com a borda na cor da superfície de fundo — é a borda que
 * faz a bolinha parecer "recortada" do avatar, como no Discord.
 */
export default function Avatar({
  user,
  size = "md",
  status,
  surface = "border-panel",
  className = "",
}: {
  user: { id: string; username: string; avatarUrl?: string | null };
  size?: keyof typeof SIZE;
  status?: UserStatus;
  /** classe de cor da borda da bolinha = cor do fundo onde o avatar está. */
  surface?: string;
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <span className={`relative inline-block shrink-0 ${className}`}>
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          className={`${s.box} rounded-full object-cover`}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{ backgroundColor: hashColor(user.id) }}
          className={`${s.box} grid place-items-center rounded-full font-semibold text-white`}
        >
          {user.username.slice(0, 2).toUpperCase()}
        </span>
      )}
      {status && (
        <span
          aria-label={STATUS_LABEL[status]}
          title={STATUS_LABEL[status]}
          className={`absolute rounded-full ${surface} ${s.dot} ${STATUS_COLOR[status]}`}
        />
      )}
    </span>
  );
}

// ── d-social ──

const GROUP_SIZE = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-20 w-20",
} as const;

const GROUP_ICON = { sm: 14, md: 18, lg: 22, xl: 36 } as const;

/**
 * Avatar de um grupo de DM: o ícone enviado, ou o círculo blurple com as
 * silhuetas quando não há ícone. Existe para que a coluna de conversas, o
 * cabeçalho e a lista de participantes desenhem o grupo do mesmo jeito.
 */
export function GroupAvatar({
  iconUrl,
  size = "md",
  className = "",
}: {
  iconUrl: string | null;
  size?: keyof typeof GROUP_SIZE;
  className?: string;
}) {
  const box = GROUP_SIZE[size];
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" className={`${box} shrink-0 rounded-full object-cover ${className}`} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} grid shrink-0 place-items-center rounded-full bg-accent text-accent-ink ${className}`}
    >
      <Users size={GROUP_ICON[size]} />
    </span>
  );
}
