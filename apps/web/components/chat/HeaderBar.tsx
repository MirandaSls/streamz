"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Bell, HelpCircle, Inbox, Pin, Search } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";

/** Botão de ícone da toolbar do cabeçalho (24px, hover claro, ativo branco). */
export function HeaderIcon({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
}: {
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip label={disabled ? `${label} (em breve)` : label} side="bottom">
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        aria-label={label}
        aria-disabled={disabled}
        aria-pressed={active || undefined}
        className={`grid h-6 w-6 place-items-center transition ${
          disabled
            ? "cursor-not-allowed text-txt-secondary opacity-50"
            : active
              ? "text-txt-primary"
              : "text-txt-secondary hover:text-txt-primary"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * Cabeçalho de 48px da área principal: ícone + nome à esquerda, toolbar à
 * direita (com a busca que se expande ao focar), como no Discord.
 */
export default function HeaderBar({
  icon,
  title,
  subtitle,
  tools,
  bell,
  searchLabel,
  onSearch,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** botões antes da busca (variam entre canal e DM). */
  tools?: ReactNode;
  /** sino de notificação do canal; sem ele, o botão fica no estado "em breve". */
  bell?: ReactNode;
  searchLabel: string;
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState("");

  return (
    <header className="relative z-10 flex h-12 shrink-0 items-center gap-2 px-4 shadow-header">
      <span className="text-txt-muted" aria-hidden="true">
        {icon}
      </span>
      <h1 className="truncate font-semibold text-txt-primary">{title}</h1>
      {subtitle && (
        <>
          <span aria-hidden="true" className="mx-2 h-6 w-px bg-[#3f4147]" />
          <span className="truncate text-sm text-txt-muted">{subtitle}</span>
        </>
      )}

      <div className="ml-auto flex items-center gap-4">
        {tools}
        <HeaderIcon label="Mensagens fixadas" disabled>
          <Pin size={24} />
        </HeaderIcon>
        {bell ?? (
          <HeaderIcon label="Configurações de notificação" disabled>
            <Bell size={24} />
          </HeaderIcon>
        )}
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
            className="h-6 w-36 rounded-[4px] bg-rail pl-1.5 pr-6 text-sm text-txt-normal outline-none transition-all placeholder:text-txt-muted focus:w-60"
          />
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5 top-1 text-txt-muted"
          />
        </form>
        <HeaderIcon label="Caixa de entrada" disabled>
          <Inbox size={24} />
        </HeaderIcon>
        <HeaderIcon label="Ajuda" disabled>
          <HelpCircle size={24} />
        </HeaderIcon>
      </div>
    </header>
  );
}
