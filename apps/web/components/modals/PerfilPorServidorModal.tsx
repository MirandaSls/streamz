"use client";

import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useUI } from "@/stores/ui";

/**
 * STUB — "Editar perfil por servidor" do menu do ícone do servidor (ESPEC p5,
 * item 8).
 *
 * Props: `guildId` é o servidor cujo perfil (apelido, avatar, banner
 * específicos daquele servidor) vai ser editado. Outro agente substitui o
 * conteúdo — mantendo esta assinatura ou ampliando-a.
 */
export default function PerfilPorServidorModal({ guildId: _guildId }: { guildId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  return (
    <Dialog
      title="Editar perfil por servidor"
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
