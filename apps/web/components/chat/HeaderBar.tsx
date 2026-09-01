"use client";

import { useState, type ReactNode } from "react";
import { Search } from "@/components/ui/icones";

export { default as HeaderIcon } from "@/components/chat/HeaderIcon";

/**
 * Cabeçalho de 48px da área principal: ícone + nome à esquerda, toolbar à
 * direita (com a busca que se expande ao focar), como no Discord.
 *
 * A toolbar carrega só o que age sobre o canal aberto: ações genéricas do app
 * (ajuda, caixa de entrada) e o que já existe no menu de contexto do canal
 * (sino, configurações do servidor) ficam de fora para não poluir a barra.
 */
export default function HeaderBar({
  icon,
  title,
  subtitle,
  tools,
  pins,
  searchLabel,
  searchValue,
  onSearch,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** botões antes da busca (variam entre canal e DM). */
  tools?: ReactNode;
  /** botão de mensagens fixadas do canal aberto. */
  pins?: ReactNode;
  searchLabel: string;
  /** consulta em vigor — mantém o campo preenchido ao reabrir a busca. */
  searchValue?: string;
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState(searchValue ?? "");

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center gap-2 px-4 shadow-header">
      <span className="text-txt-muted" aria-hidden="true">
        {icon}
      </span>
      <h1 className="truncate font-semibold text-txt-primary">{title}</h1>
      {subtitle && (
        <>
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-border" />
          <span className="truncate text-sm text-txt-muted">{subtitle}</span>
        </>
      )}

      <div className="ml-auto flex items-center gap-4">
        {tools}
        {pins}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(query);
          }}
          className="relative"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            aria-label={searchLabel}
            placeholder="Buscar"
            title="Filtros: from:@usuário in:#canal has:link|image|file before:AAAA-MM-DD after:AAAA-MM-DD mentions:@usuário"
            className="h-6 w-36 rounded-[4px] bg-rail pl-1.5 pr-6 text-sm text-txt-normal outline-none transition-all placeholder:text-txt-muted focus:w-60"
          />
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5 top-1 text-txt-muted"
          />
        </form>
      </div>
    </header>
  );
}
