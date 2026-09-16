"use client";

import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useUI } from "@/stores/ui";

/**
 * STUB — "Adicionar apelido de amigo" do cartão de uma DM (ESPEC p2, item 6).
 *
 * Props: `userId` é de quem é o apelido. Outro agente substitui o conteúdo —
 * o campo de texto e o salvamento — mantendo esta assinatura ou ampliando-a.
 */
export default function ApelidoDeAmigoModal({ userId: _userId }: { userId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  return (
    <Dialog
      title="Adicionar apelido de amigo"
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
