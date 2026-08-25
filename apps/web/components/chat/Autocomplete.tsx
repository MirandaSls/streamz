"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Uma linha da lista de sugestões. */
export interface ItemAutocomplete {
  chave: string;
  /** texto que entra no composer no lugar do gatilho (já com `@`, `#`…). */
  valor: string;
  rotulo: string;
  /** segunda linha/coluna: username por trás do apelido, descrição do comando. */
  detalhe?: string;
  /** avatar, imagem do emoji, ícone do canal. */
  icone?: ReactNode;
}

/**
 * Lista de sugestões do composer (`:` `@` `#` `/`).
 *
 * Só desenha: quem detecta o gatilho, monta os itens e trata as teclas é o
 * composer — o campo de texto precisa continuar sendo o dono do foco, senão
 * digitar e escolher com o teclado brigariam. Por isso o item selecionado chega
 * por prop e a navegação por seta acontece lá.
 */
export default function Autocomplete({
  titulo,
  itens,
  selecionado,
  onEscolher,
  onPassarMouse,
}: {
  titulo: string;
  itens: ItemAutocomplete[];
  selecionado: number;
  onEscolher: (item: ItemAutocomplete) => void;
  onPassarMouse: (indice: number) => void;
}) {
  const listaRef = useRef<HTMLUListElement>(null);

  // mantém o selecionado visível quando a navegação é por teclado
  useEffect(() => {
    const el = listaRef.current?.children[selecionado] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selecionado]);

  if (itens.length === 0) return null;

  return (
    <div className="absolute bottom-full left-4 right-4 z-[60] mb-2 overflow-hidden rounded-lg bg-panel shadow-high">
      <p className="px-3 py-2 text-xs font-semibold uppercase text-txt-muted">{titulo}</p>
      <ul ref={listaRef} role="listbox" aria-label={titulo} className="max-h-[260px] overflow-y-auto pb-1">
        {itens.map((item, i) => (
          <li key={item.chave}>
            <button
              type="button"
              role="option"
              aria-selected={i === selecionado}
              onMouseEnter={() => onPassarMouse(i)}
              // mousedown em vez de click: o clique tiraria o foco do textarea
              // antes de a escolha ser aplicada, e o popup fecharia no meio
              onMouseDown={(e) => {
                e.preventDefault();
                onEscolher(item);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                i === selecionado ? "bg-sel" : "hover:bg-hov"
              }`}
            >
              {item.icone && <span className="grid h-6 w-6 shrink-0 place-items-center">{item.icone}</span>}
              <span className="truncate text-sm font-medium text-txt-normal">{item.rotulo}</span>
              {item.detalhe && (
                <span className="ml-auto truncate pl-2 text-xs text-txt-muted">{item.detalhe}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
