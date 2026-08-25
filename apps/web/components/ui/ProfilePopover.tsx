"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, MessageSquare, Pencil, SmilePlus, UserMinus, UserPlus, UserX } from "lucide-react";
import { customStatusOf, displayNameOf, type UserStatus } from "@newdisc/shared";
import Avatar, { STATUS_COLOR, STATUS_LABEL } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useDMs } from "@/stores/dms";
import { useFriends, useRelationship } from "@/stores/friends";
import { resolveStatus, resolveUser, usePresence } from "@/stores/presence";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

const WIDTH = 300;

/** As quatro opções do seletor de status do Discord (Invisível = OFFLINE manual). */
const STATUS_OPTIONS: { value: UserStatus | null; label: string; hint: string; dot: UserStatus }[] = [
  { value: null, label: "Online", hint: "Automático", dot: "ONLINE" },
  { value: "IDLE", label: "Ausente", hint: "", dot: "IDLE" },
  { value: "DND", label: "Não perturbe", hint: "Você não recebe notificações", dot: "DND" },
  { value: "OFFLINE", label: "Invisível", hint: "Você aparece offline", dot: "OFFLINE" },
];

/**
 * Cartão de perfil que abre ao clicar num avatar ou nome — a "popout" do
 * Discord: faixa de cor, avatar grande sobreposto, nome, status e o atalho de
 * mandar mensagem. No próprio perfil vira o seletor de status + editar nome.
 * Um só na tela, aberto por `ui.openProfile(user, anchor)`.
 */
