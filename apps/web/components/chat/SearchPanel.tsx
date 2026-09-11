"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CornerUpRight, Search, X } from "@/components/ui/icones";
import { parseSearchQuery } from "@streamz/shared";
import type { Message } from "@streamz/shared";
import MessagePreview, { AcaoDoCartao } from "@/components/chat/MessagePreview";
import { BotaoDeIcone } from "@/components/ui/primitivos";
import { useChannels } from "@/stores/channels";
import { useMessages } from "@/stores/messages";
import { goToMessage } from "@/stores/messages-navigate";

/** Filtros aceitos, mostrados como pílulas acima dos resultados. */
const FILTROS = [
  ["from:", "quem escreveu"],
  ["in:", "onde"],
  ["has:", "link, image ou file"],
  ["before:", "antes de AAAA-MM-DD"],
  ["after:", "depois de AAAA-MM-DD"],
  ["mentions:", "quem foi mencionado"],
];

/** Resultados por página — o Discord pagina de 25 em 25. */
const POR_PAGINA = 25;

type Ordem = "novas" | "relevantes";

/**
 * Coluna 4 com os resultados da busca.
 *
 * O Discord **não agrupa por canal**: cada resultado é uma linha independente
 * que já diz de qual canal veio e mostra a mensagem anterior e a seguinte como
 * contexto — é o contexto que faz reconhecer o trecho certo sem sair da busca.
 * A barra de ordenação e a paginação no rodapé completam o mesmo painel.
 */
