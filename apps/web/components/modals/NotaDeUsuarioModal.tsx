"use client";

import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useUI } from "@/stores/ui";

/**
 * STUB — "Adicionar nota" do cartão de uma DM (ESPEC p2, item 5: descrição
 * "Visível apenas para você").
 *
 * Props: `userId` é de quem é a nota. Outro agente substitui o conteúdo — o
 * campo de texto e o salvamento (provavelmente por escopo local ao usuário,
 * como o apelido de amigo) — mantendo esta assinatura ou ampliando-a.
 */
export default function NotaDeUsuarioModal({ userId: _userId }: { userId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  return (
    <Dialog
      title="Adicionar nota"
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