export default function ProfilePopoverHost() {
  const popover = useUI((s) => s.popover);
  const close = useUI((s) => s.closePopover);
  const openModal = useUI((s) => s.openModal);
  const me = useAuth((s) => s.user);
  const setMe = useAuth((s) => s.setUser);
  const statuses = usePresence((s) => s.statuses);
  const profiles = usePresence((s) => s.profiles);
  const openWith = useDMs((s) => s.openWith);
  // ── d-social ── as ações do cartão dependem da relação com quem ele mostra
  const send = useFriends((s) => s.send);
  const accept = useFriends((s) => s.accept);
  const dismiss = useFriends((s) => s.dismiss);
  const removeFriend = useFriends((s) => s.remove);
  const block = useFriends((s) => s.block);
  const unblock = useFriends((s) => s.unblock);
  const incoming = useFriends((s) => s.incoming);
  const relacao = useRelationship(popover?.user.id, me?.id);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);

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
  const isMe = me?.id === popover.user.id;
  const user = isMe && me ? me : resolveUser(profiles, popover.user);
  const status = resolveStatus(statuses, user);

  async function setStatus(value: UserStatus | null) {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await api.updateStatus(value);
      setMe(updated);
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível mudar o status"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Perfil de ${displayNameOf(user)}`}
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, width: WIDTH }}
      className={`fixed z-[75] overflow-hidden rounded-lg bg-[#111214] shadow-high ${pos ? "" : "invisible"}`}
    >
      <div className="h-[60px] bg-accent" />
      <div className="px-4 pb-4">
        <div className="-mt-10 mb-3 w-fit rounded-full border-[6px] border-[#111214]">
          <Avatar user={user} size="xl" status={status} surface="border-[#111214]" />
        </div>
        <div className="rounded-lg bg-footer p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xl font-bold leading-6 text-txt-primary">{displayNameOf(user)}</div>
              <div className="truncate text-sm text-txt-normal">@{user.username}</div>
              {customStatusOf(user) && (
                <div className="mt-1 truncate text-sm text-txt-normal">{customStatusOf(user)}</div>
              )}
            </div>
            {isMe && (
              <button
                type="button"
                onClick={() => {
                  close();
                  openModal({ kind: "settings" });
                }}
                aria-label="Editar perfil"
                className="grid h-8 w-8 shrink-0 place-items-center rounded text-txt-secondary hover:bg-hov hover:text-txt-primary"
              >
                <Pencil size={16} />
              </button>
            )}
          </div>

          {isMe ? (
            <>
              <button
                type="button"
                onClick={() => {
                  close();
                  openModal({ kind: "customStatus" });
                }}
                className="mt-3 flex h-8 w-full items-center gap-2 rounded-[3px] px-2 text-sm text-txt-normal transition hover:bg-hov hover:text-txt-primary"
              >
                <SmilePlus size={16} aria-hidden="true" />
                {customStatusOf(user) ? "Editar status personalizado" : "Definir status personalizado"}
              </button>

              <div className="mt-3 border-t border-[#3f4147] pt-3 text-xs font-bold uppercase text-txt-secondary">
                Definir status
              </div>
              <div role="radiogroup" aria-label="Status" className="mt-1 flex flex-col gap-0.5">
                {STATUS_OPTIONS.map((o) => {
                  const selected = (me?.status === "OFFLINE" ? "OFFLINE" : status) === o.dot && (o.value !== null || status === "ONLINE");
                  return (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={saving}
                      onClick={() => void setStatus(o.value)}
                      className={`flex items-center gap-3 rounded-[3px] px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-white ${
                        selected ? "text-txt-primary" : "text-txt-normal"
                      }`}
                    >
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[o.dot]}`} />
                      <span className="flex-1">
                        <span className="block font-medium">{o.label}</span>
                        {o.hint && <span className="block text-xs opacity-70">{o.hint}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 border-t border-[#3f4147] pt-3 text-xs font-bold uppercase text-txt-secondary">
                Status
              </div>
              <div className="mt-1 text-sm text-txt-normal">{STATUS_LABEL[status]}</div>
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

              {/* ── d-social ── o que dá para fazer depende da relação atual */}
              {relacao === "none" && (
                <PopoverAction icon={<UserPlus size={16} />} onClick={() => void send(user.username)}>
                  Adicionar amigo
                </PopoverAction>
              )}
              {relacao === "outgoing" && (
                <p className="mt-2 text-center text-xs text-txt-muted">Pedido de amizade enviado.</p>
              )}
              {relacao === "incoming" && (
                <>
                  <PopoverAction
                    icon={<Check size={16} />}
                    onClick={() => {
                      const pedido = incoming.find((r) => r.user.id === user.id);
                      if (pedido) void accept(pedido.id);
                    }}
                  >
                    Aceitar pedido de amizade
                  </PopoverAction>
                  <PopoverAction
                    icon={<UserX size={16} />}
                    danger
                    onClick={() => {
                      const pedido = incoming.find((r) => r.user.id === user.id);
                      if (pedido) void dismiss(pedido.id);
                    }}
                  >
                    Recusar pedido
                  </PopoverAction>
                </>
              )}
              {relacao === "friend" && (
                <PopoverAction
                  icon={<UserMinus size={16} />}
                  danger
                  onClick={() => {
                    close();
                    void removeFriend(user);
                  }}
                >
                  Remover amigo
                </PopoverAction>
              )}
              {relacao === "blocked" ? (
                <PopoverAction icon={<UserX size={16} />} onClick={() => void unblock(user.id)}>
                  Desbloquear
                </PopoverAction>
              ) : (
                <PopoverAction
                  icon={<UserX size={16} />}
                  danger
                  onClick={() => {
                    close();
                    void block(user);
                  }}
                >
                  Bloquear
                </PopoverAction>
              )}

              <button
                type="button"
                onClick={() => {
                  close();
                  openModal({ kind: "userProfile", userId: user.id });
                }}
                className="mt-2 h-8 w-full rounded-[3px] text-sm font-medium text-txt-link transition hover:underline"
              >
                Ver perfil completo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ação secundária do cartão de perfil (adicionar amigo, bloquear, ...). */
function PopoverAction({
  icon,
  onClick,
  danger = false,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={"mt-2 flex h-8 w-full items-center gap-2 rounded-[3px] px-2 text-sm font-medium transition " + (danger ? "text-red hover:bg-red hover:text-white" : "text-txt-normal hover:bg-hov hover:text-txt-primary")}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}
