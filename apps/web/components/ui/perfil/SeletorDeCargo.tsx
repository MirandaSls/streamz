"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { comparavel } from "@/components/permissoes/alvos";
import { AncoraDoPopout, Popout } from "@/components/ui/primitivos";
import { COR_DE_CARGO_SEM_COR } from "@/lib/cor-de-cargo";

/**
 * Popover do "+" das pílulas de cargo (cartão 5, seção L do print `s10`):
 * campo de busca "Cargo" no topo e, embaixo, a lista rolável dos cargos que
 * o membro ainda não tem — a mesma lista que `abrirMenuDeCargos`
 * (`ProfilePopover.tsx`) hoje monta como `ContextMenu` genérico. O Discord usa
 * um popover próprio com campo de texto, e o `ContextMenu` (que só sabe
 * `MenuItem`) não tem onde pôr um `<input>` — por isso um componente à parte,
 * em vez de mais uma opção do menu.
 *
 * ## Forma (print `s10`)
 *
 * Campo "Cargo" no topo, borda de foco na cor de marca (`focus:border-
 * input-border-active`, a mesma regra do campo do quick switcher: "o campo em
 * foco é marca"). Abaixo, a lista: bolinha colorida (cor do cargo; cinza
 * `--role-default` sem cor, como nas pílulas do cartão) + nome. Sem número de
 * cargo por linha, sem separador entre campo e lista além do respiro.
 *
 * ~280px de largura e ~5,5 itens visíveis antes de rolar (não medido em
 * print 1:1; a largura e a contagem vêm da descrição da entrega). Item de
 * 32px (`h-8`, o mesmo passo da linha do menu de contexto) × 5,5 = 176.
 *
 * ## Mecânica
 *
 * `Popout` cuida de posição (abaixo do "+", vira para cima sem espaço),
 * camada (nasce por cima do cartão porque é aberto **enquanto o cartão já
 * está aberto** — a pilha do `Popout` sempre põe o filho acima do pai), Esc,
 * clique fora e foco preso/devolvido. Este arquivo só cuida do campo, do
 * filtro e da navegação por seta/Enter — não há `MenuItem` aqui.
 */

/** x=1093..~1450 no print (largura da caixa, sem a lista de nomes tirar decimais exatos). */
const LARGURA = 280;
/** altura de uma linha da lista — o mesmo passo do `ContextMenu` (`h-8`, 32px). */
const ALTURA_DO_ITEM = 32;
/** 5,5 itens visíveis antes de rolar, como pedido na entrega. */
const ITENS_VISIVEIS = 5.5;

export interface CargoParaSelecao {
  id: string;
  name: string;
  color?: string | null;
}

/**
 * Filtra os cargos pelo texto digitado — sem acento nem caixa, a mesma regra
 * do "+" da tela de permissões (`comparavel`, `components/permissoes/alvos.ts`).
 * Busca vazia devolve a lista inteira, na ordem recebida (quem ordena por
 * posição de cargo é quem monta a lista, não este filtro).
 */
export function filtrarCargos(
  cargos: readonly CargoParaSelecao[],
  busca: string,
): CargoParaSelecao[] {
  const alvo = comparavel(busca.trim());
  if (!alvo) return [...cargos];
  return cargos.filter((c) => comparavel(c.name).includes(alvo));
}

export interface SeletorDeCargoProps {
  aberto: boolean;
  /** o botão "+" que abriu — o popover nasce ancorado nele. */
  ancora: AncoraDoPopout;
  /** cargos atribuíveis que o membro ainda não tem (já filtrados por permissão/teto). */
  cargos: readonly CargoParaSelecao[];
  /** mesma ação do menu antigo: `toggleRole(user.id, cargo.id, true)`. */
  onEscolher: (cargo: CargoParaSelecao) => void;
  onFechar: () => void;
}

export function SeletorDeCargo({ aberto, ancora, cargos, onEscolher, onFechar }: SeletorDeCargoProps) {
  const [busca, setBusca] = useState("");
  const [cursor, setCursor] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  // reabrir começa sempre com o campo vazio e o primeiro item em destaque
  useEffect(() => {
    if (aberto) {
      setBusca("");
      setCursor(0);
    }
  }, [aberto]);

  const resultados = useMemo(() => filtrarCargos(cargos, busca), [cargos, busca]);

  // busca nova recomeça a seleção do topo — "Enter adiciona o primeiro"
  useEffect(() => setCursor(0), [busca]);

  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function escolher(cargo: CargoParaSelecao | undefined) {
    if (!cargo) return;
    onEscolher(cargo);
    onFechar();
  }

  if (!aberto) return null;

  return (
    <Popout
      aberto={aberto}
      aoFechar={onFechar}
      ancora={ancora}
      lado="bottom"
      alinhamento="start"
      largura={LARGURA}
      rotulo="Adicionar cargo"
      className="flex flex-col gap-1.5 p-1.5"
    >
      <input
        data-autofocus
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, Math.max(resultados.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            escolher(resultados[cursor]);
          }
        }}
        placeholder="Cargo"
        aria-label="Buscar cargo"
        aria-controls="seletor-de-cargo-resultados"
        className="h-8 w-full shrink-0 rounded border border-input-border-default bg-input-background-default px-2 text-text-sm text-text-default outline-none placeholder:text-input-placeholder-text-default focus:border-input-border-active"
      />
      <ul
        id="seletor-de-cargo-resultados"
        ref={listaRef}
        role="listbox"
        aria-label="Cargos disponíveis"
        style={{ maxHeight: ALTURA_DO_ITEM * ITENS_VISIVEIS }}
        className="flex flex-col gap-0.5 overflow-y-auto"
      >
        {resultados.length === 0 && (
          <li className="px-2 py-3 text-center text-text-xs text-text-muted">Nenhum cargo encontrado</li>
        )}
        {resultados.map((cargo, indice) => (
          <li key={cargo.id} role="option" aria-selected={indice === cursor}>
            <button
              type="button"
              data-indice={indice}
              onMouseEnter={() => setCursor(indice)}
              onClick={() => escolher(cargo)}
              className={`flex h-8 w-full min-w-0 items-center gap-2 rounded px-2 text-left text-text-sm text-text-default ${
                indice === cursor ? "bg-interactive-background-selected" : "hover:bg-interactive-background-hover"
              }`}
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: cargo.color ?? COR_DE_CARGO_SEM_COR }}
                className="h-3 w-3 shrink-0 rounded-full"
              />
              <span className="min-w-0 truncate">{cargo.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Popout>
  );
}

export default SeletorDeCargo;
