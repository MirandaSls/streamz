"use client";

import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { useChannels } from "@/stores/channels";
import { useUI } from "@/stores/ui";

/**
 * Tópico completo do canal. O cabeçalho mostra uma linha só (ele tem 48px de
 * altura); o texto inteiro cabe aqui, como no Discord.
 */
export default function ChannelTopicModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const channel = useChannels((s) => s.channels.find((c) => c.id === channelId));

  return (
    <Dialog
      title={`#${channel?.name ?? "canal"}`}
      onClose={closeModal}
      className="w-[440px]"
      footer={<SecondaryButton full onClick={closeModal}>Fechar</SecondaryButton>}
    >
      <p className="whitespace-pre-wrap break-words text-sm text-text-default">
        {channel?.topic || "Este canal ainda não tem tópico."}
      </p>
    </Dialog>
  );
}
