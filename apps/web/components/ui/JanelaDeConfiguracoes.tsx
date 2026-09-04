"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, Search, X } from "@/components/ui/icones";
import {
  BarraDeAlteracoes,
  ProvedorDeAlteracoes,
  type ControleDeAlteracoes,
} from "@/components/ui/alteracoes";

/**
 * A moldura das configurações — a única do app. Servem-se dela as quatro telas:
 * usuário, servidor, canal e grupo. O leiaute mora aqui e a navegação entra
 * como **dado**.
 *
 * **É uma janela flutuante, não uma página.** Era `fixed inset-0` (a tela
 * inteira, com o ESC redondo numa coluna de 60px à direita); o Discord de hoje
 * abre as configurações como um modal centrado, com o app escurecido em volta.
 * As medidas vieram do print `docs/Reference/Captura de tela 2026-09-01
 * 114404.png` (janela de 1920×1032, medido por `getpixel`) e se repetem em
 * 114348/114644:
 *
 * | item | medida no print |
 * |---|---|
 * | véu | preto a ~80% (painel `#1A1A1E` → `(5,5,6)`) |
 * | modal | 1400×888 centrado; sobra 260 de cada lado e 72 em cima/embaixo |
 * | moldura | borda de 1px `(41,41,45)`, cantos de ~8px |
 * | coluna do menu | 252px, itens de 220×40 com 16 de recuo |
 * | busca | 220×40, borda de 1px, fundo transparente |
 * | cabeçalho | 48px + divisória de 1px, **só sobre o conteúdo** |
 * | fechar | X simples de 12px, centro a 24px da borda direita |
 * | conteúdo | coluna útil de 700px centrada, 40px de recuo lateral |
 *
 * O 1400×888 é teto, não tamanho fixo: `max-w/max-h` deixam o modal encolher
 * até 16px de margem, e as duas colunas rolam por dentro. Só existe print de
 * uma largura de janela, então não dá para saber se o Discord usa porcentagem;
 * o teto é o que reproduz o print e sobrevive à janela pequena.
 *
 * O cartão de perfil e a busca ficam **fixos** no topo do menu e só a lista
 * rola — é o que os prints mostram (a mesma altura do cartão com a lista em
 * posições diferentes).
 *
 * Não usa `Dialog` de propósito: `Dialog` é a caixa de 380–480px com rodapé de
 * botões. O que se repete de lá é a casca (véu `bg-black`, `rounded-lg border
 * border-border bg-chat`) e o contrato de acessibilidade — `role="dialog"`,
 * `aria-modal`, Esc fecha, o foco começa dentro e **volta para quem abriu**.
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

/** Classes de um item do menu lateral, compartilhadas com o rodapé ("Sair", "Apagar…"). */
const ITEM_BASE =
  "mb-1 flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-base transition";
const ITEM_REPOUSO = "text-txt-faint hover:bg-hov hover:text-txt-normal";

