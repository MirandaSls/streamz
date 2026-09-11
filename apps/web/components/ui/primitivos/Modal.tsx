"use client";

import type { ReactNode } from "react";

/**
 * Modal do Discord (`ModalV2`): `.root__49fc1` e irmãos em
 * `css-bruto/362698.047b6f205fd7bdc1.css`; véu `.scrim__40128` em
 * `css-bruto/904530.244121c11bbcdfce.css`.
 *
 * Especificação medida (cartão 0.4-modal implementa):
 * - Larguras: `pequeno` 442 (`--modal-width-small`, altura 220–720), `medio`
 *   602 (400–800), `grande` 800–962 (mín. 400 de altura); `livre` deixa a
 *   largura com o `className` (seletor de tela, configurações).
 * - Caixa: fundo `--modal-background`, borda 1px `--border-normal`, raio 12
 *   (`--radius-md`) — ATENÇÃO: o `design.md` (#59) mediu raio 8 nos prints;
 *   pela ADR-0009 o print vale mais que o CSS quando divergem. Medir com
 *   `scripts/paridade/medir.py` num print 1:1 de modal do Discord em
 *   `/opt/stack/streamz/docs/Reference/` e usar o que o print disser, com a
 *   origem no comentário. Sombra só com `comSombra` (`--shadow-medium`).
 * - Véu: `--background-scrim` (`#000000b8`), `fixed inset-0`.
 * - Cabeçalho: padding 16×24 sem padding de baixo; título = texto do conteúdo
 *   (candidato `heading-lg` 20/600 `--text-strong` — conferir no print);
 *   fechar: quadro de 24 com padding 4, `--icon-strong` a .5 de opacidade,
 *   hover opacidade 1 e `--interactive-text-hover`, 200 ms.
 * - Corpo: padding lateral 24, 8 em cima; rolagem com gutter compensado.
 * - Rodapé: fundo `--modal-footer-background` (igual ao corpo na refresh),
 *   padding 16×24; botões à direita com gap 8 (conferir no print).
 * - Entrada/saída: não está no CSS; manter `anim-overlay` + `anim-modal`.
 * - Esc e clique no véu fecham; Tab preso; foco volta ao sair.
 * - Celular: `telaCheiaNoCelular` ocupa a tela (sem raio nem borda), como o
 *   `.fullscreenOnMobile` do Discord abaixo de 485px.
 *
 * O `Dialog` (`components/modals/Dialog.tsx`) passa a ser um invólucro deste,
 * com a API antiga (`title`, `description`, `footer`, `onClose`…), para os 29
 * modais não mudarem de uma vez.
 */
export type TamanhoDeModal = "pequeno" | "medio" | "grande" | "livre";

export interface ModalProps {
  aoFechar: () => void;
  /** Título (e nome acessível). Obrigatório mesmo com `ocultarCabecalho`. */
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Padrão `pequeno`. */
  tamanho?: TamanhoDeModal;
  rodape?: ReactNode;
  /** Sem cabeçalho visível (o título continua para leitor de tela). */
  ocultarCabecalho?: boolean;
  /** Padrão `true`. */
  mostrarFechar?: boolean;
  /** Tira o padding do corpo (perfil, boas-vindas pintam a caixa inteira). */
  semPadding?: boolean;
  comSombra?: boolean;
  /** Padrão `centro`. */
  alinhamento?: "centro" | "topo";
  telaCheiaNoCelular?: boolean;
  /** Classe da caixa (largura livre, altura). */
  className?: string;
  classeDoCorpo?: string;
  children?: ReactNode;
}

const LARGURA: Record<TamanhoDeModal, string> = {
  pequeno: "w-[442px]",
  medio: "w-[602px]",
  grande: "min-w-[800px] max-w-[962px]",
  livre: "",
};

// Implementação provisória (cartão 0.4-modal substitui pelo medido).
export function Modal({
  aoFechar,
  titulo,
  subtitulo,
  tamanho = "pequeno",
  rodape,
  ocultarCabecalho = false,
  mostrarFechar = true,
  semPadding = false,
  alinhamento = "centro",
  className = "",
  classeDoCorpo = "",
  children,
}: ModalProps) {
  return (
    <div
      className={`anim-overlay fixed inset-0 z-50 grid bg-background-scrim p-4 ${alinhamento === "topo" ? "place-items-start justify-center pt-[10vh]" : "place-items-center"}`}
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`anim-modal relative max-w-full rounded-xl border border-border-normal bg-modal-background ${LARGURA[tamanho]} ${className}`}
      >
        {ocultarCabecalho ? (
          <h2 className="sr-only">{titulo}</h2>
        ) : (
          <header className="px-6 pt-4">
            <h2 className="text-heading-lg font-semibold text-text-strong">{titulo}</h2>
            {subtitulo ? <p className="mt-2 text-text-md text-text-muted">{subtitulo}</p> : null}
          </header>
        )}
        {mostrarFechar ? (
          <button type="button" aria-label="Fechar" onClick={aoFechar} className="absolute right-4 top-4 opacity-50 hover:opacity-100">
            ×
          </button>
        ) : null}
        <div className={`${semPadding ? "" : "px-6 pt-2"} ${classeDoCorpo}`}>{children}</div>
        {rodape ? <footer className="flex justify-end gap-2 bg-modal-footer-background px-6 py-4">{rodape}</footer> : null}
      </div>
    </div>
  );
}
