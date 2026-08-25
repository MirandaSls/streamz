"use client";

import { horaCompleta } from "@/lib/format";
import { useMessages } from "@/stores/messages";

/** Resultados da busca do canal, sobre a timeline. */
export default function SearchPanel() {
  const query = useMessages((s) => s.searchQuery);
  const results = useMessages((s) => s.searchResults);
  const searching = useMessages((s) => s.searching);
  const clearSearch = useMessages((s) => s.clearSearch);

  if (results === null) return null;

  return (
    <section
      aria-label="Resultados da busca"
      className="border-b border-black/20 bg-panel px-4 py-2"
    >
      <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase text-txt-muted">
        <span>
          {searching ? "Buscando…" : `${results.length} resultado(s) para “${query}”`}
        </span>
        <button type="button" onClick={clearSearch} className="normal-case transition hover:text-txt-primary">
          Fechar
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {results.length === 0 && !searching ? (
          <div className="py-2 text-sm text-txt-muted">Nada encontrado.</div>
        ) : (
          results.map((m) => (
            <div key={m.id} className="my-1 rounded bg-chat px-3 py-2 text-sm">
              <span className="font-medium text-txt-primary">{m.author.username}</span>{" "}
              <span className="text-xs text-txt-muted">{horaCompleta(m.createdAt)}</span>
              <div className="text-txt-normal">{m.content}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