export default function JanelaDeConfiguracoes({
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
  fecharComoEsc = false,
  rotuloFechar = "Fechar",
  controle,
  onClose,
  children,
}: {
  /** rótulo acessível da janela (ex.: "Configurações de #geral"). */
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
  /** vira o `<h1>` do cabeçalho: o nome da aba, não o do objeto. */
  tituloAba?: string;
  /**
   * Desenha o fechar como o **X redondo com "ESC"** ao lado da coluna de
   * conteúdo, sem a barra de 48px — e aí quem escreve o título é a página.
   *
   * As configurações do **servidor** do Discord são assim (prints
   * `2026-09-04 100541`–`100821`); as do usuário, que foram medidas em
   * `2026-09-01 1143–1146`, têm a barra com o X simples. São dois desenhos
   * diferentes no mesmo produto, então isto é uma opção e não uma troca: quem
   * não pedir continua com a barra.
   *
   * Medidas (print `2026-09-04 100700`, janela 1919×1079, `getpixel`):
   * círculo de 36 com anel de 2px, centro a 58 da borda direita da coluna de
   * conteúdo; "ESC" em caixa-alta 9px abaixo do círculo. A altura do print
   * (centro a 110 do topo da janela) **não** transfere — lá a tela ocupa a
   * janela inteira e aqui é um modal de 888 —, então o círculo alinha o centro
   * com a primeira linha do título da página.
   */
  fecharComoEsc?: boolean;
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
      // `flex` e não `grid`: numa grade o trilho automático cresce até o
      // max-content do modal (1400px), e aí `max-w-full` mede 100% de 1400 em
      // vez da janela — numa janela de 1100px o conteúdo saía pela direita
      className="anim-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onMouseDown={(e) => {
        // só o clique que **começa** no véu fecha: arrastar um controle de
        // dentro e soltar aqui fora não pode derrubar a tela
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="anim-settings flex h-[888px] max-h-full w-[1400px] max-w-full overflow-hidden rounded-lg border border-border bg-chat shadow-high outline-none"
      >
        <nav
          aria-label="Seções das configurações"
          className="flex w-[252px] shrink-0 flex-col overflow-hidden bg-panel"
        >
          {/* Cartão de perfil e busca ficam parados; só a lista rola. 252 de
              coluna com 16 de cada lado: o item do Discord mede 220×40 (print
              das configurações do usuário, medido por pixel), e a busca e os
              cabeçalhos acompanham a mesma largura. */}
          <div className="shrink-0 px-4 pt-4">
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
              <div className="relative mb-3">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted"
                />
                {/* 40 de altura e borda no lugar de fundo: é o campo do print,
                    que tem a mesma altura dos itens do menu logo abaixo. */}
                <input
                  value={busca.valor}
                  onChange={(e) => busca.onChange(e.target.value)}
                  placeholder={busca.placeholder ?? "Buscar"}
                  aria-label={busca.rotulo}
                  className="h-10 w-full rounded-[4px] border border-border-strong bg-transparent pl-10 pr-3 text-base text-txt-normal outline-none transition-colors placeholder:text-txt-muted focus:border-accent"
                />
              </div>
            )}
          </div>

          {/* A lista é a única parte que rola: numa janela baixa o cartão e a
              busca continuam à vista, como no Discord. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {grupos.map((grupo, i) => {
              if (grupo.itens.length === 0) return null;
              return (
                <div key={grupo.id} className={grupo.label ? "mb-4" : undefined}>
                  {/* Divisória entre grupos: está nos dois prints do menu (o do
                      servidor, `2026-09-04 100541`, com a linha entre "Vantagens
                      de Impulso" e EXPRESSÕES; e o do usuário, `2026-09-01
                      114404`, acima de "Jogos e apps"). Sem ela os cabeçalhos em
                      caixa-alta eram a única separação, e grupo de um item só
                      encostava no anterior. */}
                  {i > 0 && <div aria-hidden="true" className="mb-2 mt-1 h-px bg-border" />}
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

        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Cabeçalho de 48px com divisória, só sobre o conteúdo: o título da
              aba fica aqui (era um `<h1>` dentro do miolo) e o fechar é um X
              simples com o centro a 24px da borda — sem o círculo com "ESC",
              que no Discord de hoje só aparece nas telas do **servidor**
              (`fecharComoEsc`). */}
          {!fecharComoEsc && (
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-4 pr-2">
              <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-txt-primary">
                {tituloAba}
              </h1>
              <button
                type="button"
                onClick={fechar}
                aria-label={rotuloFechar}
                title={`${rotuloFechar} (Esc)`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-txt-muted transition hover:bg-hov hover:text-txt-primary"
              >
                <X size={16} />
              </button>
            </header>
          )}

          {/* Coluna útil de 700px com 40 de recuo. Centrada na variante com
              barra; encostada à esquerda na variante "ESC", porque lá o círculo
              de fechar mora à direita dela e o conjunto é que fica alinhado ao
              começo do conteúdo, como no print do servidor. */}
          <div ref={rolagemRef} className="min-h-0 flex-1 overflow-y-auto">
            <div
              className={`w-full max-w-[780px] px-10 pb-10 pt-10 ${
                fecharComoEsc ? "" : "mx-auto"
              }`}
            >
              {controle ? (
                <ProvedorDeAlteracoes controle={controle}>
                  {children}
                  <BarraDeAlteracoes controle={controle} />
                </ProvedorDeAlteracoes>
              ) : (
                children
              )}
            </div>
          </div>

          {/* Fora do scroller de propósito: no Discord o botão não sobe com a
              página. `min(...)` prende ao fim da coluna de 700 (740 + 58 - 18)
              e recua para a borda do painel quando a janela é estreita demais
              para os dois caberem lado a lado. */}
          {fecharComoEsc && (
            <button
              type="button"
              onClick={fechar}
              aria-label={rotuloFechar}
              title={`${rotuloFechar} (Esc)`}
              style={{ left: "min(780px, calc(100% - 52px))" }}
              className="absolute top-9 flex w-9 flex-col items-center gap-[9px] text-txt-secondary transition hover:text-txt-primary"
            >
              <span
                aria-hidden="true"
                className="grid h-9 w-9 place-items-center rounded-full border-2 border-current"
              >
                <X size={16} />
              </span>
              <span aria-hidden="true" className="text-[11px] font-bold tracking-[0.02em]">
                ESC
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
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
