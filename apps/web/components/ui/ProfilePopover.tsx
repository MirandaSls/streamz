"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import Avatar, { STATUS_LABEL } from "@/components/ui/Avatar";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { resolveStatus, usePresence } from "@/stores/presence";
import { useUI } from "@/stores/ui";

const WIDTH = 300;

/**
 * Cartão de perfil que abre ao clicar num avatar ou nome — a "popout" do
 * Discord: faixa de cor, avatar grande sobreposto, nome, status e o atalho de
 * mandar mensagem. Um só na tela, aberto por `ui.openProfile(user, anchor)`.
 */
export default function ProfilePopoverHost() {
  const popover = useUI((s) => s.popover);
  const close = useUI((s) => s.closePopover);
  const me = useAuth((s) => s.user);
  const statuses = usePresence((s) => s.statuses);
  const openWith = useDMs((s) => s.openWith);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // à direita do elemento; se não couber, à esquerda; sempre dentro da tela
  useLayoutEffect(() => {
    if (!popover) {
      setPos(null);
      return;
    }
    const { anchor } = popover;
    const h = ref.current?.offsetHeight ?? 0;
    let x = anchor.x + anchor.width + 8;
    if (x + WIDTH > window.innerWidth - 8) x = anchor.x - WIDTH - 8;
    const y = Math.max(8, Math.min(anchor.y, window.innerHeight - h - 8));
    setPos({ x: Math.max(8, x), y });
  }, [popover]);

  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [popover, close]);

  if (!popover) return null;
  const { user } = popover;
  const status = resolveStatus(statuses, user);
  const isMe = me?.id === user.id;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Perfil de ${user.username}`}
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, width: WIDTH }}
      className={`fixed z-[75] overflow-hidden rounded-lg bg-[#111214] shadow-high ${pos ? "" : "invisible"}`}
    >
      <div className="h-[60px] bg-accent" />
      <div className="px-4 pb-4">
        <div className="-mt-10 mb-3 w-fit rounded-full border-[6px] border-[#111214]">
          <Avatar user={user} size="xl" status={status} surface="border-[#111214]" />
        </div>
        <div className="rounded-lg bg-footer p-3">
          <div className="text-xl font-bold leading-6 text-txt-primary">{user.username}</div>
          <div className="text-sm text-txt-normal">@{user.username}</div>
          <div className="mt-3 border-t border-[#3f4147] pt-3 text-xs font-bold uppercase text-txt-secondary">
            Status
          </div>
          <div className="mt-1 text-sm text-txt-normal">{STATUS_LABEL[status]}</div>
          {!isMe && (
            <button
              type="button"
              onClick={() => {
                close();
                void openWith(user.id);
              }}
              className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-[3px] bg-accent text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              <MessageSquare size={16} aria-hidden="true" />
              Enviar mensagem
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
