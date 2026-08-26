"use client";

import { Pin } from "lucide-react";
import { displayNameOf } from "@streamz/shared";
import HeaderPopover from "@/components/chat/HeaderPopover";
import Avatar from "@/components/ui/Avatar";
import { horaCompleta } from "@/lib/format";
import { goToMessage } from "@/stores/messages-navigate";
import { usePins } from "@/stores/messages-pins";

/**
 * Botão "Mensagens fixadas" do cabeçalho e a lista que ele abre, como no
 * Discord: cartão por mensagem, clique leva até ela no histórico.
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
      title="Mensagens fixadas"
      icon={<Pin size={24} />}
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
            </div>
          )}

          {items.map((p) => (
            <article
              key={p.message.id}
              className="mb-2 rounded-[5px] bg-chat p-3 last:mb-0 hover:bg-msghov"
            >
              <div className="flex items-center gap-2">
                <Avatar user={p.message.author} size="sm" />
                <span className="font-medium text-txt-primary">
                  {displayNameOf(p.message.author)}
                </span>
                <span className="text-xs text-txt-muted">{horaCompleta(p.message.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-txt-normal">
                {p.message.content ||
                  (p.message.attachments.length > 0 ? "(anexo)" : "(mensagem vazia)")}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    fechar();
                    void goToMessage({ guildId, channelId, messageId: p.message.id });
                  }}
                  className="font-medium text-txt-link hover:underline"
                >
                  Ir para a mensagem
                </button>
                {canPin && (
                  <button
                    type="button"
                    onClick={() => void unpin(channelId, p.message.id)}
                    className="text-txt-muted hover:text-red"
                  >
                    Desafixar
                  </button>
                )}
                <span className="ml-auto text-txt-faint">
                  fixada por {displayNameOf(p.pinnedBy)}
                </span>
              </div>
            </article>
          ))}
        </>
      )}
    </HeaderPopover>
  );
}
