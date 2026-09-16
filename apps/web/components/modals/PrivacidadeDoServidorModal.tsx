"use client";

import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useUI } from "@/stores/ui";

/**
 * STUB — "Config. de privacidade" do menu do ícone do servidor (ESPEC p5,
 * item 7).
 *
 * Props: `guildId` é o servidor. Outro agente substitui o conteúdo — as
 * opções de privacidade do servidor (ex.: acesso por DM de membros, digitalização
 * de conteúdo) — mantendo esta assinatura ou ampliando-a.
 */
export default function PrivacidadeDoServidorModal({ guildId: _guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  return (
    <Dialog
      title="Configurações de privacidade"
      onClose={closeModal}
      footer={
        <SecondaryButton full onClick={closeModal}>
          Fechar
        </SecondaryButton>
      }
    >
      <p className="text-sm text-text-muted">Em construção.</p>
    </Dialog>
  );
}
