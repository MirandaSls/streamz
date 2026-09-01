"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
  BarraDeAlteracoes,
  ProvedorDeAlteracoes,
  type ControleDeAlteracoes,
} from "@/components/ui/alteracoes";

/**
 * A moldura de "tela cheia de configurações" — a única do app.
 *
 * Servem-se dela as quatro telas: usuário, servidor, canal e grupo. Antes cada
 * uma tinha a sua cópia, e elas divergiram em medidas que o olho pega (o ESC
 * dentro do bloco de conteúdo comia 60px da largura útil; o menu colado na
 * borda da janela desalinhava o miolo). O leiaute mora aqui e a navegação entra
 * como **dado**.
 *
 * Não usa `Dialog` de propósito: `Dialog` é a caixa centrada de 380–480px com
 * rodapé de botões, e isto ocupa a janela inteira. O que se repete de lá é o
 * contrato de acessibilidade — `role="dialog"`, `aria-modal`, Esc fecha, o foco
 * começa dentro e **volta para quem abriu**.
 *
 * O leiaute é o do Discord: três colunas flexíveis, com o menu de 218px
 * ancorado à *direita* de uma região esquerda elástica e o ESC numa coluna
 * própria de 60px à direita do conteúdo. Não é enfeite — é o que mantém o bloco
 * de 740px centrado na janela em qualquer largura, em vez de empurrado pelo
 * menu.
 */

export interface ItemDeMenu {
  id: string;
  label: string;
  icon?: ReactNode;
  /**
   * As seções da aba, para o menu de segundo nível.
   *
   * Elas não trocam de tela: rolam até o bloco correspondente da **mesma**
   * página, e se marcam sozinhas conforme a página rola. É o que o Discord faz
   * — e a razão é que essas páginas são longas e contínuas: quebrá-las em abas
   * de verdade obrigaria a lembrar em qual metade estava a preferência.
   *
   * O `id` de cada seção casa com o `id` do `<Section>` correspondente.
   */
  secoes?: { id: string; label: string }[];
}

export interface GrupoDeMenu {
  id: string;
  /** cabeçalho da seção em caixa-alta; sem ele os itens ficam soltos. */
  label?: string;
  itens: ItemDeMenu[];
}

export interface BuscaDoMenu {
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  /** rótulo acessível do campo — ele não tem `<label>` visível. */
  rotulo: string;
}

/** Classes de um item do menu lateral, compartilhadas com o rodapé. */
const ITEM_BASE =
  "mb-0.5 flex h-8 w-full items-center gap-2 rounded-[4px] px-2.5 text-left text-base transition";
const ITEM_REPOUSO = "text-txt-faint hover:bg-hov hover:text-txt-normal";

