"use client";

import InvitesPanel from "@/components/modals/InvitesPanel";
import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useUI } from "@/stores/ui";

/**
 * Convites do servidor como caixa de diálogo — o atalho do menu do servidor.
 * O conteúdo é o mesmo `InvitesPanel` da aba "Convites" das configurações, para
 * não existirem duas listas de convite que envelhecem diferente.
 */
export default function InvitesModal({ guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  return (
    <Dialog
      telaCheiaNoCelular
      title="Convites"
      onClose={closeModal}
      className="w-[480px]"
      footer={<SecondaryButton onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <InvitesPanel guildId={guildId} />
    </Dialog>
  );
}
