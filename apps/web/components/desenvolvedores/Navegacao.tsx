"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "@/components/ui/icones";
import { TextInput } from "@/components/ui/primitivos";
import { PastilhaDeMetodo } from "@/components/desenvolvedores/Campos";
import {
  ANCORA_DOS_ERROS,
  TITULO_DOS_ERROS,
  buscar,
  hrefDaAncora,
  type Indice,
  type ItemDeBusca,
} from "@/components/desenvolvedores/especificacao";

/**
 * A navegação da referência: busca em cima, árvore por tag embaixo.
 *
 * **Uma caixa só faz as duas coisas.** Enquanto está vazia, a árvore mostra
 * tudo; com texto, ela vira a lista de resultados — rota, campo, esquema e
 * guia misturados, na ordem de relevância. Ter um filtro na coluna e uma busca
 * no topo seria duas caixas respondendo à mesma pergunta, e a pessoa nunca
 * sabe em qual digitar.
 *
 * **O campo acha campo.** Quem procura `retry_after` não sabe em qual esquema
 * ele mora — é exatamente por isso que está procurando. Uma busca que só acha
 * rota devolve nada e parece quebrada.
 */
export interface NavegacaoProps {
  indice: Indice | null;
  ancoraAtiva: string;
  /** chamado ao clicar num item — no celular é o que fecha a gaveta. */
  aoNavegar?: () => void;
  /** sufixo dos `id` internos: a navegação aparece duas vezes (coluna e gaveta). */
  instancia: string;
}

interface ItemDeNav {
  ancora: string;
  rotulo: string;
  metodo?: string;
}

interface BlocoDeNav {
  id: string;
  rotulo: string;
  ancoraDoBloco?: string;
  itens: ItemDeNav[];
}

