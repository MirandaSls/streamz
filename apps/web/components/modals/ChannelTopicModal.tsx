"use client";

import Dialog, { SecondaryButton } from "@/components/modals/Dialog";
import { Markdown } from "@/lib/markdown";
import { useChannels } from "@/stores/channels";
import { useUI } from "@/stores/ui";

/**
 * Tópico completo do canal. O cabeçalho mostra uma linha só (ele tem 48px de
 * altura, ver `HeaderBar`); o texto inteiro cabe aqui, como no Discord.
 *
 * **Renderização.** O tópico aceita o mesmo markdown inline da mensagem
 * (negrito, itálico, link, emoji) — o Discord processa `topic` pela mesma
 * pilha de markup do chat, só sem blocos (lista, citação, bloco de código não
 * fazem sentido numa linha de tópico). Antes saía como texto cru: um link
 * colado no tópico não virava link. Reaproveita `lib/markdown.tsx`
 * (`Markdown`), o mesmo renderizador de `MessagePreview`/`MessageItem`, para
 * não existir uma segunda leitura de markdown que diverge da primeira.
 *
 * **Carregando.** A lista de canais do servidor (`useChannels().loading`) é o
 * único jeito de o canal ainda não existir na store quando o modal abre — em
 * uso normal ele já vem do cabeçalho que mostrava o tópico truncado, e essa
 * lacuna não acontece; o estado fica aqui por segurança (ex.: link direto que
 * abre o modal antes da lista carregar).
 */
export default function ChannelTopicModal({ channelId }: { channelId: string }) {
  const closeModal = useUI((s) => s.closeModal);
  const carregando = useChannels((s) => s.loading);
  const channel = useChannels((s) => s.channels.find((c) => c.id === channelId));

  return (
    <Dialog
      title={`#${channel?.name ?? "canal"}`}
      onClose={closeModal}
      footer={<SecondaryButton full onClick={closeModal}>Fechar</SecondaryButton>}
    >
      {!channel && carregando ? (
        <p className="text-sm text-text-muted">Carregando…</p>
      ) : channel?.topic ? (
        <Markdown text={channel.topic} />
      ) : (
        <p className="text-sm text-text-muted">Este canal ainda não tem tópico.</p>
      )}
    </Dialog>
  );
}
