"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Search } from "@/components/ui/icones";
import Avatar from "@/components/ui/Avatar";
import PopoverFlutuante from "@/components/ui/PopoverFlutuante";
import type { PublicUser } from "@streamz/shared";
import type { Alvo } from "@/components/permissoes/alvos";

/**
 * A caixinha do "+" da coluna de cargos e membros.
 *
 * Usa o `PopoverFlutuante` do app (portal, posição presa à janela) e não um
 * `absolute` local: esta coluna vive dentro do miolo rolável da
 * `JanelaDeConfiguracoes`, que tem `overflow-y-auto` — uma caixa posicionada
 * por CSS ali seria cortada pela borda do scroller assim que passasse da
 * metade da lista.
 *
 * O campo de busca é o mesmo desenho do da barra lateral das configurações
 * (lupa à esquerda, borda que acende no foco), porque é o mesmo gesto.
 */
export default function AdicionarAlvoPopover({
  ancora,
  aberto,
  onFechar,
  alvos,
  filtro,
  onFiltro,
  onEscolher,
  usuario,
}: {
  ancora: RefObject<HTMLElement | null>;
  aberto: boolean;
  onFechar: () => void;
  /** os que ainda não têm regra, já filtrados por `filtro`. */
  alvos: Alvo[];
  filtro: string;
  onFiltro: (valor: string) => void;
  onEscolher: (alvo: Alvo) => void;
  /** o `PublicUser` de um membro, para a linha ter avatar como no resto do app. */
  usuario: (id: string) => PublicUser | null;
}) {
  const campoRef = useRef<HTMLInputElement>(null);
  // abrir e já poder digitar: a lista costuma ter dezenas de nomes, e chegar
  // até ela pelo mouse para depois voltar ao teclado é o passo que sobra
  useEffect(() => {
    if (aberto) campoRef.current?.focus();
  }, [aberto]);

  return (
    <PopoverFlutuante
      ancora={ancora}
      aberto={aberto}
      onFechar={onFechar}
      rotulo="Adicionar cargo ou membro"
      largura={260}
      denso
    >
      <div className="relative mb-1">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted"
        />
        <input
          ref={campoRef}
          value={filtro}
          onChange={(e) => onFiltro(e.target.value)}
          placeholder="Cargo ou membro"
          aria-label="Buscar cargo ou membro"
          className="h-8 w-full rounded-[4px] border border-border-strong bg-transparent pl-8 pr-2 text-sm text-txt-normal outline-none transition-colors placeholder:text-txt-muted focus:border-accent celular:h-[44px] celular:text-[max(16px,1em)]"
        />
      </div>

      <div className="max-h-[220px] overflow-y-auto">
        {alvos.length === 0 ? (
          <p className="px-2 py-2 text-sm text-txt-muted">Ninguém mais para adicionar.</p>
        ) : (
          alvos.map((alvo) => {
            const user = alvo.tipo === "membro" ? usuario(alvo.id) : null;
            return (
              <button
                key={alvo.chave}
                type="button"
                onClick={() => onEscolher(alvo)}
                className="flex h-8 celular:h-[44px] w-full items-center gap-2 rounded-[3px] px-2 text-left text-sm text-txt-normal transition hover:bg-hov"
              >
                {user ? (
                  <Avatar user={user} size="sm" surface="border-overlay" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-txt-muted"
                    // a cor do cargo é dado do servidor, não token de tema:
                    // vem por `style`, como no resto do app
                    style={alvo.cor ? { backgroundColor: alvo.cor } : undefined}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{alvo.nome}</span>
              </button>
            );
          })
        )}
      </div>
    </PopoverFlutuante>
  );
}

/** Estado do filtro, para quem abre a caixa não precisar guardá-lo. */
export function useFiltroDeAlvo(aberto: boolean) {
  const [filtro, setFiltro] = useState("");
  // fechar e reabrir com a busca antiga escondida esconderia metade da lista
  useEffect(() => {
    if (!aberto) setFiltro("");
  }, [aberto]);
  return { filtro, setFiltro };
}