export function Navegacao({ indice, ancoraAtiva, aoNavegar, instancia }: NavegacaoProps) {
  const [termo, setTermo] = useState("");
  const [fechados, setFechados] = useState<Record<string, boolean>>({});
  const ativo = useRef<HTMLAnchorElement | null>(null);

  const blocos = useMemo<BlocoDeNav[]>(() => {
    const lista: BlocoDeNav[] = [
      {
        id: "comecar",
        rotulo: "Começar",
        itens: [{ ancora: "primeiros-passos", rotulo: "Rode o seu primeiro bot" }],
      },
    ];
    // os guias saem da especificação, **na ordem dela**; os códigos de erro são
    // o bloco `x-` que não pertence a guia nenhum e fecha a lista
    const conceitos: ItemDeNav[] = (indice?.guias ?? []).map((g) => ({ ancora: g.id, rotulo: g.titulo }));
    if (indice?.erros.length) conceitos.push({ ancora: ANCORA_DOS_ERROS, rotulo: TITULO_DOS_ERROS });
    if (conceitos.length) {
      lista.push({ id: "conceitos", rotulo: "Conceitos", ancoraDoBloco: "guias", itens: conceitos });
    }
    for (const grupo of indice?.grupos ?? []) {
      lista.push({
        id: grupo.id,
        rotulo: grupo.nome,
        ancoraDoBloco: grupo.id,
        itens: grupo.rotas.map((r) => ({ ancora: r.id, rotulo: r.titulo, metodo: r.metodo })),
      });
    }
    if (indice?.esquemas.length) {
      lista.push({
        id: "esquemas",
        rotulo: "Esquemas",
        ancoraDoBloco: "esquemas",
        itens: indice.esquemas.map((e) => ({ ancora: e.id, rotulo: e.nome })),
      });
    }
    return lista;
  }, [indice]);

  const resultados = useMemo(() => buscar(indice?.busca ?? [], termo), [indice, termo]);
  const buscando = termo.trim().length > 0;

  // O item ativo tem de estar à vista: numa referência com dezenas de rotas o
  // realce acontece fora da parte visível da coluna, e a navegação parece não
  // acompanhar a rolagem. `nearest` não mexe na página, só na coluna.
  useEffect(() => {
    if (buscando) return;
    ativo.current?.scrollIntoView({ block: "nearest" });
  }, [ancoraAtiva, buscando]);

  return (
    <nav aria-label="Navegação da documentação" className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0">
        <TextInput
          type="search"
          tamanho={36}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          aoLimpar={() => setTermo("")}
          placeholder="Buscar rota, campo ou esquema"
          aria-label="Buscar na documentação"
          prefixo={<Search size={16} aria-hidden="true" />}
        />
      </div>

      {buscando ? (
        <div className="min-h-0 flex-1 overflow-y-auto scroller-thin">
          <p aria-live="polite" className="px-1 pb-2 text-text-xs text-text-muted">
            {resultados.length === 0
              ? "Nada encontrado."
              : `${resultados.length} resultado${resultados.length > 1 ? "s" : ""}`}
          </p>
          {resultados.length === 0 ? (
            <p className="px-1 text-text-sm text-text-muted">
              Tente o nome da rota (<code className="font-mono">criar mensagem</code>), o caminho (
              <code className="font-mono">/channels</code>) ou o nome de um campo (
              <code className="font-mono">content</code>).
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {resultados.map((item, i) => (
                <li key={`${item.ancora}:${item.titulo}:${i}`}>
                  <LinkDeResultado item={item} aoNavegar={aoNavegar} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto scroller-thin pb-8">
          {blocos.map((bloco) => {
            const aberto = !fechados[bloco.id];
            const idDaLista = `nav:${instancia}:${bloco.id}`;
            return (
              <div key={bloco.id} className="mb-1">
                <div className="flex items-center gap-1">
                  {bloco.ancoraDoBloco ? (
                    <a
                      href={hrefDaAncora(bloco.ancoraDoBloco)}
                      onClick={aoNavegar}
                      className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-text-xs font-semibold uppercase tracking-wide text-text-muted hover:text-text-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                    >
                      {bloco.rotulo}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate px-2 py-1.5 text-text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {bloco.rotulo}
                    </span>
                  )}
                  {bloco.itens.length > 1 ? (
                    <button
                      type="button"
                      aria-expanded={aberto}
                      aria-controls={idDaLista}
                      aria-label={`${aberto ? "Recolher" : "Expandir"} ${bloco.rotulo}`}
                      onClick={() => setFechados((atual) => ({ ...atual, [bloco.id]: aberto }))}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted hover:bg-interactive-background-hover hover:text-text-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                    >
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={`transition-transform ${aberto ? "" : "-rotate-90"}`}
                      />
                    </button>
                  ) : null}
                </div>
                <ul id={idDaLista} hidden={!aberto} className="flex flex-col gap-0.5">
                  {bloco.itens.map((item) => {
                    const selecionado = item.ancora === ancoraAtiva;
                    return (
                      <li key={item.ancora}>
                        <a
                          ref={selecionado ? ativo : undefined}
                          href={hrefDaAncora(item.ancora)}
                          onClick={aoNavegar}
                          aria-current={selecionado ? "true" : undefined}
                          className={`flex min-h-[32px] items-center gap-2 rounded px-2 py-1 text-text-sm transition-colors celular:min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus ${
                            selecionado
                              ? "bg-interactive-background-selected font-medium text-text-strong"
                              : "text-text-subtle hover:bg-interactive-background-hover hover:text-text-default"
                          }`}
                        >
                          {item.metodo ? (
                            <span className="w-[52px] shrink-0 font-mono text-text-xxs font-bold uppercase text-text-muted">
                              {item.metodo}
                            </span>
                          ) : null}
                          <span className="min-w-0 truncate">{item.rotulo}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </nav>
  );
}

const ROTULO_DO_TIPO: Record<ItemDeBusca["tipo"], string> = {
  rota: "Rota",
  esquema: "Esquema",
  campo: "Campo",
  guia: "Guia",
};

function LinkDeResultado({ item, aoNavegar }: { item: ItemDeBusca; aoNavegar?: () => void }) {
  const metodo = item.tipo === "rota" ? item.detalhe.split(" ")[0] : null;
  return (
    <a
      href={hrefDaAncora(item.ancora)}
      onClick={aoNavegar}
      className="flex min-h-[44px] flex-col gap-0.5 rounded px-2 py-1.5 text-text-sm text-text-subtle hover:bg-interactive-background-hover hover:text-text-default focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus"
    >
      <span className="flex items-center gap-2">
        {metodo ? <PastilhaDeMetodo metodo={metodo} /> : null}
        <span className="min-w-0 truncate font-medium text-text-default">{item.titulo}</span>
      </span>
      <span className="truncate font-mono text-text-xs text-text-muted">
        {item.tipo === "rota" ? item.detalhe.split(" ").slice(1).join(" ") : `${ROTULO_DO_TIPO[item.tipo]} · ${item.detalhe}`}
      </span>
    </a>
  );
}
