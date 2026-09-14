"use client";

import type { ReactNode } from "react";
import { useEhMobile } from "@/hooks/useEhMobile";

/**
 * O topo de cada página das configurações do servidor e os botões de ação que
 * elas repetem.
 *
 * Existe porque, nas configurações do **servidor**, o título não mora na barra
 * do shell: a `JanelaDeConfiguracoes` entra em `variante="tela-cheia"` (o
 * círculo com "ESC" ao lado da coluna) e quem escreve o `<h1>` é a página. Sem
 * um lugar só, nove páginas escreveriam nove tamanhos de título.
 *
 * Medidas (prints `docs/Reference/Captura de tela 2026-09-04 100541` e
 * `100700`, janela 1919×1079):
 *
 * | item | print |
 * |---|---|
 * | coluna de conteúdo | 660 (x 732→1391), que é a coluna de 740 com 40 de recuo da moldura |
 * | título | glifo de 15px com ascendente ("Perfil do servidor", y 96–110) → 20px semibold, `#fbfbfb` = `--text-strong` |
 * | subtítulo | linhas de 18 (y 128–140 e 146–158) → 14px/18; tinta `#efeff1` = `--text-default` nos dois prints (era `--text-muted`) |
 * | título → subtítulo | **muda por página**: ≈8 em "Perfil do servidor", ≈0 em "Cargos" (linha de base a 28 e a 19). Fica o meio-termo de 6 de antes |
 *
 * Os botões: as receitas abaixo são as mesmas do `Button` dos primitivos, em
 * string, para as páginas que ainda montam `<button>` na mão. A **altura** muda
 * de página para página no próprio Discord (32 em "Perfil do servidor" e
 * "Cargos", 40 em "Convites"), então ela não entra na constante: quem chama
 * passa `h-8`/`h-10` com a medida do seu print.
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
  /**
   * No celular quem escreve o nome da seção é a **barra** da
   * `JanelaDeConfiguracoes` (seta de voltar + título), então o `<h1>` aqui
   * viraria o mesmo nome duas vezes seguidas, a 56px de distância. Ele continua
   * existindo para leitor de tela — o que sai é a tinta, não a estrutura.
   */
  const ehMobile = useEhMobile();
  return (
    <div
      className={`flex items-start justify-between gap-4 ${
        ehMobile && !subtitulo && !acao ? "" : subtitulo ? "mb-[18px]" : "mb-6"
      }`}
    >
      <div className="min-w-0">
        <h1 className={ehMobile ? "sr-only" : "text-heading-lg font-semibold text-text-strong"}>{titulo}</h1>
        {subtitulo && <p className="mt-1.5 text-text-sm text-text-default">{subtitulo}</p>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

/**
 * Botão de ação primário (o blurple do print, que aqui é o limão): as cores do
 * `primario` de `primitivos/Button` (`--control-primary-*`, texto escuro). A
 * altura vem de quem chama.
 */
export const BOTAO_ACENTO =
  "shrink-0 rounded-lg border border-control-primary-border-default bg-control-primary-background-default px-4 text-text-sm font-medium text-control-primary-text-default transition-colors hover:bg-control-primary-background-hover active:bg-control-primary-background-active disabled:cursor-not-allowed disabled:opacity-50";

/** Botão secundário: o `secundario` de `primitivos/Button` (`--control-secondary-*`). */
export const BOTAO_SECUNDARIO =
  "shrink-0 rounded-lg border border-control-secondary-border-default bg-control-secondary-background-default px-4 text-text-sm font-medium text-control-secondary-text-default transition-colors hover:bg-control-secondary-background-hover active:bg-control-secondary-background-active disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Botão de ação destrutiva no desenho do print: fundo cinza e **texto**
 * vermelho ("Remover o Ícone", print 100541). É o `critico-secundario` do
 * `Button` (`--control-critical-secondary-*`, texto `#f87e7a`) — era
 * `--status-danger` (`#da3e44`), o mesmo vermelho errado que a revisão mediu
 * no "Apagar servidor". Fundo vermelho fica reservado para a confirmação.
 */
export const BOTAO_PERIGO =
  "shrink-0 rounded-lg border border-control-critical-secondary-border-default bg-control-critical-secondary-background-default px-4 text-text-sm font-medium text-control-critical-secondary-text-default transition-colors hover:bg-control-critical-secondary-background-hover active:bg-control-critical-secondary-background-active disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Cabeçalho de coluna das tabelas do servidor (membros, convites, banimentos):
 * caixa-alta, 12px, com a divisória de 1px embaixo — medido no print
 * `100649` (linha de 1px em `#2E2E33`, cabeçalho de 57 de altura).
 */
export const TABELA_CABECALHO =
  "border-b border-border-subtle text-left text-xs font-bold uppercase tracking-[0.02em] text-text-subtle";
