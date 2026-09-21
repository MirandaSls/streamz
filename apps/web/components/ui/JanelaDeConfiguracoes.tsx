"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Search, X } from "@/components/ui/icones";
import {
  BarraDeAlteracoes,
  ProvedorDeAlteracoes,
  type ControleDeAlteracoes,
} from "@/components/ui/alteracoes";
import { BotaoDeIcone, TextInput, Tooltip } from "@/components/ui/primitivos";
import { useEhMobile } from "@/hooks/useEhMobile";
import { useVoltarNoCelular } from "@/hooks/useVoltarNoCelular";

/**
 * A moldura das configurações — a única do app. Servem-se dela as telas de
 * usuário, servidor, canal, categoria e grupo. O leiaute mora aqui e a
 * navegação entra como **dado**.
 *
 * O Discord de 2026-09 tem **dois desenhos** para isso, e os dois vivem aqui
 * (`variante`):
 *
 * ## `janela` — as configurações do usuário (o refresh de 2025)
 *
 * Modal centrado com o app escurecido em volta. Casca medida no CSS
 * (`css-bruto/sob-demanda/48832ff684019b72.css`, `.modal_e44912`) e o miolo
 * nos prints 1:1 `docs/Reference/Captura de tela 2026-09-01 114404.png`
 * (menu rolado até o fim), `114644` (menu no topo) e `114508`:
 *
 * | item | medida | origem |
 * |---|---|---|
 * | tamanho | `100% − 2×(40 + 32)` com teto de 1400; até 1600px de janela, `100% − 2×40`; até 1080px, tela cheia sem borda nem raio | `.modal_e44912` e as duas `@container` |
 * | moldura | borda 1px `--border-subtle`, raio 12 | 114404: borda `#29292d` em x=260/y=72; a curva chega à coluna x=260 em y≈82 |
 * | coluna do menu | 252, fundo `--background-base-lower` | 114404 linha y=600: x 261–512 `#1a1a1e` |
 * | conteúdo | `--background-base-low` | 114404 pixel (1000,200) `#202024` |
 * | cartão de perfil | avatar 48 a 11 da borda do item, nome a 12 do avatar | 114404: avatar x 288–335/y 104–151, nome x=347 |
 * | busca | 220×40 | 114404: x 277–496, y 167–206 |
 * | item | 220 × mín. 40, recuo 10, ícone 20, texto a 10 do ícone, 16px/20, 4 entre itens; **quebra linha** (60 com duas) | 114404: selecionado x 277–496/y 291–330; ícones x 287–306; texto x=317; "Privacidade nas atividades" em duas linhas de 20 |
 * | item selecionado | `--background-mod-normal` (`#2e2e33` sobre `#1a1a1e`), raio 8, texto `--text-strong` | 114404 caixa (480,300) |
 * | item em repouso | texto e ícone `--text-muted` (`#96979e`) | 114404, tinta dos itens |
 * | cabeçalho de grupo | 14px/18, `--text-muted`, sem caixa-alta, recuo 8, 8 de respiro em cima e embaixo | 114404: "Jogos e apps" glifo y 588–600, x=285 |
 * | divisória entre grupos | 1px `--border-subtle` na largura do item, 10 acima e 10 abaixo | 114404: y=565 e y=812, x 277–496 |
 * | subitens | trilho 2px `--border-subtle` alinhado ao centro do ícone, marca 2×20 `--text-strong` no subitem visível, 40 por linha, texto na coluna do rótulo | 114404: trilho x 296–297/y 361–500, marca y 341–360, "Geral" x=317 |
 * | esmaecido da lista rolada | 40px de gradiente sob a busca, só com a lista fora do topo | 114404 y 207→246 (alfa 0→1); 114644 sem esmaecido no topo |
 * | cabeçalho do conteúdo | 48 + divisória 1px `--border-muted`, título 16px semibold `--text-default` a 16 da borda | 114404: y 73–120, divisória `#252529` em y=121; título x=530 `#efeff1` |
 * | fechar | X de 12px `--icon-subtle` com centro a 24 da borda direita | 114404: glifo x 1629–1640/y 91–102 `#abacb2` |
 * | coluna do conteúdo | 700 úteis, centrada | 114404: divisória x 739–1434, centro = centro da área |
 * | versão | 12px `--text-muted`, 36 abaixo do último item | 114404: glifo y 947–954, "Sair" termina em y=907 |
 *
 * ## `tela-cheia` — configurações do servidor (o `standardSidebarView`)
 *
 * Tela cheia, sem véu. Módulo `.standardSidebarView__23e6b`
 * (`css-bruto/sob-demanda/98259d2dbb54535f.css`) + a barra de abas lateral
 * `.side_aa8da2` (`css-bruto/773326.616f0e0d19c4d900.css`), conferidos no
 * print `2026-09-04 100541.png` (e `100700`), janela 1919×1079:
 *
 * | item | medida | origem |
 * |---|---|---|
 * | região do menu | `flex: 1 0 272`, fundo `--background-base-lowest`, menu encostado à direita | `.sidebarRegion__23e6b`; print: `#121214` até x=691 |
 * | menu | 272 = 20 + 238 + 14 (6 de recuo + 8 de barra de rolagem), 60 em cima | print: itens x 440–677; `.sidebar__23e6b{padding-block:60px}` |
 * | item | 36 (6 + 24 + 6), recuo 10, raio 4, 2 entre itens, 16px medium, reticências | `.side_aa8da2 .item_aa8da2`; print: "Perfil do servidor" y 82–117, passo 38 |
 * | item: cores | repouso `--text-subtle`; hover `--background-mod-subtle` + `--text-strong`; ativo e selecionado `--background-mod-strong` + `--text-strong` | `.themed_aa8da2`; print: `#2c2c30` sobre `#121214` |
 * | cabeçalho | 12px bold caixa-alta `--channels-default`, 6×10 (0 em cima no primeiro) | `.header_aa8da2`; print: "EXPRESSÕES" `#81828a` |
 * | separador | 1px `--border-subtle`, margem 8×10 | `.separator_aa8da2`; print: y=242, x 450–667 |
 * | conteúdo | `flex: 1 1 800`, `--background-base-low`, coluna de até 740 com 60/40/80 | `.contentRegion__23e6b`, `.contentColumnDefault__23e6b`; print: título em x=732 |
 * | fechar "ESC" | coluna de 36 logo depois da coluna de conteúdo, 21 da borda, 60 do topo, fixa na rolagem; círculo 36 com anel 2px, X de 10, "ESC" embaixo, tudo `--icon-subtle` | `.toolsContainer__23e6b` (+ `.tools{position:fixed}`); print: círculo x 1432–1467 (100700), X y 105–114 (100541) |
 * | aviso de alterações | largura da coluna + 20 de cada lado, 20 da borda de baixo | `.noticeRegion__23e6b{max-width:740px;padding:0 20px 20px}` |
 *
 * No Windows o Discord ainda desce o conteúdo 32px pela barra de título
 * (`.platform-win .contentRegionScroller`); aqui a tela começa **abaixo** da
 * nossa barra (`--barra-de-titulo`), que é a mesma coisa sem esconder os
 * botões da janela.
 *
 * **Os dois fechamentos** são essa diferença: X simples no cabeçalho de 48 na
 * `janela`, círculo com "ESC" na `tela-cheia`. `fecharComoEsc` continua
 * aceito e quer dizer `variante="tela-cheia"`.
 *
 * Não usa `Modal` de propósito: `Modal` é a caixa de 380–480px com rodapé de
 * botões. O que se repete de lá é o contrato de acessibilidade — `role="dialog"`,
 * `aria-modal`, Esc fecha, o foco começa dentro e **volta para quem abriu**.
 *
 * ## No celular: mestre-detalhe em tela cheia
 *
 * A janela com menu fixo não cabe num telefone. No celular a mesma moldura vira
 * o que o Discord faz — **duas telas**, não duas colunas:
 *
 * 1. a lista de seções, agrupada em cartões de cantos arredondados, com um
 *    cabeçalho **centralizado** e o fechar sempre à **esquerda** (nunca à
 *    direita: as duas capturas trazem o glifo colado na borda esquerda e o
 *    título no centro da tela — `discord-mobile-config-usuario.png` e
 *    `-config-servidor.png`, MEDIDAS.md §11);
 * 2. tocar num item **empurra a seção em tela cheia**, com seta de voltar
 *    **e o título ao lado dela, à esquerda** (não centralizado — diferente da
 *    lista: `medir.py linha config-usuario-aparencia.png 92 0 719` acha a
 *    seta em x 40–68 e "Appearance" logo depois, em x 101–257 — centro 179
 *    contra o centro real 360 da tela de 720, ou seja **colado à seta**, não
 *    no meio).
 *
 * O glifo do fechar da lista muda com a `variante`: as configurações do
 * **usuário** (`janela`) abrem com **seta** (`config-usuario.png`: "←
 * Settings" — é a mesma pilha da aba Você, "voltar" faz sentido); as do
 * **servidor** (`tela-cheia`) abrem com **X** (`config-servidor.png`: "✕
 * Server Settings" — vem de um menu, não tem para onde "voltar"). O detalhe
 * empurrado é sempre seta, nas duas variantes: dentro da seção sempre existe
 * uma lista para onde voltar.
 *
 * O Esc e o "voltar" do Android desfazem **uma camada por vez**: detalhe →
 * lista → fechado (`useVoltarNoCelular`). O ramo do celular é da onda 8; este
 * cartão (6a) não o redesenhou.
 *
 * Medidas das referências (`docs/Reference/mobile/`,
 * `discord-mobile-config-usuario.png` e `config-servidor.png`, `MEDIDAS.md`
 * §11):
 *
 * | item | medida | origem |
 * |---|---|---|
 * | passo de linha (divisória a divisória) | **55pt** | §11 tinha "37pt" até a correção de 2026-09-09 (o número velho media a altura do *conteúdo* da linha, não o passo — a `panel` errava a linha em quase metade). Confirmado em duas capturas de escala diferente: `config-servidor.png` (738×1600, y=212/315/418/521 → 103px) e `config-usuario.png` (769×1600, y=296/403/511/620 → 108px); as duas batem em 55pt. **55 já passa do piso de 44** — a linha usa a medida, não o piso |
 * | folga entre cartões de grupo | 34pt | §11, "Folga entre seções": 63–64px em `config-servidor.png` |
 * | fundo do cartão | mais **claro** que a página atrás | §11: cartão `#26272F` sobre página `#1B1C22` — por isso o cartão usa `background-base-lower` (mais claro) e a tela `background-base-lowest` (mais escura), a ordem oposta da versão anterior deste arquivo, que pintava o cartão mais escuro que a página |
 * | cabeçalho de grupo ("Account Settings", "Community"…) | **caixa mista**, não caixa-alta | as duas capturas: nenhum cabeçalho de grupo está em maiúsculas, diferente do `EXPRESSÕES` em caixa-alta da barra lateral `tela-cheia` do desktop |
 * | título do cabeçalho da lista | **centralizado na tela cheia**, não na área livre depois do ícone | `medir.py linha config-servidor.png 138 0 737`: X em x 43–51, texto "Server Settings" em x 268–468 → centro 368 (tela 738, centro real 369); `medir.py linha config-usuario.png 59 0 768`: seta em x 43–72, "Settings" em x 334–440 → centro 387 (tela 769, centro real 384). As duas fecham a ±1–3px — daí o espaçador de 44px do lado direito, do mesmo tamanho do ícone da esquerda |
 *
 * Os tamanhos do ramo de celular são literais (`h-[56px]`, `h-[44px]`,
 * `min-h-[55px]`) porque são medida de captura ou piso de toque, não escala do
 * tema.
 */

