"use client";

import type { ReactNode } from "react";

/**
 * O topo de cada página das configurações do servidor e os botões de ação que
 * elas repetem.
 *
 * Existe porque, nas configurações do **servidor**, o título não mora na barra
 * do shell: a `JanelaDeConfiguracoes` entra em `fecharComoEsc` (o X redondo com
 * "ESC" ao lado da coluna) e quem escreve o `<h1>` é a página. Sem um lugar só,
 * nove páginas escreveriam nove tamanhos de título.
 *
 * Medidas (prints `docs/Reference/Captura de tela 2026-09-04 100541`,
 * `100700`, `100706`, `100713`; janela 1919×1079, lidas com `getpixel`):
 *
 * | item | print |
 * |---|---|
 * | coluna de conteúdo | 660 (x 732→1391) |
 * | título | caixa de 18px de altura com descida ("Cargos") → 20px semibold |
 * | subtítulo | 13px de altura → 14px, cor apagada, 6px abaixo do título |
 * | primeiro bloco | 18px abaixo do subtítulo |
 *
 * Os botões: acento do produto no primário e cinza no secundário — é o azul do
 * Discord no print e o acento é o equivalente aqui. A **altura** muda de página
 * para página no próprio Discord (32 em "Perfil do servidor" e "Cargos", 40 em
 * "Convites"), então ela não entra na constante: quem chama passa `h-8`/`h-10`
 * com a medida do seu print.
 */
export function TituloDaPagina({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  /** botão à direita do título, quando a página tem um (não é o "ESC"). */
  acao?: ReactNode;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${subtitulo ? "mb-[18px]" : "mb-6"}`}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-txt-primary">{titulo}</h1>
        {subtitulo && <p className="mt-1.5 text-sm text-txt-muted">{subtitulo}</p>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

/** Botão de ação primário (o azul do print). A altura vem de quem chama. */
export const BOTAO_ACENTO =
  "shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

/** Botão secundário: cinza, para a ação que acompanha a primária. */
export const BOTAO_SECUNDARIO =
  "shrink-0 rounded-lg bg-border-strong px-4 text-sm font-medium text-txt-normal transition hover:bg-border-strong-hover disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Botão de ação destrutiva no desenho do print: fundo cinza e **texto**
 * vermelho ("Remover o ícone", "Remover"). Fundo vermelho fica reservado para a
 * confirmação, que é onde o estrago acontece de verdade.
 */
export const BOTAO_PERIGO =
  "shrink-0 rounded-lg bg-border-strong px-4 text-sm font-medium text-red transition hover:bg-border-strong-hover disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Cabeçalho de coluna das tabelas do servidor (membros, convites, banimentos):
 * caixa-alta, 12px, com a divisória de 1px embaixo — medido no print
 * `100649` (linha de 1px em `#2E2E33`, cabeçalho de 57 de altura).
 */
export const TABELA_CABECALHO =
  "border-b border-border text-left text-xs font-bold uppercase tracking-[0.02em] text-txt-secondary";
