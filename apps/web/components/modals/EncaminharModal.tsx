"use client";

import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useUI } from "@/stores/ui";

/**
 * STUB — "Encaminhar" de uma mensagem (ESPEC p1/p3, item 5: sem seta de
 * submenu, abre este modal direto).
 *
 * Props: `messageId` é a mensagem a encaminhar; `channelId` é o canal de
 * origem dela (para montar a prévia e o link, quando alguém preencher o
 * corpo). Outro agente substitui o conteúdo — a lista de canais/DMs para onde
 * encaminhar, a prévia da mensagem e o envio — mantendo esta assinatura ou
 * ampliando-a.
 */
export default function EncaminharModal({
  messageId: _messageId,
  channelId: _channelId,
}: {
  messageId: string;
  channelId: string;
}) {
  const closeModal = useUI((s) => s.closeModal);
  return (
    <Dialog
      title="Encaminhar para"
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
