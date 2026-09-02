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
  searchPlaceholder,
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
  /** vai no placeholder: no Discord é "Buscar <usuário>", não um "Buscar" solto. */
  searchPlaceholder?: string;
  /** consulta em vigor — mantém o campo preenchido ao reabrir a busca. */
  searchValue?: string;
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState(searchValue ?? "");

  return (
    <header className="relative z-10 flex h-[49px] shrink-0 items-center gap-2 border-b border-border px-4 shadow-header">
      <span className="text-txt-muted" aria-hidden="true">
        {icon}
      </span>
      {/* `min-w-0` é o que faz o `truncate` valer dentro de um flex: sem ele o
          título empurra a toolbar para fora em vez de cortar o próprio texto */}
      <h1 className="min-w-0 truncate font-semibold text-txt-primary">{title}</h1>
      {subtitle && (
        <>
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-border" />
          <span className="truncate text-sm text-txt-muted">{subtitle}</span>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-4">
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
            placeholder={searchPlaceholder ?? "Buscar"}
            title="Filtros: from:@usuário in:#canal has:link|image|file before:AAAA-MM-DD after:AAAA-MM-DD mentions:@usuário"
            /* fixa, não mais expansível: no Discord a caixa já nasce do tamanho
               final. A busca que cresce ao focar empurrava os ícones vizinhos e
               fazia a barra inteira dançar a cada clique. */
            className="h-[30px] w-[245px] rounded-lg bg-rail pl-2.5 pr-8 text-sm text-txt-normal outline-none placeholder:text-txt-muted"
          />
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-[7px] text-txt-muted"
          />
        </form>
      </div>
    </header>
  );
}
