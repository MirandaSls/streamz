"use client";

import type { ReactNode } from "react";
import type { UserStatus } from "@streamz/shared";
import IconeDeStatus from "@/components/ui/IconeDeStatus";
import { ChevronRight, Pencil, UserCircle } from "@/components/ui/icones";

/**
 * Os painéis do meu cartão quando ele abre pelo **painel do usuário** (rodapé
 * da coluna), medidos no print 1:1 `2026-09-03 180020`:
 *
 * - dois cartões de 268 (x=26–293) em `--background-surface-highest` (#2c2d32),
 *   raio 8 (na coluna x=30, 4px para dentro, a borda perde 1px de cada lado:
 *   y=1020–1114 contra 1019–1115 em x=160), respiro 8, e 12 entre eles
 *   (y=1116–1127) — o `gap` de 12 do corpo;
 * - no primeiro, "Editar perfil" e a linha de status, cada uma com 32 de altura
 *   (y=1076–1107), separadas por um traço de 1px com 8 de cada lado (y=1067,
 *   entre 1059–1066 e 1068–1075). O traço é #38393e, que é `--border-subtle`
 *   sobre o cartão, e vai de x=38 a 281: 4 para dentro das linhas (x=34–285);
 * - no segundo, "Mudar de conta" (y=1128–1175 = 8 + 32 + 8);
 * - dentro da linha: quadro de 16 a 8 da borda (disco de status em x=45–54,
 *   centrado em 42–57) e o rótulo a 8 dele (x=66). O ícone é #abacb2
 *   (`--icon-subtle`, lápis em x=49, y=1040–1046);
 * - hover e linha aberta: #38393e (y=1076–1107 com o submenu aberto), o
 *   `--interactive-background-hover` sobre o cartão.
 *
 * Aberto pela lista de membros, o meu cartão não tem estes painéis, só o botão
 * "Editar perfil" (prints `2026-08-31 101804` e `2026-09-01 113603`); quem
 * escolhe é o `ProfilePopoverHost`, pelo `acima` do popover.
 *
 * Fica de fora o selo "NOVO" do print (é chamada de novidade do Discord, não
 * função). "Sair" e "Status personalizado", que moravam aqui, não existem no
 * cartão do Discord: sair está em Configurações, e o status personalizado é o
 * balão do cabeçalho.
 */

/**
 * Rótulo do **meu** status. Difere do `STATUS_LABEL` geral em OFFLINE: para os
 * outros é "Offline"; para mim, que escolhi, é "Invisível".
 */
const ROTULO_DO_MEU_STATUS: Record<UserStatus, string> = {
  ONLINE: "Disponível",
  IDLE: "Ausente",
  DND: "Não perturbar",
  OFFLINE: "Invisível",
};

const LINHA =
  "group flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-text-sm text-text-default transition-colors hover:bg-interactive-background-hover celular:h-[44px]";

export interface PainelDaMinhaContaProps {
  status: UserStatus;
  aoEditarPerfil: () => void;
  aoAbrirStatus: (linha: HTMLElement) => void;
  aoPassarNoStatus: (linha: HTMLElement) => void;
  aoSairDoStatus: () => void;
  aoMudarDeConta: () => void;
}

export function PainelDaMinhaConta({
  status,
  aoEditarPerfil,
  aoAbrirStatus,
  aoPassarNoStatus,
  aoSairDoStatus,
  aoMudarDeConta,
}: PainelDaMinhaContaProps) {
  return (
    <>
      <div className="flex flex-col rounded-lg bg-background-surface-highest p-2">
        <button type="button" onClick={aoEditarPerfil} className={`${LINHA} font-medium`}>
          <Icone>
            <Pencil size={16} aria-hidden="true" />
          </Icone>
          <span className="min-w-0 flex-1 truncate">Editar perfil</span>
        </button>
        <div aria-hidden="true" className="mx-1 my-2 border-t border-border-subtle" />
        {/* abre no clique e no hover, como no Discord; o atraso do hover é do host */}
        <button
          type="button"
          aria-haspopup="menu"
          onClick={(e) => aoAbrirStatus(e.currentTarget)}
          onPointerEnter={(e) => aoPassarNoStatus(e.currentTarget)}
          onPointerLeave={aoSairDoStatus}
          className={`${LINHA} font-semibold`}
        >
          <Icone>
            <IconeDeStatus status={status} className="h-2.5 w-2.5" />
          </Icone>
          <span className="min-w-0 flex-1 truncate">{ROTULO_DO_MEU_STATUS[status]}</span>
          <Seta />
        </button>
      </div>
      <div className="flex flex-col rounded-lg bg-background-surface-highest p-2">
        {/*
          "Mudar de conta" é a palavra do print `2026-09-03 202926`. No Discord a
          seta abre um submenu de contas; aqui abre "Gerenciar contas", com as
          contas do aparelho (`lib/contas.ts`).
        */}
        <button type="button" onClick={aoMudarDeConta} className={`${LINHA} font-medium`}>
          <Icone>
            <UserCircle size={16} aria-hidden="true" />
          </Icone>
          <span className="min-w-0 flex-1 truncate">Mudar de conta</span>
          <Seta />
        </button>
      </div>
    </>
  );
}

function Icone({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="grid h-4 w-4 shrink-0 place-items-center text-icon-subtle">
      {children}
    </span>
  );
}

/** 5 × 10 de tinta no print → 20 no nosso ativo (a mesma conta do `ContextMenu`). */
function Seta() {
  return (
    <ChevronRight
      size={20}
      aria-hidden="true"
      className="shrink-0 text-icon-subtle transition-colors group-hover:text-text-default"
    />
  );
}
