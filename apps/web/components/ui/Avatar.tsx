"use client";

import type { UserStatus } from "@newdisc/shared";

/**
 * Cores dos avatares padrão do Discord: quem não tem imagem ganha uma das cinco
 * cores da marca, escolhida de forma estável a partir do id.
 */
const PALETTE = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245"];

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
