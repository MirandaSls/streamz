"use client";

import { useMemo } from "react";
import { Search, X } from "lucide-react";
import { displayNameOf, parseSearchQuery } from "@newdisc/shared";
import type { Message } from "@newdisc/shared";
import Avatar from "@/components/ui/Avatar";
import { horaCompleta } from "@/lib/format";
import { useChannels } from "@/stores/channels";
import { useMessages } from "@/stores/messages";
import { goToMessage } from "@/stores/messages-navigate";

/** Dica dos filtros aceitos, mostrada quando a busca não achou nada. */
const FILTROS = [
  ["from:@usuário", "quem escreveu"],
  ["in:#canal", "onde"],
  ["has:link | image | file", "o que a mensagem tem"],
  ["before:2026-08-25 · after:2026-08-01", "quando"],
  ["mentions:@usuário", "quem foi mencionado"],
];

/**
 * Coluna 4 com os resultados da busca, como no Discord: agrupados por canal,
 * mais recentes primeiro, cada um com "ir para" que abre o histórico na
 * mensagem. Some quando a busca é limpa.
 */
export default function SearchPanel({ guildId }: { guildId: string | null }) {
  const query = useMessages((s) => s.searchQuery);
  const results = useMessages((s) => s.searchResults);
  const searching = useMessages((s) => s.searching);
  const clearSearch = useMessages((s) => s.clearSearch);
  const canais = useChannels((s) => s.channels);

  const porCanal = useMemo(() => {
    const mapa = new Map<string, Message[]>();
    for (const m of results ?? []) {
      const lista = mapa.get(m.channelId) ?? [];
      lista.push(m);
      mapa.set(m.channelId, lista);
    }
    return Array.from(mapa.entries());
  }, [results]);

  if (results === null && !searching) return null;

  const filtros = parseSearchQuery(query);
  const total = results?.length ?? 0;

  function nomeDoCanal(channelId: string): string {
    const canal = canais.find((c) => c.id === channelId);
    return canal?.name ? `#${canal.name}` : "Conversa";
  }

  return (
    <aside
      aria-label="Resultados da busca"
      className="flex w-[26rem] shrink-0 flex-col border-l border-black/20 bg-panel"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 px-4 shadow-header">
        <Search size={18} aria-hidden="true" className="text-txt-muted" />
        <span className="min-w-0 flex-1 truncate font-semibold text-txt-primary">
          {searching ? "Buscando…" : `${total} ${total === 1 ? "resultado" : "resultados"}`}
        </span>
        <button
          type="button"
          onClick={clearSearch}
          aria-label="Fechar a busca"
          className="text-txt-secondary transition hover:text-txt-primary"
        >
          <X size={20} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {(filtros.from || filtros.in || filtros.has.length > 0 || filtros.before || filtros.after || filtros.mentions) && (
          <div className="mb-2 flex flex-wrap gap-1 px-1">
            {filtros.from && <Ficha rotulo={`de @${filtros.from}`} />}
            {filtros.in && <Ficha rotulo={`em #${filtros.in}`} />}
            {filtros.mentions && <Ficha rotulo={`menciona @${filtros.mentions}`} />}
            {filtros.has.map((h) => (
              <Ficha key={h} rotulo={`tem ${h}`} />
            ))}
            {filtros.before && <Ficha rotulo={`antes de ${filtros.before}`} />}
            {filtros.after && <Ficha rotulo={`depois de ${filtros.after}`} />}
          </div>
        )}

        {!searching && total === 0 && (
          <div className="p-4 text-center">
            <p className="text-sm text-txt-muted">Nada encontrado.</p>
            <dl className="mt-4 space-y-1 text-left text-xs text-txt-faint">
              {FILTROS.map(([f, o]) => (
                <div key={f} className="flex gap-2">
                  <dt className="font-mono text-txt-muted">{f}</dt>
                  <dd className="ml-auto">{o}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {porCanal.map(([channelId, mensagens]) => (
          <section key={channelId} className="mb-3 last:mb-0">
            <h3 className="px-2 py-1 text-xs font-semibold uppercase text-txt-muted">
              {nomeDoCanal(channelId)}
            </h3>
            {mensagens.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  void goToMessage({ guildId, channelId: m.channelId, messageId: m.id })
                }
                className="mb-1 block w-full rounded-[5px] bg-chat p-3 text-left last:mb-0 hover:bg-msghov"
              >
                <div className="flex items-center gap-2">
                  <Avatar user={m.author} size="sm" />
                  <span className="font-medium text-txt-primary">{displayNameOf(m.author)}</span>
                  <span className="ml-auto text-xs text-txt-muted">
                    {horaCompleta(m.createdAt)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-txt-normal">
                  {m.content || (m.attachments.length > 0 ? "(anexo)" : "(mensagem vazia)")}
                </p>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

/** Pílula que mostra um filtro reconhecido na consulta. */
function Ficha({ rotulo }: { rotulo: string }) {
  return (
    <span className="rounded-[3px] bg-accent/20 px-1.5 py-0.5 text-xs font-medium text-txt-primary">
      {rotulo}
    </span>
  );
}
