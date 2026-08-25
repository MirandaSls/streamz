"use client";

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
      <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
        <span>
          {searching ? "Buscando…" : `${results.length} resultado(s) para “${query}”`}
        </span>
        <button type="button" onClick={clearSearch} className="transition hover:text-white">
          fechar
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {results.length === 0 && !searching ? (
          <div className="py-2 text-sm text-neutral-500">Nada encontrado.</div>
        ) : (
          results.map((m) => (
            <div key={m.id} className="border-b border-black/10 py-1.5 text-sm">
              <span className="font-semibold text-white">{m.author.username}</span>{" "}
              <span className="text-xs text-neutral-500">
                {new Date(m.createdAt).toLocaleString()}
              </span>
              <div className="text-neutral-300">{m.content}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
