"use client";

import { useId } from "react";
import { Users } from "lucide-react";
import type { UserStatus } from "@streamz/shared";
import { corDoAvatar } from "@/components/ui/avatar-cores";

/** Cor de fundo do status — mantida para quem desenha a bolinha à mão. */
export const STATUS_COLOR: Record<UserStatus, string> = {
  ONLINE: "bg-green",
  IDLE: "bg-yellow",
  DND: "bg-red",
  OFFLINE: "bg-txt-faint",
};

/** Cor do traço do status (a forma é desenhada em `currentColor`). */
const STATUS_INK: Record<UserStatus, string> = {
  ONLINE: "text-green",
  IDLE: "text-yellow",
  DND: "text-red",
  OFFLINE: "text-txt-faint",
};

export const STATUS_LABEL: Record<UserStatus, string> = {
  ONLINE: "Online",
  IDLE: "Ausente",
  DND: "Não perturbe",
  OFFLINE: "Offline",
};

const hashColor = corDoAvatar;

/**
 * Cada status tem **forma** própria, não só cor: cheio (online), lua (ausente),
 * barra vazada (não perturbe) e anel (offline). É o que deixa o estado legível
 * para quem não distingue as cores — e é como o Discord desenha.
 */
export function StatusDot({
  status,
  className = "",
}: {
  status: UserStatus;
  className?: string;
}) {
  const maskId = useId();
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${STATUS_INK[status]} ${className}`}
    >
      <mask id={maskId}>
        <circle cx="12" cy="12" r="12" fill="white" />
        {status === "IDLE" && <circle cx="7" cy="7" r="8" fill="black" />}
        {status === "DND" && <rect x="4" y="9.5" width="16" height="5" rx="2.5" fill="black" />}
        {status === "OFFLINE" && <circle cx="12" cy="12" r="6" fill="black" />}
      </mask>
      <circle cx="12" cy="12" r="12" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

const SIZE = {
  /** 16px: reply preview, listas compactas, participantes de thread. */
  xs: { box: "h-4 w-4 text-[8px]", dot: "h-2 w-2 -bottom-px -right-px border-2" },
  sm: { box: "h-6 w-6 text-[10px]", dot: "h-2.5 w-2.5 -bottom-0.5 -right-0.5 border-2" },
  md: { box: "h-8 w-8 text-xs", dot: "h-3.5 w-3.5 -bottom-0.5 -right-0.5 border-[3px]" },
  lg: { box: "h-10 w-10 text-sm", dot: "h-4 w-4 -bottom-0.5 -right-0.5 border-[3px]" },
  xl: { box: "h-20 w-20 text-2xl", dot: "h-7 w-7 bottom-0 right-0 border-[5px]" },
  /** 120px: cartão de perfil completo e tela de chamada. */
  xxl: { box: "h-[120px] w-[120px] text-4xl", dot: "h-10 w-10 bottom-1 right-1 border-[6px]" },
} as const;

/**
 * Avatar circular com a foto do usuário — ou as iniciais sobre uma cor, quando
 * não há foto — e, opcionalmente,
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
        // a borda é da cor da superfície: é ela que "recorta" a bolinha do avatar
        <span
          role="img"
          aria-label={STATUS_LABEL[status]}
          className={`absolute rounded-full ${surface} ${s.dot}`}
        >
          <StatusDot status={status} className="h-full w-full" />
        </span>
      )}
    </span>
  );
}

// ── d-social ──

const GROUP_SIZE = {
  xs: "h-4 w-4",
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-20 w-20",
  xxl: "h-[120px] w-[120px]",
} as const;

const GROUP_ICON = { xs: 10, sm: 14, md: 18, lg: 22, xl: 36, xxl: 56 } as const;

/**
 * Avatar de um grupo de DM: o ícone enviado, o mosaico dos participantes ou —
 * sem nenhum dos dois — o círculo com as silhuetas. O mosaico existe porque é
 * assim que o Discord identifica um grupo sem ícone: pelas caras de quem está
 * nele, não por um símbolo genérico.
 */
export function GroupAvatar({
  iconUrl,
  members = [],
  size = "md",
  className = "",
}: {
  iconUrl: string | null;
  /** participantes para o mosaico quando não há ícone. */
  members?: { id: string; username: string; avatarUrl?: string | null }[];
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
  // até 4 caras num quadrante cada; com menos, elas dividem o círculo
  const mosaico = members.slice(0, 4);
  if (mosaico.length >= 2) {
    return (
      <span
        aria-hidden="true"
        className={`${box} grid shrink-0 grid-cols-2 overflow-hidden rounded-full ${
          mosaico.length === 2 ? "grid-rows-1" : "grid-rows-2"
        } ${className}`}
      >
        {mosaico.map((m) =>
          m.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.id} src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span
              key={m.id}
              style={{ backgroundColor: hashColor(m.id) }}
              className="h-full w-full"
            />
          ),
        )}
      </span>
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