export interface ItemDeMenu {
  id: string;
  label: string;
  icon?: ReactNode;
  /**
   * Item que existe no Discord e ainda não no Streamz: aparece, não navega
   * (§6.6 do PROCESSO — o rótulo leva o "(em breve)").
   */
  desabilitado?: boolean;
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
  /** cabeçalho do grupo; sem ele os itens ficam soltos (o primeiro grupo do Discord). */
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

export type VarianteDaJanela = "janela" | "tela-cheia";

/**
 * As classes do menu lateral de cada variante (a origem de cada número está na
 * tabela do cabeçalho). Num lugar só porque o item comum e o item de perigo do
 * rodapé ("Sair", "Apagar servidor") precisam da mesma caixa.
 */
const ESTILO = {
  janela: {
    // `font-medium`: o peso não sai de pixel; é o `/medium` que o Discord usa
    // em item de navegação (ver "nao_verificado" do cartão 6a)
    item: "flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-text-md font-medium transition-colors",
    // o hover não aparece em print nenhum: é o da barra de abas lateral do
    // Discord (`.side_aa8da2 .themed_aa8da2.item_aa8da2:hover`)
    repouso:
      "text-text-muted hover:bg-background-mod-subtle hover:text-text-strong active:bg-background-mod-strong active:text-text-strong",
    selecionado: "bg-background-mod-normal text-text-strong",
    desabilitado: "cursor-not-allowed text-text-muted opacity-50",
    espaco: "mb-1",
    // o rótulo quebra linha, como "Privacidade nas atividades" no print —
    // cortar em "Privacidade e segura…" era a divergência
    rotulo: "min-w-0 break-words",
    cabecalho: "px-2 py-2 text-text-sm text-text-muted",
    divisoria: "my-[10px] h-px bg-border-subtle",
  },
  "tela-cheia": {
    item: "flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-text-md font-medium leading-6 transition-colors",
    repouso:
      "text-text-subtle hover:bg-background-mod-subtle hover:text-text-strong active:bg-background-mod-strong active:text-text-strong",
    selecionado: "bg-background-mod-strong text-text-strong",
    // `.disabled_aa8da2.item_aa8da2{color:var(--text-muted);cursor:default}`
    desabilitado: "cursor-default text-text-muted",
    espaco: "mb-0.5",
    // `.item_aa8da2{white-space:nowrap;text-overflow:ellipsis}`
    rotulo: "min-w-0 truncate",
    cabecalho: "px-2.5 py-1.5 text-text-xs font-bold uppercase tracking-[0.02em] text-channels-default",
    divisoria: "mx-2.5 my-2 h-px bg-border-subtle",
  },
} as const;

/**
 * Perigo: `.destructive_aa8da2` — texto `--text-feedback-critical` (não o
 * `--status-danger`, que a revisão mediu no nosso "Sair": `#da3e44` contra o
 * `#f87e7a` do print 114404), fundo `--background-feedback-critical` no
 * hover, e texto claro só no clique.
 */
const PERIGO =
  "text-text-feedback-critical hover:bg-background-feedback-critical active:bg-background-feedback-critical active:text-control-critical-primary-text-default";

const VarianteCtx = createContext<VarianteDaJanela>("janela");

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
  variante: varianteProp,
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
   * usuário. Não é `cabecalho` com outro nome: aquele é uma linha de texto,
   * este é avatar, nome e um atalho.
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
  /** vira o `<h1>` do cabeçalho da `janela`: o nome da aba, não o do objeto. */
  tituloAba?: string;
  /** ver o cabeçalho do arquivo. Padrão `janela`. */
  variante?: VarianteDaJanela;
  /**
   * Nome antigo de `variante="tela-cheia"`, mantido para quem ainda chama
   * assim: nas duas o fechar é o círculo com "ESC" e quem escreve o título é
   * a página.
   */
  fecharComoEsc?: boolean;
  rotuloFechar?: string;
  /** barra de "alterações não salvas": o shell desenha e barra a saída. */
  controle?: ControleDeAlteracoes;
  onClose: () => void;
  children: ReactNode;
}) {
  const variante: VarianteDaJanela = varianteProp ?? (fecharComoEsc ? "tela-cheia" : "janela");
  const painelRef = useRef<HTMLDivElement>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const [secaoVisivel, setSecaoVisivel] = useState<string | null>(null);
  /** a lista do menu saiu do topo: liga o esmaecido sob a busca. */
  const [listaRolada, setListaRolada] = useState(false);
  const ehMobile = useEhMobile();
  /** No celular: `false` = lista de seções, `true` = a seção em tela cheia. */
  const [emDetalhe, setEmDetalhe] = useState(false);

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

  /**
   * Rola até a seção — sem animação para quem pediu menos movimento.
   *
   * O Discord acende o fundo da seção por um instante ao saltar pelo menu
   * (`.flash__75920` + `settingNavAnchorFlash__75920`), mas com
   * `--message-mentioned-background-default` — o mesmo tom (âmbar) do fundo de
   * mensagem que te menciona no chat. Fora do chat isso lê como um realce
   * amarelo sem explicação, então o salto aqui fica só na rolagem; quem marca
   * a seção atual é o traço `--text-strong` ao lado do subitem (`aqui` mais
   * abaixo), que já é o estado "selecionado" do Discord.
   */
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

  // trocar de aba volta o conteúdo ao topo, como no Discord: a página nova não
  // herda a rolagem da anterior
  useEffect(() => {
    rolagemRef.current?.scrollTo?.({ top: 0 });
  }, [abaId]);

  const podeSair = () => !controle || controle.pedirParaSair();

  function irPara(id: string) {
    // no celular a mesma aba pode estar "aberta" e a tela ainda ser a lista:
    // tocar nela tem que empurrar o detalhe
    if (id === abaId && !(ehMobile && !emDetalhe)) return;
    if (!podeSair()) return;
    onAba(id);
    if (ehMobile) setEmDetalhe(true);
  }

  function fechar() {
    if (!podeSair()) return;
    onClose();
  }

  /** No celular, a seta de voltar do detalhe: volta para a lista de seções. */
  function voltarParaALista() {
    if (!podeSair()) return;
    setEmDetalhe(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    // o listener global de atalhos também vê o Esc; parar aqui evita que ele
    // marque o canal como lido "de brinde" ao fechar a tela
    event.stopPropagation();
    // uma camada por vez: no detalhe o Esc volta para a lista, e só na lista
    // ele fecha a janela
    if (ehMobile && emDetalhe) return voltarParaALista();
    fechar();
  }

  // duas camadas para o "voltar" do Android, na ordem em que entram na tela:
  // a janela e, por cima dela, o detalhe. Só a mais alta responde.
  useVoltarNoCelular(ehMobile, fechar);
  useVoltarNoCelular(ehMobile && emDetalhe, voltarParaALista);

  const vazio = grupos.every((g) => g.itens.length === 0);

  const miolo = controle ? (
    <ProvedorDeAlteracoes controle={controle}>
      {children}
      <BarraDeAlteracoes
        controle={controle}
        // `.noticeRegion__23e6b`: a barra mede a coluna de 740 menos 20 de
        // cada lado — 20 a mais que a coluna útil, que tem 40 de recuo
        className={variante === "tela-cheia" && !ehMobile ? "-mx-5" : ""}
      />
    </ProvedorDeAlteracoes>
  ) : (
    children
  );

  if (ehMobile) {
    return (
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        // o foco programático da abertura não é foco de teclado: sem isto o
        // `:focus-visible` global desenhava o anel azul em volta da tela toda
        data-sem-anel
        onKeyDown={onKeyDown}
        // a página é mais escura que os cartões de dentro (MEDIDAS.md §11:
        // #1B1C22 atrás de #26272F) — `lowest`, não `lower`
        className="anim-overlay fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-background-base-lowest pt-[env(safe-area-inset-top)] outline-none"
      >
        {emDetalhe ? (
          <>
            <header className="flex h-[56px] shrink-0 items-center gap-1 border-b border-border-subtle bg-background-base-lowest pl-1 pr-2">
              {/* 44px de alvo é medida do celular, não um tamanho do primitivo
                  (24/32/40) — mesma razão do `style` em vez de className, ver
                  `BotaoDeIcone`. */}
              <BotaoDeIcone
                rotulo="Voltar"
                icone={<ArrowLeft size={24} />}
                tamanho="lg"
                comFundo
                onClick={voltarParaALista}
                className="shrink-0"
                style={{ height: 44, width: 44 }}
              />
              <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-text-strong">
                {tituloAba ?? itemAtivo?.label ?? titulo}
              </h1>
            </header>
            {/* A página **não** rola na horizontal: o que é largo demais (as
                tabelas de Membros, Emoji, Banimentos e Sons, e a fileira de
                filtros de Membros) rola dentro do próprio container, que ganhou
                `overflow-x-auto` na aba. Aqui só se corta o que vazar. */}
            <div
              ref={rolagemRef}
              className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-4"
            >
              {miolo}
            </div>
          </>
        ) : (
          <>
            <header className="flex h-[56px] shrink-0 items-center gap-1 border-b border-border-subtle bg-background-base-lowest pl-1 pr-1">
              {/* Nas duas capturas o glifo mora à ESQUERDA e o título fica no
                  centro da tela — nunca título à esquerda com o X à direita,
                  que era o que este cabeçalho fazia antes. Seta na `janela`
                  (config-usuario.png: "← Settings"), X na `tela-cheia`
                  (config-servidor.png: "✕ Server Settings"). */}
              <BotaoDeIcone
                rotulo={rotuloFechar}
                icone={variante === "tela-cheia" ? <X size={22} /> : <ArrowLeft size={24} />}
                tamanho="lg"
                comFundo
                onClick={fechar}
                className="shrink-0"
                style={{ height: 44, width: 44 }}
              />
              <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold text-text-strong">
                {titulo}
              </h1>
              {/* espaçador do mesmo tamanho do botão: sem ele o título centra
                  na largura toda e não na área livre, e fica puxado para a
                  direita do centro real da tela */}
              <span aria-hidden="true" className="w-[44px] shrink-0" />
            </header>

            <nav
              aria-label="Seções das configurações"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3"
            >
              {cabecalho !== undefined &&
                (onCabecalho ? (
                  <button
                    type="button"
                    onClick={onCabecalho}
                    aria-haspopup="menu"
                    className="mb-2 flex h-[44px] w-full items-center gap-1 rounded-lg px-1 text-left transition active:bg-interactive-background-hover"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.02em] text-text-muted">
                      {cabecalho}
                    </span>
                    <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
                  </button>
                ) : (
                  <h2 className="mb-2 truncate px-1 text-xs font-bold uppercase tracking-[0.02em] text-text-muted">
                    {cabecalho}
                  </h2>
                ))}

              {cabecalhoRico && <div className="mb-3">{cabecalhoRico}</div>}

              {busca && (
                // Caixa própria (sem borda, fundo `chat`) em vez do
                // `input-background-default` padrão do `TextInput`: é o
                // campo de busca "dentro do menu", não um formulário — o
                // `border-none` apaga a borda que o primitivo sempre inclui
                // no wrapper (o foco em si é global, ver `TextInput`).
                <TextInput
                  value={busca.valor}
                  onChange={(e) => busca.onChange(e.target.value)}
                  placeholder={busca.placeholder ?? "Buscar"}
                  aria-label={busca.rotulo}
                  prefixo={<Search size={16} aria-hidden="true" className="text-text-muted" />}
                  classeDaCaixa="mb-4 border-none bg-chat-background-default"
                />
              )}

              {grupos.map((grupo) => {
                if (grupo.itens.length === 0) return null;
                // as abas do servidor não têm ícone; sem isto o cartão delas
                // ficava com 36px de coluna vazia antes de cada rótulo
                const comIcone = grupo.itens.some((i) => i.icon);
                return (
                  // 34pt de folga entre cartões — MEDIDAS.md §11 "Folga entre
                  // seções" (63–64px em config-servidor.png)
                  <div key={grupo.id} className="mb-[34px] last:mb-0">
                    {grupo.label && (
                      // sem `uppercase`: as duas capturas mostram "Account
                      // Settings", "Community" em caixa mista, não em
                      // maiúsculas — diferente do cabeçalho de grupo da barra
                      // lateral `tela-cheia` do desktop, que é caixa-alta
                      <h2 className="mb-1.5 px-1 text-xs font-bold text-text-muted">
                        {grupo.label}
                      </h2>
                    )}
                    {/* cartão de cantos arredondados com as linhas dentro, e a
                        divisória recuada até a coluna do rótulo — é o desenho
                        das duas referências. `background-base-lower`: o
                        cartão é mais CLARO que a página atrás dele
                        (`#26272F` sobre `#1B1C22`, MEDIDAS.md §11) */}
                    <div className="overflow-hidden rounded-xl bg-background-base-lower">
                      {grupo.itens.map((item, i) => (
                        <div key={item.id}>
                          {i > 0 && (
                            <div
                              aria-hidden="true"
                              className={`h-px bg-border-subtle ${comIcone ? "ml-[52px]" : "ml-4"}`}
                            />
                          )}
                          <button
                            type="button"
                            aria-disabled={item.desabilitado || undefined}
                            onClick={() => !item.desabilitado && irPara(item.id)}
                            // 55px: passo de linha medido (ver cabeçalho do
                            // arquivo) — não é o piso de 44, é a medida
                            className={`flex min-h-[55px] w-full items-center gap-3 px-4 py-2 text-left text-base transition active:bg-interactive-background-hover ${
                              item.desabilitado ? "text-text-muted opacity-50" : "text-text-default"
                            }`}
                          >
                            {comIcone && (
                              <span
                                aria-hidden="true"
                                className="grid h-6 w-6 shrink-0 place-items-center text-text-subtle"
                              >
                                {item.icon}
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            <ChevronRight
                              size={20}
                              aria-hidden="true"
                              className="shrink-0 text-text-muted"
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {vazio && menuVazio}

              {rodapeMenu && (
                // os itens do rodapé vêm com os 40px do desktop; aqui sobem
                // para o mesmo passo de linha do resto da lista (55px, não o
                // piso de 44 — ver a tabela do cabeçalho). Mesmo cartão claro
                // sobre página escura que os grupos acima.
                <div className="mt-5 overflow-hidden rounded-xl bg-background-base-lower p-1 [&>div]:mb-0 [&_button]:min-h-[55px]">
                  {rodapeMenu}
                </div>
              )}
            </nav>
          </>
        )}
      </div>
    );
  }

  const e = ESTILO[variante];

  /** A lista de grupos do menu — igual nas duas variantes, muda só a classe. */
  const listaDoMenu = (
    <>
      {grupos
        .filter((g) => g.itens.length > 0)
        .map((grupo, i) => (
          <div key={grupo.id} role="group" aria-label={grupo.label}>
            {/* Divisória entre grupos, nos dois desenhos (114404 acima de
                "Jogos e apps"; 100541 acima de EXPRESSÕES). O primeiro grupo
                não tem — nem cabeçalho, no refresh. */}
            {i > 0 && <div aria-hidden="true" className={e.divisoria} />}
            {grupo.label && <h2 className={e.cabecalho}>{grupo.label}</h2>}
            {grupo.itens.map((item) => {
              const ativo = item.id === abaId;
              const estado = item.desabilitado ? e.desabilitado : ativo ? e.selecionado : e.repouso;
              return (
                <div key={item.id} className={e.espaco}>
                  <button
                    type="button"
                    aria-current={ativo ? "page" : undefined}
                    aria-disabled={item.desabilitado || undefined}
                    onClick={() => !item.desabilitado && irPara(item.id)}
                    className={`${e.item} ${estado}`}
                  >
                    {item.icon && (
                      // caixa de 20: é a medida do ícone no print (x 287–306)
                      <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center">
                        {item.icon}
                      </span>
                    )}
                    <span className={e.rotulo}>{item.label}</span>
                  </button>

                  {/* Só da aba aberta: as seções das outras não são navegáveis
                      daqui, e listá-las faria um menu de cinquenta linhas. O
                      trilho corre do centro do ícone (x=296 no print, 19 da
                      borda do item), de 10 abaixo do topo do primeiro subitem
                      a 10 acima do fim do último. */}
                  {ativo && item.secoes && item.secoes.length > 0 && (
                    <div className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute bottom-[10px] left-[19px] top-[10px] w-[2px] bg-border-subtle"
                      />
                      {item.secoes.map((secao) => {
                        const aqui = secao.id === secaoVisivel;
                        return (
                          <button
                            key={secao.id}
                            type="button"
                            aria-current={aqui ? "true" : undefined}
                            onClick={() => irParaSecao(secao.id)}
                            // hover sem fundo: no print o subitem não tem caixa
                            // em estado nenhum; a cor do hover não foi medida
                            className={`relative flex min-h-[40px] w-full items-center rounded-lg py-2.5 pl-10 pr-2.5 text-left text-text-md transition-colors ${
                              aqui ? "text-text-strong" : "text-text-muted hover:text-text-strong"
                            }`}
                          >
                            {aqui && (
                              <span
                                aria-hidden="true"
                                className="absolute bottom-[10px] left-[19px] top-[10px] w-[2px] bg-text-strong"
                              />
                            )}
                            <span className="min-w-0 break-words">{secao.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      {vazio && menuVazio}

      {rodapeMenu && (
        <>
          <div aria-hidden="true" className={e.divisoria} />
          {rodapeMenu}
        </>
      )}
    </>
  );

  const cabecalhoDoMenu =
    cabecalho !== undefined &&
    (onCabecalho ? (
      <button
        type="button"
        onClick={onCabecalho}
        aria-haspopup="menu"
        // o chevron é nosso (o cabeçalho do Discord não abre menu): é por aqui
        // que "Convidar", "Criar canal" e "Apagar/Sair" continuam a um clique
        className={`${e.cabecalho} flex w-full items-center gap-1 rounded text-left transition-colors hover:text-text-strong ${
          variante === "tela-cheia" ? "pt-0" : ""
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{cabecalho}</span>
        <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
      </button>
    ) : (
      <h2 className={`${e.cabecalho} truncate ${variante === "tela-cheia" ? "pt-0" : ""}`}>{cabecalho}</h2>
    ));

  const campoDeBusca = busca && (
    // 40 de altura é o próprio `md` do `TextInput` — os 220×40 do print
    <TextInput
      value={busca.valor}
      onChange={(ev) => busca.onChange(ev.target.value)}
      placeholder={busca.placeholder ?? "Buscar"}
      aria-label={busca.rotulo}
      prefixo={<Search size={16} aria-hidden="true" className="text-text-muted" />}
    />
  );

  if (variante === "tela-cheia") {
    return (
      <VarianteCtx.Provider value={variante}>
        <div
          ref={painelRef}
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          tabIndex={-1}
          data-sem-anel
          onKeyDown={onKeyDown}
          // abaixo da barra de título (ver o cabeçalho): cobri-la esconderia
          // minimizar/fechar a janela enquanto as configurações estão abertas
          style={{ top: "var(--barra-de-titulo, 0px)" }}
          className="anim-settings fixed inset-x-0 bottom-0 z-50 flex bg-background-base-lowest outline-none"
        >
          <div className="flex min-w-0 flex-[1_0_272px] justify-end bg-background-base-lowest">
            <nav
              aria-label="Seções das configurações"
              // 6 de recuo + 8 da barra de rolagem reservada = os 14 do print;
              // `scrollbar-gutter` segura os 8 mesmo sem rolagem, e o item não
              // muda de largura quando a lista passa a rolar
              className="w-[272px] shrink-0 overflow-y-auto pb-[60px] pl-5 pr-[6px] pt-[60px] [scrollbar-gutter:stable]"
            >
              {cabecalhoDoMenu}
              {cabecalhoRico}
              {campoDeBusca && <div className="mb-2">{campoDeBusca}</div>}
              {listaDoMenu}
            </nav>
          </div>

          <div className="relative flex min-w-0 flex-[1_1_800px] bg-background-base-low">
            <div
              ref={rolagemRef}
              className="flex h-full w-full items-start overflow-y-auto overflow-x-hidden"
            >
              <div className="min-w-0 max-w-[740px] flex-[1_1_auto] px-10 pb-20 pt-[60px]">{miolo}</div>

              {/* A coluna de ferramentas não rola com a página
                  (`.contentRegionScroller__23e6b .tools__23e6b{position:
                  fixed}`): `sticky` no topo do scroller faz o mesmo sem tirar
                  o botão do fluxo, que é o que o mantém colado à coluna. */}
              <div className="sticky top-0 mr-[21px] flex-[0_0_36px] pt-[60px]">
                {/* `<button>` e não `BotaoDeIcone`: é círculo + rótulo "ESC" em
                    duas linhas, composição que o primitivo não cobre. */}
                <Tooltip rotulo={rotuloFechar} atalho="Esc">
                  <button
                    type="button"
                    onClick={fechar}
                    aria-label={rotuloFechar}
                    // a cor do hover não foi medida: é o par default→hover do
                    // mesmo token do ícone (`--interactive-icon-*`)
                    className="flex w-9 flex-col items-center gap-2 text-interactive-icon-default transition-colors hover:text-interactive-icon-hover"
                  >
                    <span
                      aria-hidden="true"
                      className="grid h-9 w-9 place-items-center rounded-full border-2 border-current"
                    >
                      {/* 13px desenha o X de 10 do print (o glifo ocupa 3/4 do quadro) */}
                      <X size={13} />
                    </span>
                    {/* glifo de 8px de altura no print → 11px de corpo */}
                    <span aria-hidden="true" className="text-[11px] font-bold leading-none tracking-[0.02em]">
                      ESC
                    </span>
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </VarianteCtx.Provider>
    );
  }

  return (
    <VarianteCtx.Provider value={variante}>
      <div
        // `flex` e não `grid`: numa grade o trilho automático cresce até o
        // max-content do modal (1400px), e aí `max-w-full` mede 100% de 1400 em
        // vez da janela. Até 1080px o modal vira tela cheia e desce para baixo
        // da barra de título, como o `padding-top` do `.modal_e44912`.
        className="anim-overlay fixed inset-0 z-50 flex items-center justify-center bg-background-scrim max-[1080px]:top-[var(--barra-de-titulo,0px)]"
        onMouseDown={(ev) => {
          // só o clique que **começa** no véu fecha: arrastar um controle de
          // dentro e soltar aqui fora não pode derrubar a tela
          if (ev.target === ev.currentTarget) fechar();
        }}
      >
        <div
          ref={painelRef}
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          tabIndex={-1}
          // O painel recebe `focus()` ao abrir (para o Esc funcionar e o foco
          // voltar depois). Isso não é foco de teclado, e a revisão mediu o
          // anel azul de 2px do `:focus-visible` global em volta da janela
          // inteira (x=256–257/1662–1663) — o Discord não tem anel nenhum ali.
          data-sem-anel
          onKeyDown={onKeyDown}
          className="anim-settings flex h-[calc(100%-144px)] w-[calc(100%-144px)] max-w-[1400px] overflow-hidden rounded-xl border border-border-subtle bg-background-base-lower shadow-popout outline-none max-[1600px]:h-[calc(100%-80px)] max-[1600px]:w-[calc(100%-80px)] max-[1080px]:h-full max-[1080px]:w-full max-[1080px]:max-w-none max-[1080px]:rounded-none max-[1080px]:border-0 max-[1080px]:border-t max-[1080px]:border-border-muted"
        >
          <nav aria-label="Seções das configurações" className="flex w-[252px] shrink-0 flex-col overflow-hidden">
            {/* Cartão de perfil e busca ficam parados; só a lista rola (a mesma
                altura do cartão em 114404 e 114644, com a lista em posições
                diferentes). 16 de cada lado: itens de 220 em 252. */}
            <div className="shrink-0 px-4 pt-4">
              {cabecalhoDoMenu}
              {cabecalhoRico}
              {campoDeBusca}
            </div>

            {/* 12 entre a busca e o primeiro item (114644: busca termina em
                y=206, "Conta" começa em y=219). Rolada, a lista some num
                gradiente de 40px sob a busca, em vez de cortar seco. */}
            <div
              onScroll={(ev) => setListaRolada(ev.currentTarget.scrollTop > 0)}
              className={`min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 ${
                listaRolada ? "[mask-image:linear-gradient(to_bottom,transparent,black_40px)]" : ""
              }`}
            >
              {listaDoMenu}
            </div>
          </nav>

          <div className="relative flex min-w-0 flex-1 flex-col bg-background-base-low">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-muted pl-4 pr-2">
              <h1 className="min-w-0 flex-1 truncate text-text-md font-semibold text-text-default">{tituloAba}</h1>
              {/* `md` (32) com X de 16 põe o glifo de 12 com o centro a 24 da
                  borda, como no print. Pílula no hover: não medido. */}
              <BotaoDeIcone
                rotulo={rotuloFechar}
                icone={<X size={16} />}
                tamanho="md"
                comFundo
                atalho="Esc"
                onClick={fechar}
                className="shrink-0 rounded-full"
              />
            </header>

            {/* Coluna útil de 700 (780 − 2×40), centrada. O respiro de cima
                muda de página para página nos prints (28 em Aparência, 76 em
                Sobreposição de jogo) — os 40 são os de antes, "não medido". */}
            <div ref={rolagemRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[780px] px-10 pb-10 pt-10">{miolo}</div>
            </div>
          </div>
        </div>
      </div>
    </VarianteCtx.Provider>
  );
}

/**
 * Item vermelho do fim da barra lateral ("Sair", "Apagar canal", "Apagar
 * servidor"): a mesma caixa dos itens da variante em uso, com as cores de
 * perigo.
 */
export function ItemPerigo({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const e = ESTILO[useContext(VarianteCtx)];
  return (
    <div className={e.espaco}>
      <button type="button" onClick={onClick} className={`${e.item} ${PERIGO}`}>
        {icon && (
          <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center">
            {icon}
          </span>
        )}
        <span className={e.rotulo}>{children}</span>
      </button>
    </div>
  );
}
