"use client";

import { useEffect } from "react";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useChannels } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";
import { useUI } from "@/stores/ui";

/** Allowlist de um canal privado. Moderadores entram sempre; membros, na marca. */
export default function ChannelAccessModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const guildId = useGuilds((s) => s.activeGuildId);
  const members = useGuilds((s) => s.members);
  const channel = useChannels((s) => s.channels.find((c) => c.id === channelId));
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
    <Dialog
      title={`Acesso a #${channel?.name ?? "canal"}`}
      description="Moderadores sempre têm acesso. Marque os membros liberados."
      onClose={closeModal}
      className="w-[380px]"
      footer={<SecondaryButton full onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <div className="max-h-56 overflow-y-auto rounded bg-rail/50">
        {!ready ? (
          <p className="px-3 py-3 text-sm text-txt-muted">Carregando…</p>
        ) : plainMembers.length === 0 ? (
          <p className="px-3 py-3 text-sm text-txt-muted">
            Nenhum membro comum neste servidor.
          </p>
        ) : (
          plainMembers.map((m) => (
            <label
              key={m.user.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-txt-normal hover:bg-hov"
            >
              <input
                type="checkbox"
                checked={access.allowed.includes(m.user.id)}
                onChange={() => guildId && toggleAccess(guildId, channelId, m.user.id)}
              />
              {m.user.username}
            </label>
          ))
        )}
      </div>
    </Dialog>
  );
}
