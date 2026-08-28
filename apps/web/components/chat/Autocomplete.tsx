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
  /** cor do rótulo — cargo do membro ou cor do próprio cargo. */
  cor?: string;
  /** avatar, imagem do emoji, ícone do canal. */
  icone?: ReactNode;
}

/** Como cada gatilho nomeia a seção, já preparado para receber o termo. */
const TITULO: Record<string, string> = {
  ":": "EMOJIS CORRESPONDENDO A",
  "@": "MEMBROS CORRESPONDENDO A",
  "#": "CANAIS DE TEXTO CORRESPONDENDO A",
  "/": "COMANDOS CORRESPONDENDO A",
};

/**
 * Lista de sugestões do composer (`:` `@` `#` `/`).
 *
 * Só desenha: quem detecta o gatilho, monta os itens e trata as teclas é o
 * composer — o campo de texto precisa continuar sendo o dono do foco, senão
 * digitar e escolher com o teclado brigariam. Por isso o item selecionado chega
 * por prop e a navegação por seta acontece lá.
 *
 * O painel **encosta** no composer (sem folga, com o raio só em cima): a folga
 * de 8px fazia a lista parecer um popup solto em vez da continuação do campo.
 */
export default function Autocomplete({
  titulo,
  termo,
  gatilho,
  itens,
  selecionado,
  onEscolher,
  onPassarMouse,
}: {
  /** rótulo genérico da seção, usado quando o gatilho não tem título próprio. */
  titulo: string;
  /** o que já foi digitado depois do gatilho — entra no título da seção. */
  termo?: string;
  gatilho?: string;
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

  const base = (gatilho && TITULO[gatilho]) ?? titulo.toUpperCase();
  const cabecalho = gatilho ? `${base} ${gatilho}${termo ?? ""}` : base;

  return (
    <div className="absolute bottom-full left-4 right-4 z-[60] overflow-hidden rounded-t-lg bg-panel shadow-high">
      <p className="px-3 py-2 text-xs font-semibold uppercase text-txt-muted">{cabecalho}</p>
      <ul ref={listaRef} role="listbox" aria-label={cabecalho} className="max-h-[360px] overflow-y-auto pb-1">
        {itens.map((item, i) => (
          <li key={item.chave}>
            <button
              type="button"
              role="option"
              aria-selected={i === selecionado}
              // passar o mouse já move a seleção: um `hover:` por cima disso
              // acendia duas linhas ao mesmo tempo
              onMouseEnter={() => onPassarMouse(i)}
              // mousedown em vez de click: o clique tiraria o foco do textarea
              // antes de a escolha ser aplicada, e o popup fecharia no meio
              onMouseDown={(e) => {
                e.preventDefault();
                onEscolher(item);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                i === selecionado ? "bg-sel" : ""
              }`}
            >
              {item.icone && <span className="grid h-6 w-6 shrink-0 place-items-center">{item.icone}</span>}
              <span
                style={item.cor ? { color: item.cor } : undefined}
                className="truncate text-sm font-medium text-txt-normal"
              >
                {item.rotulo}
              </span>
              {item.detalhe && (
                <span className="ml-auto truncate pl-2 text-xs text-txt-muted">{item.detalhe}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-3 border-t border-black/20 px-3 py-1.5 text-[11px] text-txt-muted">
        <span>
          <kbd className="font-sans font-semibold">↑↓</kbd> navegar
        </span>
        <span>
          <kbd className="font-sans font-semibold">enter</kbd> escolher
        </span>
        <span>
          <kbd className="font-sans font-semibold">esc</kbd> sair
        </span>
      </p>
    </div>
  );
}
