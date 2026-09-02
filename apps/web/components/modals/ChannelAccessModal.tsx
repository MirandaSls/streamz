"use client";

import { useEffect } from "react";
import { Check } from "@/components/ui/icones";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import Avatar from "@/components/ui/Avatar";
import { useChannels } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";
import { useUI } from "@/stores/ui";

/**
 * Allowlist de um canal privado. Moderadores entram sempre; membros, na marca.
 *
 * A lista é um componente à parte porque ela aparece em dois lugares: neste
 * modal (atalho do menu de contexto) e como a aba "Permissões" das
 * configurações do canal — mesma allowlist, mesma store, um código só.
 */
export function ChannelAccessList({ channelId }: { channelId: string }) {
  const guildId = useGuilds((s) => s.activeGuildId);
  const members = useGuilds((s) => s.members);
  const access = useChannels((s) => s.access);
  const loadAccess = useChannels((s) => s.loadAccess);
  const toggleAccess = useChannels((s) => s.toggleAccess);
  const clearAccess = useChannels((s) => s.clearAccess);

  useEffect(() => {
    if (!guildId) return;
    void loadAccess(guildId, channelId);
    return () => clearAccess();
  }, [guildId, channelId, loadAccess, clearAccess]);

  const plainMembers = members.filter((m) => m.role === "MEMBER");
  const ready = access.channelId === channelId && !access.loading;

  return (
    <div className="max-h-56 overflow-y-auto rounded bg-rail/50">
      {!ready ? (
        <p className="px-3 py-3 text-sm text-txt-muted">Carregando…</p>
      ) : plainMembers.length === 0 ? (
        <p className="px-3 py-3 text-sm text-txt-muted">
          Nenhum membro comum neste servidor.
        </p>
      ) : (
        plainMembers.map((m) => {
          const marcado = access.allowed.includes(m.user.id);
          return (
            <button
              key={m.user.id}
              type="button"
              role="checkbox"
              aria-checked={marcado}
              onClick={() => guildId && toggleAccess(guildId, channelId, m.user.id)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-txt-normal hover:bg-hov"
            >
              <Avatar user={m.user} size="sm" surface="border-chat" />
              <span className="min-w-0 flex-1 truncate">{m.user.username}</span>
              {/* mesmo círculo do "selecionar amigos": o checkbox nativo não
                  segue o tema */}
              <span
                aria-hidden="true"
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
                  marcado ? "border-accent bg-accent text-accent-ink" : "border-txt-faint"
                }`}
              >
                {marcado && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

export default function ChannelAccessModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const channel = useChannels((s) => s.channels.find((c) => c.id === channelId));

  return (
    <Dialog
      title={`Acesso a #${channel?.name ?? "canal"}`}
      description="Moderadores sempre têm acesso. Marque os membros liberados."
      onClose={closeModal}
      className="w-[380px]"
      footer={<SecondaryButton full onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <ChannelAccessList channelId={channelId} />
    </Dialog>
  );
}
