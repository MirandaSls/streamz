"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { attachmentDisplayName, type Attachment } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { useMessages } from "@/stores/messages";
import { ui, useUI } from "@/stores/ui";

/**
 * Coluna 4 com a galeria de imagens do canal.
 *
 * Busca as mais recentes ao abrir e recarrega quando chega mensagem nova no
 * canal (a contagem de itens da timeline serve de gatilho): o anexo não vem
 * pelo evento, e voltar ao servidor só quando algo mudou evita repetir a
 * consulta a cada renderização.
 */
export default function MediaPanel({ channelId }: { channelId: string }) {
  const toggleMedia = useUI((s) => s.toggleMedia);
  const [itens, setItens] = useState<Attachment[]>([]);
  const [carregando, setCarregando] = useState(true);
  const totalMensagens = useMessages((s) => s.byChannel[channelId]?.items.length ?? 0);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void api
      .channelAttachments(channelId, "image")
      .then((r) => vivo && setItens(r))
      .catch((e) => {
        if (!vivo) return;
        setItens([]);
        ui.toast(errorMessage(e, "Não foi possível carregar a mídia do canal"), "error");
      })
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [channelId, totalMensagens]);

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-panel">
      <header className="flex h-12 shrink-0 items-center justify-between px-4 shadow-header">
        <h2 className="text-base font-semibold text-txt-primary">Mídia</h2>
        <button
          type="button"
          onClick={toggleMedia}
          aria-label="Fechar mídia"
          className="grid h-6 w-6 place-items-center text-txt-secondary hover:text-txt-primary"
        >
          <X size={20} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {carregando ? (
          <p className="py-8 text-center text-sm text-txt-muted">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-txt-muted">
            Nenhuma imagem enviada neste canal ainda.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {itens.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  ui.openModal({
                    kind: "galeria",
                    urls: itens.map((x) => x.url),
                    alts: itens.map((x) => attachmentDisplayName(x)),
                    indice: i,
                  })
                }
                aria-label={`Abrir ${attachmentDisplayName(a)}`}
                className="aspect-square overflow-hidden rounded"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={attachmentDisplayName(a)}
                  loading="lazy"
                  className="h-full w-full object-cover transition hover:brightness-110"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
