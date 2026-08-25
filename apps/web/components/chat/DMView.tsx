"use client";

import Composer from "@/components/chat/Composer";
import { useStickyScroll } from "@/hooks/useStickyScroll";
import { dmTitle, useDMs } from "@/stores/dms";

/** Coluna 3 no modo DM: conversa aberta. */
export default function DMView() {
  const active = useDMs((s) => s.channels.find((d) => d.id === s.activeId) ?? null);
  const messages = useDMs((s) => s.messages);
  const loading = useDMs((s) => s.loadingMessages);
  const send = useDMs((s) => s.send);
  const { scrollRef, handleScroll, showJump, jumpToLatest } = useStickyScroll(messages);

  if (!active) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center bg-chat text-neutral-500">
        Selecione uma conversa
      </main>
    );
  }

  const title = dmTitle(active);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-chat">
      <header className="border-b border-black/20 px-4 py-3 font-semibold">
        <span aria-hidden="true">{active.isGroup ? "👥 " : "@ "}</span>
        {title}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          {loading && messages.length === 0 && (
            <div className="py-6 text-center text-sm text-neutral-500">Carregando…</div>
          )}
          {!loading && messages.length === 0 && (
            <div className="py-6 text-center text-sm text-neutral-500">
              Nenhuma mensagem ainda. Diga um oi.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="mb-2">
              <span className="mr-2 font-semibold text-white">{m.author.username}</span>
              <span className="text-xs text-neutral-500">
                {new Date(m.createdAt).toLocaleTimeString()}
              </span>
              <div className="whitespace-pre-wrap text-neutral-200">{m.content}</div>
            </div>
          ))}
        </div>
        {showJump && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white shadow-lg"
          >
            ↓ Mensagens novas
          </button>
        )}
      </div>

      <Composer
        key={active.id}
        placeholder={`Conversar em ${title}`}
        ariaLabel={`Mensagem para ${title}`}
        onSend={(content) => send(content)}
      />
    </main>
  );
}