export default function TelaCheia({
  titulo,
  cabecalho,
  cabecalhoRico,
  onCabecalho,
  busca,
  grupos,
  abaId,
  onAba,
  menuVazio,
  rodapeMenu,
  tituloAba,
  rotuloFechar = "Fechar",
  controle,
  onClose,
  children,
}: {
  /** rótulo acessível da tela inteira (ex.: "Configurações de #geral"). */
  titulo: string;
  /** nome do objeto no topo da barra lateral (servidor, canal, grupo). */
  cabecalho?: string;
  /**
   * Bloco livre acima da busca — o cartão de perfil das configurações do
   * usuário. Não é `cabecalho` com outro nome: aquele é uma linha de texto em
   * caixa-alta, este é avatar, nome e um atalho.
   */
  cabecalhoRico?: ReactNode;
  /** quando presente, o cabeçalho vira botão com chevron (menu do servidor). */
  onCabecalho?: (event: MouseEvent<HTMLButtonElement>) => void;
  busca?: BuscaDoMenu;
  grupos: GrupoDeMenu[];
  abaId: string;
  onAba: (id: string) => void;
  /** mostrado quando a busca não deixa nenhum item de pé. */
  menuVazio?: ReactNode;
  /** ações no fim da barra lateral, depois de uma divisória. */
  rodapeMenu?: ReactNode;
  /** vira o `<h1>` do conteúdo: o nome da aba, não o do objeto. */
  tituloAba?: string;
  rotuloFechar?: string;
  /** barra de "alterações não salvas": o shell desenha e barra a saída. */
  controle?: ControleDeAlteracoes;
  onClose: () => void;
  children: ReactNode;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const [secaoVisivel, setSecaoVisivel] = useState<string | null>(null);

  const itemAtivo = grupos.flatMap((g) => g.itens).find((i) => i.id === abaId);
  const secoes = itemAtivo?.secoes ?? [];

  /**
   * Qual seção está sendo lida agora.
   *
   * O `rootMargin` corta 70% de baixo: sem isso, três seções curtas cabem na
   * tela ao mesmo tempo e a marcação piscaria entre elas a cada pixel de
   * rolagem. Com o corte, vale a que está perto do topo — que é onde o olho
   * está.
   */
  useEffect(() => {
    const raiz = rolagemRef.current;
    if (!raiz || secoes.length === 0 || typeof IntersectionObserver === "undefined") {
      setSecaoVisivel(null);
      return;
    }
    const alvos = Array.from(raiz.querySelectorAll<HTMLElement>("[data-secao]"));
    if (alvos.length === 0) return;
    setSecaoVisivel(alvos[0].dataset.secao ?? null);
    const observador = new IntersectionObserver(
      (entradas) => {
        const visiveis = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const topo = visiveis[0]?.target as HTMLElement | undefined;
        if (topo?.dataset.secao) setSecaoVisivel(topo.dataset.secao);
      },
      { root: raiz, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    alvos.forEach((el) => observador.observe(el));
    return () => observador.disconnect();
    // `abaId` troca o conteúdo inteiro do scroller; `secoes.length` cobre a aba
    // que ganha seções depois de carregar
  }, [abaId, secoes.length]);

  /** Rola até a seção — sem animação para quem pediu menos movimento. */
  function irParaSecao(id: string) {
    const alvo = rolagemRef.current?.querySelector<HTMLElement>(`[data-secao="${id}"]`);
    if (!alvo) return;
    const suave = !document.documentElement.classList.contains("reduzir-movimento");
    alvo.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
    setSecaoVisivel(id);
  }

  useEffect(() => {
    // devolver o foco é o que faz o Esc não jogar o usuário no começo da página
    const anterior = document.activeElement as HTMLElement | null;
    painelRef.current?.focus();
    return () => anterior?.focus?.();
  }, []);

  const podeSair = () => !controle || controle.pedirParaSair();

  function irPara(id: string) {
    if (id === abaId) return;
    if (!podeSair()) return;
    onAba(id);
  }

  function fechar() {
    if (!podeSair()) return;
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    // o listener global de atalhos também vê o Esc; parar aqui evita que ele
    // marque o canal como lido "de brinde" ao fechar a tela
    event.stopPropagation();
    fechar();
  }

  const vazio = grupos.every((g) => g.itens.length === 0);

  return (
    <div
      ref={painelRef}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="anim-settings fixed inset-0 z-50 flex bg-chat outline-none"
    >
      <nav
        aria-label="Seções das configurações"
        className="flex flex-[1_0_auto] flex-col items-end overflow-y-auto bg-panel py-[60px] pr-2"
      >
        <div className="w-[218px] px-2">
          {cabecalho !== undefined &&
            (onCabecalho ? (
              <button
                type="button"
                onClick={onCabecalho}
                aria-haspopup="menu"
                className="mb-2 flex h-8 w-full items-center gap-1 rounded-[4px] px-2.5 text-left transition hover:bg-hov"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
                  {cabecalho}
                </span>
                <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-txt-muted" />
              </button>
            ) : (
              <h2 className="mb-1 truncate px-2.5 text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
                {cabecalho}
              </h2>
            ))}

          {cabecalhoRico}

          {busca && (
            <div className="relative mb-4">
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-txt-muted"
              />
              <input
                value={busca.valor}
                onChange={(e) => busca.onChange(e.target.value)}
                placeholder={busca.placeholder ?? "Buscar"}
                aria-label={busca.rotulo}
                className="h-7 w-full rounded-[4px] border border-transparent bg-rail pl-7 pr-2 text-sm text-txt-normal outline-none transition-colors placeholder:text-txt-muted focus:border-accent"
              />
            </div>
          )}

          {grupos.map((grupo) => {
            if (grupo.itens.length === 0) return null;
            return (
              <div key={grupo.id} className={grupo.label ? "mb-4" : undefined}>
                {grupo.label && (
                  <h2 className="mb-1 px-2.5 text-xs font-bold uppercase tracking-[0.02em] text-txt-muted">
                    {grupo.label}
                  </h2>
                )}
                {grupo.itens.map((item) => {
                  const ativo = item.id === abaId;
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        aria-current={ativo ? "page" : undefined}
                        onClick={() => irPara(item.id)}
                        className={`${ITEM_BASE} ${
                          ativo ? "bg-sel text-txt-primary" : ITEM_REPOUSO
                        }`}
                      >
                        {item.icon && (
                          <span aria-hidden="true" className="shrink-0">
                            {item.icon}
                          </span>
                        )}
                        <span className="truncate">{item.label}</span>
                      </button>

                      {/* Só da aba aberta: as seções das outras não são
                          navegáveis daqui, e listá-las faria um menu de
                          cinquenta linhas. */}
                      {ativo && item.secoes && item.secoes.length > 0 && (
                        <div className="mb-1 ml-3 border-l border-border pl-2">
                          {item.secoes.map((secao) => {
                            const aqui = secao.id === secaoVisivel;
                            return (
                              <button
                                key={secao.id}
                                type="button"
                                aria-current={aqui ? "true" : undefined}
                                onClick={() => irParaSecao(secao.id)}
                                className={`relative mb-0.5 flex h-7 w-full items-center rounded-[4px] px-2.5 text-left text-sm transition ${
                                  aqui
                                    ? "text-txt-primary"
                                    : "text-txt-faint hover:bg-hov hover:text-txt-normal"
                                }`}
                              >
                                {aqui && (
                                  <span
                                    aria-hidden="true"
                                    className="absolute -left-[9px] top-1 h-5 w-0.5 rounded-full bg-txt-primary"
                                  />
                                )}
                                <span className="truncate">{secao.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {vazio && menuVazio}

          {rodapeMenu && (
            <>
              <div aria-hidden="true" className="my-2 h-px bg-border" />
              {rodapeMenu}
            </>
          )}
        </div>
      </nav>

      {/*
        A base de 800px é o que equilibra a tela. Com `flex-1` (base 0%) o
        `<nav>`, que tem base automática de 218px, ficava com metade do espaço
        livre MAIS a própria largura — numa janela de 1920px o painel lateral
        passava de 1000px e desenhava o menu quase no meio da tela, empurrando o
        conteúdo todo para a direita.
      */}
      <div className="flex min-w-0 flex-[1_1_800px]">
        <div ref={rolagemRef} className="min-w-0 max-w-[740px] flex-1 overflow-y-auto px-10 py-[60px]">
          {tituloAba && (
            <h1 className="mb-5 font-display text-xl font-bold tracking-title text-txt-primary">
              {tituloAba}
            </h1>
          )}
          {controle ? (
            <ProvedorDeAlteracoes controle={controle}>
              {children}
              <BarraDeAlteracoes controle={controle} />
            </ProvedorDeAlteracoes>
          ) : (
            children
          )}
        </div>

        {/* Colado ao bloco de 740px, e não numa coluna no extremo direito: é
            onde o Discord põe o ESC. Fica fora do scroller para não escorregar
            com o conteúdo, e fora do bloco para não comer largura útil dele. */}
        <div className="w-[60px] shrink-0 pt-[60px]">
          <button
            type="button"
            onClick={fechar}
            aria-label={rotuloFechar}
            className="grid h-9 w-9 place-items-center rounded-full border-2 border-txt-muted text-txt-muted transition hover:bg-hov hover:text-txt-primary"
          >
            <X size={18} />
          </button>
          <span className="mt-1 block w-9 text-center text-xs font-semibold text-txt-muted">
            ESC
          </span>
        </div>
      </div>
    </div>
  );
}

/** Item neutro do rodapé da barra lateral (ex.: "Sair"). */
export function ItemNeutro({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  /** fica à *direita* do rótulo, como o "Sair" do Discord. */
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={`${ITEM_BASE} ${ITEM_REPOUSO}`}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {icon && (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      )}
    </button>
  );
}

/** Item vermelho do fim da barra lateral ("Apagar canal", "Apagar servidor"). */
export function ItemPerigo({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${ITEM_BASE} text-red hover:bg-red hover:text-white`}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      )}
      <span className="truncate">{children}</span>
    </button>
  );
}
