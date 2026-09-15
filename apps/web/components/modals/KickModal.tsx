"use client";

import { useState } from "react";
import { MAX_MODERATION_REASON, displayNameOf, type PublicUser } from "@streamz/shared";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { Rotulo } from "@/components/ui/controls";
import { TextInput } from "@/components/ui/primitivos";
import { api } from "@/lib/api";
import { useGuilds } from "@/stores/guilds";
import { errorMessage } from "@/stores/socket-adapter";
import { ui, useUI } from "@/stores/ui";

/** Expulsão com motivo — o expulso pode voltar com um novo convite. */
export default function KickModal({ guildId, user }: { guildId: string; user: PublicUser }) {
  const closeModal = useUI((s) => s.closeModal);
  const guild = useGuilds((s) => s.guilds.find((g) => g.id === guildId) ?? null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const nome = displayNameOf(user);

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      await api.kickWithReason(guildId, user.id, reason.trim() || undefined);
      useGuilds.setState((s) => ({ members: s.members.filter((m) => m.user.id !== user.id) }));
      ui.toast(`${nome} foi removido do servidor.`);
      closeModal();
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível expulsar"), "error");
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={`Expulsar '${nome}' de ${guild?.name ?? "este servidor"}`}
      description="Essa pessoa sai do servidor, mas pode voltar com um novo convite."
      onClose={closeModal}
      footer={
        <>
          <PrimaryButton danger disabled={saving} onClick={() => void submit()}>
            {saving ? "Expulsando…" : "Expulsar"}
          </PrimaryButton>
          <SecondaryButton autoFocus onClick={closeModal}>
            Cancelar
          </SecondaryButton>
        </>
      }
    >
      <Rotulo htmlFor="kick-reason">Motivo para expulsar</Rotulo>
      <TextInput
        id="kick-reason"
        value={reason}
        maxLength={MAX_MODERATION_REASON}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ex.: comportamento fora das regras"
        autoFocus
      />
      <p className="mt-1 text-xs text-text-muted">
        O motivo vai para o registro de auditoria e para o aviso na conversa direta.
      </p>
    </Dialog>
  );
}
