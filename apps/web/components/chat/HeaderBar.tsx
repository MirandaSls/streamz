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
 *
 * Quem chama entrega a fileira inteira em `tools`, na ordem do Discord — o
 * alfinete fica no meio dela (threads → alfinete → membros no servidor;
 * telefone → vídeo → alfinete → adicionar → perfil na conversa), então não há
 * um lugar fixo "das fixadas" aqui.
 *
 * Medido no print do Discord (1919px): caixas de 24px com 18px entre elas
 * (passo de 42); a busca tem 244×32, raio 8, borda de 1px mais clara que o
 * fundo, texto a 8px da borda e a lupa a 5px da borda direita.
 */
export default function HeaderBar({
  icon,
  title,
  subtitle,
  tools,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearch,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** botões antes da busca, já na ordem (variam entre canal e DM). */
  tools?: ReactNode;
  searchLabel: string;
  /** vai no placeholder: no Discord é "Buscar <servidor|usuário|grupo>", não um "Buscar" solto. */
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

      <div className="ml-auto flex shrink-0 items-center gap-[18px]">
        {tools}
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
               fazia a barra inteira dançar a cada clique.
               `bg-panel` é o token mais perto do preenchimento medido
               (23,23,26); `border` é o mais perto da borda (48,48,53). */
            className="h-8 w-[244px] rounded-lg border border-border bg-panel pl-2 pr-[30px] text-sm text-txt-normal outline-none placeholder:text-txt-muted"
          />
          <Search
            size={17}
            aria-hidden="true"
            className="pointer-events-none absolute right-[5px] top-1/2 -translate-y-1/2 text-txt-muted"
          />
        </form>
      </div>
    </header>
  );
}