export default function SearchPanel({ guildId }: { guildId: string | null }) {
  const query = useMessages((s) => s.searchQuery);
  const results = useMessages((s) => s.searchResults);
  const searching = useMessages((s) => s.searching);
  const clearSearch = useMessages((s) => s.clearSearch);
  const porCanal = useMessages((s) => s.byChannel);
  const canais = useChannels((s) => s.channels);
  const [ordem, setOrdem] = useState<Ordem>("novas");
  const [pagina, setPagina] = useState(0);

  const filtros = parseSearchQuery(query);
  const termo = filtros.text.trim();

  const ordenados = useMemo(() => {
    const lista = [...(results ?? [])];
    if (ordem === "novas") {
      return lista.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    // "Relevantes" sem apoio do servidor: quantas vezes o termo aparece,
    // desempatando pela mais recente. Ver a nota sobre `sort` no contrato.
    const alvo = termo.toLowerCase();
    const peso = (m: Message) =>
      alvo ? m.content.toLowerCase().split(alvo).length - 1 : 0;
    return lista.sort((a, b) => peso(b) - peso(a) || b.createdAt.localeCompare(a.createdAt));
  }, [results, ordem, termo]);

  const total = ordenados.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const visiveis = ordenados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  // busca nova (ou outra ordem) recomeça da primeira página
  useEffect(() => setPagina(0), [results, ordem]);

  if (results === null && !searching) return null;

  function nomeDoCanal(channelId: string): string {
    const canal = canais.find((c) => c.id === channelId);
    return canal?.name ? `#${canal.name}` : "Conversa";
  }

  /**
   * Vizinhas da mensagem, quando o canal dela já está carregado. A busca do
   * servidor devolve só a mensagem — pedir a janela de cada resultado seria uma
   * ida ao servidor por linha.
   */
  function contextoDe(m: Message): { antes?: Message | null; depois?: Message | null } {
    const itens = porCanal[m.channelId]?.items;
    if (!itens) return {};
    const i = itens.findIndex((x) => x.id === m.id);
    if (i < 0) return {};
    return { antes: itens[i - 1] ?? null, depois: itens[i + 1] ?? null };
  }

  return (
    <aside
      aria-label="Resultados da busca"
      className="flex w-[26rem] shrink-0 flex-col border-l border-black/20 bg-background-base-lowest"
    >
      <div className="flex h-[49px] shrink-0 items-center gap-2 border-b border-border-subtle px-4 shadow-elevation-low">
        <Search size={18} aria-hidden="true" className="text-text-muted" />
        <span className="min-w-0 flex-1 truncate font-semibold text-text-strong">
          {searching ? "Buscando…" : `${total} ${total === 1 ? "resultado" : "resultados"}`}
        </span>
        <BotaoDeIcone rotulo="Fechar a busca" icone={<X size={20} />} onClick={clearSearch} />
      </div>

      {/* ordenação: a barra fica acima dos resultados, como no Discord */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-3 py-1.5">
        {(
          [
            ["novas", "Novas"],
            ["relevantes", "Relevantes"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setOrdem(valor)}
            aria-pressed={ordem === valor}
            className={`rounded-[3px] px-2 py-0.5 text-xs font-semibold uppercase transition ${
              ordem === valor ? "bg-interactive-background-selected text-text-strong" : "text-text-muted hover:text-text-default"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {(filtros.from ||
          filtros.in ||
          filtros.has.length > 0 ||
          filtros.before ||
          filtros.after ||
          filtros.mentions) && (
          <div className="mb-2 flex flex-wrap gap-1 px-1">
            {filtros.from && <Ficha rotulo={`de @${filtros.from}`} ativo />}
            {filtros.in && <Ficha rotulo={`em #${filtros.in}`} ativo />}
            {filtros.mentions && <Ficha rotulo={`menciona @${filtros.mentions}`} ativo />}
            {filtros.has.map((h) => (
              <Ficha key={h} rotulo={`tem ${h}`} ativo />
            ))}
            {filtros.before && <Ficha rotulo={`antes de ${filtros.before}`} ativo />}
            {filtros.after && <Ficha rotulo={`depois de ${filtros.after}`} ativo />}
          </div>
        )}

        {!searching && total === 0 && (
          <div className="p-4 text-center">
            <p className="text-sm text-text-muted">Nada encontrado.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-1">
              {FILTROS.map(([prefixo, o]) => (
                <Ficha key={prefixo} rotulo={`${prefixo} ${o}`} />
              ))}
            </div>
          </div>
        )}

        {visiveis.map((m) => (
          <MessagePreview
            key={m.id}
            message={m}
            realce={termo || undefined}
            contexto={contextoDe(m)}
            className="mb-2 last:mb-0"
            acima={
              <div className="mb-1 truncate pr-10 text-xs font-medium text-text-subtle">
                {nomeDoCanal(m.channelId)}
              </div>
            }
            acoes={
              <AcaoDoCartao
                label="Saltar"
                onClick={() =>
                  void goToMessage({ guildId, channelId: m.channelId, messageId: m.id })
                }
              >
                <CornerUpRight size={16} />
              </AcaoDoCartao>
            }
          />
        ))}
      </div>

      {total > POR_PAGINA && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border-subtle px-3 py-2">
          <BotaoDeIcone
            rotulo="Página anterior"
            icone={<ChevronLeft size={18} />}
            tamanho="sm"
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0}
          />
          <span className="text-xs text-text-muted">
            {pagina + 1} de {paginas}
          </span>
          <BotaoDeIcone
            rotulo="Próxima página"
            icone={<ChevronRight size={18} />}
            tamanho="sm"
            onClick={() => setPagina((p) => Math.min(paginas - 1, p + 1))}
            disabled={pagina >= paginas - 1}
          />
        </div>
      )}
    </aside>
  );
}

/** Pílula de filtro: reconhecido na consulta (`ativo`) ou apenas sugerido. */
function Ficha({ rotulo, ativo = false }: { rotulo: string; ativo?: boolean }) {
  return (
    <span
      className={`rounded-[3px] px-1.5 py-0.5 text-xs font-medium ${
        ativo ? "bg-brand-500/20 text-text-strong" : "bg-input-background-default text-text-muted"
      }`}
    >
      {rotulo}
    </span>
  );
}
