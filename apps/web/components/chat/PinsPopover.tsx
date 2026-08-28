"use client";

import { CornerUpRight, Pin, X } from "lucide-react";
import HeaderPopover from "@/components/chat/HeaderPopover";
import MessagePreview, { AcaoDoCartao } from "@/components/chat/MessagePreview";
import { goToMessage } from "@/stores/messages-navigate";
import { usePins } from "@/stores/messages-pins";

/**
 * Botão "Mensagens fixadas" do cabeçalho e a lista que ele abre, como no
 * Discord: a mensagem inteira em cada cartão e, no hover, "saltar" e "×" no
 * canto — no original nenhuma ação fica escrita por extenso no cartão.
 */
export default function PinsPopover({
  channelId,
  guildId,
  canPin,
}: {
  channelId: string;
  guildId: string | null;
  /** quem não pode fixar também não desafixa — o botão nem aparece. */
  canPin: boolean;
}) {
  const items = usePins((s) => s.items);
  const loading = usePins((s) => s.loading);
  const load = usePins((s) => s.load);
  const unpin = usePins((s) => s.unpin);

  return (
    <HeaderPopover
      label="Mensagens fixadas"
      title="Mensagens Fixadas"
      contagem={items.length}
      icon={<Pin size={20} />}
      onOpen={() => void load(channelId)}
    >
      {(fechar) => (
        <>
          {loading && <p className="p-4 text-center text-sm text-txt-muted">Carregando…</p>}

          {!loading && items.length === 0 && (
            <div className="p-6 text-center">
              <Pin size={32} aria-hidden="true" className="mx-auto mb-2 text-txt-faint" />
              <p className="text-sm text-txt-muted">
                Este canal ainda não tem mensagens fixadas.
              </p>
              <p className="mt-2 text-xs text-txt-faint">
                Você pode fixar uma mensagem pelo menu de contexto dela.
              </p>
            </div>
          )}

          {items.map((p) => (
            <MessagePreview
              key={p.message.id}
              message={p.message}
              className="mb-2 last:mb-0"
              acoes={
                <>
                  <AcaoDoCartao
                    label="Saltar"
                    onClick={() => {
                      fechar();
                      void goToMessage({ guildId, channelId, messageId: p.message.id });
                    }}
                  >
                    <CornerUpRight size={16} />
                  </AcaoDoCartao>
                  {canPin && (
                    // `unpin` já pede confirmação antes de tirar da lista
                    <AcaoDoCartao
                      label="Desafixar"
                      danger
                      onClick={() => void unpin(channelId, p.message.id)}
                    >
                      <X size={16} />
                    </AcaoDoCartao>
                  )}
                </>
              }
            />
          ))}
        </>
      )}
    </HeaderPopover>
  );
}
