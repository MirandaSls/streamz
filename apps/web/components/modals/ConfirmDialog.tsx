"use client";

import MessagePreview from "@/components/chat/MessagePreview";
import Dialog, { PrimaryButton, SecondaryButton } from "@/components/modals/Dialog";
import { useMessages } from "@/stores/messages";
import type { Modal } from "@/stores/ui";

/**
 * Substitui o `confirm()` do browser: mesmo fluxo, mas acessível e no tema.
 *
 * Quando o modal traz `preview` (o id de uma mensagem), a caixa mostra a
 * **mensagem em si** — avatar, nome, hora e conteúdo — e não só a frase "a
 * mensagem some para todo mundo". É a diferença entre confirmar no escuro e
 * conferir que se está apagando a certa.
 */
export default function ConfirmDialog({
  modal,
}: {
  modal: Extract<Modal, { kind: "confirm" }>;
}) {
  const mensagem = useMessages((s) => {
    const id = modal.preview;
    if (!id) return null;
    for (const slice of Object.values(s.byChannel)) {
      const achada = slice.items.find((m) => m.id === id);
      if (achada) return achada;
    }
    return s.threadItems.find((m) => m.id === id) ?? null;
  });

  return (
    <Dialog
      title={modal.title}
      description={modal.message}
      onClose={() => modal.resolve(false)}
      footer={
        <>
          <PrimaryButton danger={modal.danger} onClick={() => modal.resolve(true)}>
            {modal.confirmLabel}
          </PrimaryButton>
          <SecondaryButton autoFocus={modal.danger} onClick={() => modal.resolve(false)}>
            Cancelar
          </SecondaryButton>
          {modal.preview && (
            <p className="mr-auto max-w-[240px] text-xs leading-tight text-text-muted">
              Dica: você pode segurar shift ao clicar em apagar mensagem para pular esta
              confirmação.
            </p>
          )}
        </>
      }
    >
      {modal.preview &&
        (mensagem ? (
          // o mesmo cartão dos painéis de fixadas/busca: não existe uma segunda
          // versão da mensagem para envelhecer sozinha
          <div className="max-h-[240px] overflow-y-auto rounded-[5px] border border-border-subtle">
            <MessagePreview message={mensagem} />
          </div>
        ) : (
          // a mensagem pode ter saído da janela de retenção enquanto o modal abria
          <p className="rounded-[5px] border border-border-subtle p-3 text-sm text-text-muted">
            Não foi possível carregar a prévia desta mensagem.
          </p>
        ))}
    </Dialog>
  );
}
