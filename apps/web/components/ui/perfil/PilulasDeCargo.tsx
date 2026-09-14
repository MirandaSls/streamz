"use client";

import { Plus, X } from "@/components/ui/icones";
import { COR_DE_CARGO_SEM_COR } from "@/lib/cor-de-cargo";

/**
 * Cargos do membro no cartão de perfil: pílulas soltas no corpo, sem rótulo
 * "CARGOS" (os dois prints 1:1 não têm rótulo de seção).
 *
 * Medidas:
 *
 * - **Pílula**: altura mínima 24, borda 1px `--border-subtle`, raio
 *   `--radius-sm` (8), respiro 2 à esquerda e 8 à direita (`.role_af3987`,
 *   `css-bruto/ad8f293cdb13fa7e.css`). No print `2026-09-01 113603` a
 *   segunda fila começa com a borda em x=721 e o disco em x=728 = 721 + 1 + 2 +
 *   4, e as filas ficam a 4px uma da outra (coluna x=725: y=590–611 e 618…).
 * - **Disco da cor**: 12 × 12 com 4 de margem dos lados (`.roleCircle__4f569`,
 *   `css-bruto/858942.086f3345af1722be.css`); no print, x=728–739.
 * - **×** depois do nome, em `--icon-subtle` (#a1a2a8 antisserrilhado no print,
 *   x=810). O tamanho de 12 não foi medido.
 * - **"+"** no fim da fila, centrado nela: glifo de 10px (print `113603`,
 *   x=963–972, y=624–633). O desenho do acervo ocupa ~58% do quadro, então o
 *   glifo de 10 é o ícone de 16. A caixa de 24 acompanha a altura da pílula.
 * - **Sem cargo nenhum**, "+ Adicionar cargo" em linha: print `2026-08-31
 *   101804`, glifo em x=1364–1373 (ícone de 16 começando em 1360, a borda do
 *   conteúdo), texto em x=1381 (4 de folga), `--text-muted`. A linha mede 24:
 *   é o que fecha a conta até o topo do botão "Editar perfil" (y=497 = 480 + 8
 *   do respiro do corpo + 8 do espaço entre corpo e rodapé).
 *
 * O Discord recolhe o excesso numa pílula "+5" (print `113603`); aqui a fila
 * mostra todos os cargos, porque o recolhimento e o painel que ele abre não
 * existem no app — e inventar o painel é o que o §6.6 proíbe.
 *
 * Sem `MANAGE_ROLES`, nem o × nem o "+" aparecem: a UI esconde o que a API
 * recusaria.
 */

export interface CargoDaPilula {
  id: string;
  name: string;
  color?: string | null;
}

export interface PilulasDeCargoProps {
  cargos: CargoDaPilula[];
  podeRemover: boolean;
  podeAdicionar: boolean;
  aoRemover: (cargoId: string) => void;
  aoAdicionar: (botao: HTMLElement) => void;
}

export function PilulasDeCargo({ cargos, podeRemover, podeAdicionar, aoRemover, aoAdicionar }: PilulasDeCargoProps) {
  if (cargos.length === 0 && !podeAdicionar) return null;

  if (cargos.length === 0) {
    return (
      <div className="flex">
        <button
          type="button"
          onClick={(e) => aoAdicionar(e.currentTarget)}
          className="flex h-6 items-center gap-1 rounded text-text-xs text-text-muted transition-colors hover:text-text-default celular:h-[44px]"
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar cargo
        </button>
      </div>
    );
  }

  return (
    <ul aria-label={cargos.length === 1 ? "Cargo" : "Cargos"} className="flex flex-wrap items-center gap-1">
      {cargos.map((c) => (
        <li
          key={c.id}
          className="flex min-h-6 min-w-0 max-w-full items-center rounded-lg border border-border-subtle pl-0.5 pr-2 text-text-xs font-medium text-text-default"
        >
          {/* cargo sem cor: o Discord pinta com `--role-default`, que não foi
              gerado em `tokens.css`; o cinza cru fica até ele existir */}
          <span
            aria-hidden="true"
            style={{ backgroundColor: c.color ?? COR_DE_CARGO_SEM_COR }}
            className="mx-1 h-3 w-3 shrink-0 rounded-full"
          />
          <span className="min-w-0 truncate">{c.name}</span>
          {podeRemover && (
            <button
              type="button"
              onClick={() => aoRemover(c.id)}
              aria-label={`Remover o cargo ${c.name}`}
              className="ml-1 grid h-4 w-4 shrink-0 place-items-center rounded-full text-icon-subtle transition-colors hover:text-text-default celular:h-6 celular:w-6"
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
      {podeAdicionar && (
        <li className="flex">
          <button
            type="button"
            onClick={(e) => aoAdicionar(e.currentTarget)}
            aria-label="Adicionar cargo"
            className="grid h-6 w-6 place-items-center rounded-full text-text-muted transition-colors hover:text-text-default celular:h-[44px] celular:w-[44px]"
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </li>
      )}
    </ul>
  );
}
