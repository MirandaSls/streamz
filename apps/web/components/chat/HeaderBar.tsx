"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AtSign, Hash, Paperclip, Search, SlidersHorizontal, User, X } from "@/components/ui/icones";
import { Popout, Tooltip } from "@/components/ui/primitivos";

export { default as HeaderIcon } from "@/components/chat/HeaderIcon";

/**
 * Cabeçalho do canal e da conversa: ícone + nome à esquerda, toolbar à direita
 * com a busca no fim.
 *
 * **Ele atravessa a área de conteúdo inteira** — é a peça que este arquivo
 * entrega, e não só uma barra. No Discord a barra vai do fim da coluna de
 * canais até a borda da janela, **por cima** da coluna de membros, e a coluna
 * de membros começa embaixo dela. Medido no print 1:1 `2026-09-02 180835`
 * (janela de 1919, barra de título de 32px no topo):
 *
 * - em `y=57` a barra é `#1a1a1e` contínuo de `x=375` (fim da coluna de
 *   canais) até `x=1918` (borda da janela), com a busca em `x1662–1905` — ou
 *   seja, sobre a coluna de membros;
 * - a divisória da coluna de membros (`#29292d` em `x=1651`) **não** existe em
 *   `y=57` e aparece a partir de `y=82`, logo abaixo da linha de baixo do
 *   cabeçalho (`#29292d` em `y=81`);
 * - a coluna `x=1912` dá a altura: `y 33–80` de barra (48px) + 1px de linha em
 *   `y=81` = os 49 do `--custom-channel-header-height` do CSS bruto
 *   (`858942…css`, `.container__9293f`).
 *
 * Como o `ChatView` e o `DMView` montam a timeline e a coluna 4 de jeitos
 * diferentes, quem faz a travessia é a própria barra: ela é `absolute` sobre a
 * **região de conteúdo** — o invólucro `relative` que `app/app/page.tsx` põe em
 * volta da conversa e da lista de membros — e deixa no fluxo, no lugar dela, um
 * espaçador de 49px. Assim o `<main>` de quem chama continua sendo uma coluna
 * que começa com 49px de cabeçalho, como antes, e a lista de membros, que é
 * irmã da conversa dentro da região, cabe embaixo da barra com um `pt-[49px]`.
 * **Um chamador novo precisa desse invólucro `relative`**: sem ele a barra se
 * ancora na janela.
 *
 * A toolbar carrega só o que age sobre o canal aberto: ações genéricas do app
 * (ajuda, caixa de entrada) e o que já existe no menu de contexto do canal
 * (configurações do servidor) ficam de fora para não poluir a barra.
 *
 * Quem chama entrega a fileira inteira em `tools`, na ordem do Discord — o
 * alfinete fica no meio dela (threads → sino → alfinete → membros no servidor;
 * telefone → vídeo → alfinete → adicionar → perfil na conversa), então não há
 * um lugar fixo "das fixadas" aqui.
 *
 * Medido no print do Discord (1919px): caixas de ícone com passo de 42px
 * (centros da tinta em 1507,5 / 1547,5 / 1590 / 1629 no `180835`) e a busca de
 * 244×32, raio 8 (`--radius-sm`), texto a 8px da borda.
 *
 * **A busca abre o popout "Filtros" ao ganhar foco** (cartão 2m-busca), no lugar
 * da lista de prefixos em inglês que morava num tooltip. Ver `FiltrosDaBusca`
 * logo abaixo para as medidas.
 */
export default function HeaderBar({
  icon,
  title,
  subtitle,
  tools,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearch,
  semFiltroDeCanal = false,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** botões antes da busca, já na ordem (variam entre canal e DM). */
  tools?: ReactNode;
  searchLabel: string;
  /** vai no placeholder: no Discord é "Buscar <servidor|usuário|grupo>", não um "Buscar" solto. */
  searchPlaceholder?: string;
  /** consulta em vigor — mantém o campo preenchido ao reabrir a busca. */
  searchValue?: string;
  onSearch: (query: string) => void;
  /**
   * Tira a linha `em:` do popout. Numa conversa direta a busca já corre só no
   * canal aberto e a API ignora `in:` (`messages.service.ts`, `search`), então
   * oferecer o filtro seria oferecer algo que não filtra.
   */
  semFiltroDeCanal?: boolean;
}) {
  const [query, setQuery] = useState(searchValue ?? "");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  /** linha realçada pelas setas (−1 = nenhuma; Enter então busca). */
  const [ativo, setAtivo] = useState(-1);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idDaLista = useId();

  // A consulta muda por fora — o "limpar" do painel, a troca de canal que zera
  // a busca no store — e o campo precisa acompanhar, senão fica mostrando uma
  // busca que já não existe. Digitar não passa por aqui: `searchValue` só muda
  // quando alguém envia.
  useEffect(() => {
    setQuery(searchValue ?? "");
  }, [searchValue]);

  const linhas = semFiltroDeCanal ? LINHAS_DE_FILTRO.filter((l) => l.prefixo !== "em:") : LINHAS_DE_FILTRO;
  const habilitadas = linhas.filter((l) => l.prefixo);

  function abrirFiltros() {
    setAtivo(-1);
    setFiltrosAbertos(true);
  }

  function fecharFiltros() {
    setFiltrosAbertos(false);
    setAtivo(-1);
  }

  /** Acrescenta o prefixo ao fim da consulta, com o cursor logo depois dele. */
  function inserirPrefixo(prefixo: string) {
    const base = query.trimEnd();
    const nova = `${base}${base ? " " : ""}${prefixo}`;
    setQuery(nova);
    setAtivo(-1);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nova.length, nova.length);
    });
  }

  function limpar() {
    setQuery("");
    fecharFiltros();
    onSearch("");
    inputRef.current?.focus();
  }

  const comTexto = query.length > 0;

  return (
    <>
      {/* O lugar da barra no fluxo da coluna: ela mesma está fora dele (ver o
          cabeçalho do arquivo), e sem este bloco a timeline subiria por baixo. */}
      <div aria-hidden="true" className="h-[49px] shrink-0" />

      {/* `bg-background-base-lower`: agora que a barra flutua sobre a região,
          ela precisa do próprio fundo — e é o do Discord, `#1a1a1e`, tanto no
          CSS (`--__header-bar-background` de `.container__9293f`) quanto no
          print (`180835`, x=600 y=57).
          Sem sombra: no print a linha de 1px (`#29292d`, y=81) é seguida por
          `#1a1a1e` puro (x=900, y 82–100), enquanto a nossa `shadow-elevation-low`
          borrava 2px por baixo dela (`canal-texto.png`, x=900: #121216 em y=49 e
          #18181b em y=50). O CSS do Discord também traz `box-shadow:none`. */}
      <header className="absolute inset-x-0 top-0 z-10 flex h-[49px] items-center gap-2 border-b border-border-subtle bg-background-base-lower px-4">
        {/* `text-channel-icon` (#81828a) e não `text-text-muted` (#96979e): é o
            `--channel-icon` do CSS (`.icon__9293f`), e a tinta do "#" no print
            `180835` (y=50, x=401) mede #81828a. Em DM o `icon` é um avatar e a
            classe não pinta nada. */}
        <span className="text-channel-icon" aria-hidden="true">
          {icon}
        </span>
        {/* `min-w-0` é o que faz o `truncate` valer dentro de um flex: sem ele o
            título empurra a toolbar para fora em vez de cortar o próprio texto */}
        <h1 className="min-w-0 truncate font-semibold text-text-strong">{title}</h1>
        {subtitle && (
          <>
            <span aria-hidden="true" className="mx-2 h-6 w-px bg-border-subtle" />
            <span className="truncate text-sm text-text-muted">{subtitle}</span>
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-[18px]">
          {tools}
          <form
            ref={formRef}
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              fecharFiltros();
              onSearch(query);
            }}
            className="relative"
          >
            {/* continua <input> nativo, não `TextInput`: o primitivo não expõe
                tamanho nem o par de tokens de campo desta caixa — ver cartão m14
                em "faltando". */}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // digitar com o popout fechado por Esc reabre, como abrir de novo
                if (!filtrosAbertos) setFiltrosAbertos(true);
                setAtivo(-1);
              }}
              onFocus={abrirFiltros}
              // clicar numa linha não tira o foco daqui (`onMouseDown` com
              // `preventDefault` nela), então perder o foco é sair da busca
              onBlur={fecharFiltros}
              onKeyDown={(e) => {
                if (!filtrosAbertos) return;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const n = habilitadas.length;
                  setAtivo((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
                } else if (e.key === "Enter" && ativo >= 0) {
                  e.preventDefault();
                  inserirPrefixo(habilitadas[ativo].prefixo as string);
                }
              }}
              type="text"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={filtrosAbertos}
              aria-controls={idDaLista}
              aria-autocomplete="list"
              aria-activedescendant={ativo >= 0 ? `${idDaLista}-${ativo}` : undefined}
              aria-label={searchLabel}
              placeholder={searchPlaceholder ?? "Buscar"}
              /* Sem o anel de foco global (`data-sem-anel`): no print
                 `113513`, com o popout "Filtros" aberto — ou seja, com o campo
                 em foco —, as bordas de cima e de baixo (coluna x=1250, y=41 e
                 y=72) continuam #303035 = `--input-border-default`. A borda
                 limão do `input:focus-visible` do globals.css não existe nesta
                 caixa; o popout é o indicador.
                 fixa, não mais expansível: no Discord a caixa já nasce do
                 tamanho final. A busca que cresce ao focar empurrava os ícones
                 vizinhos e fazia a barra inteira dançar a cada clique.
                 244×32 e raio 8: print `180835`, linha y=57 (bordas em x=1662
                 e x=1905) e coluna x=1750 (bordas em y=41 e y=72).
                 Os tokens são os do campo do Discord — `.searchBar_c322aa` do
                 CSS bruto (`398929…css`) é `background:var(--input-background-default)`
                 com `border:1px solid var(--input-border-default)` e
                 `border-radius:var(--radius-sm)`. `--input-background-default`
                 (preto a 12%) sobre `--background-base-lower` dá exatamente o
                 #17171a do print; a borda mede #303035.
                 Placeholder `--input-placeholder-text-default`: a tinta de
                 "Buscar Notas" no `113513` (x1034–1113, y52–61) chega a #8f9097,
                 que é esse token, e não o #96979e do `text-muted` de antes. */
              data-sem-anel=""
              className="h-[32px] w-[244px] rounded-lg border border-input-border-default bg-input-background-default pl-2 pr-[30px] text-sm text-text-default outline-none placeholder:text-input-placeholder-text-default"
            />
            {/* Lupa com o campo vazio, X com texto — a troca do Discord
                (a lupa no `113513` com o campo vazio; o X no GIF de suporte
                `how-to-use-search-on-discord/05.gif`, com `from: the_real_phibi`).
                Tinta da lupa: 15×15 em #abacb2 = `--input-icon-default`
                (`113513`, x1247–1261, y49–63), a 5px da borda direita — o
                `size={17}` com `right-[5px]` já dava 15px de tinta e os mesmos 5
                na nossa `busca.png` (x1466–1481 contra a borda em 1487). */}
            {comTexto ? (
              <button
                type="button"
                aria-label="Limpar a busca"
                // o clique não pode tirar o foco do campo antes de limpar
                onMouseDown={(e) => e.preventDefault()}
                onClick={limpar}
                className="absolute right-[5px] top-1/2 flex h-[20px] w-[20px] -translate-y-1/2 items-center justify-center rounded text-input-icon-default hover:text-interactive-text-hover"
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : (
              <Search
                size={17}
                aria-hidden="true"
                className="pointer-events-none absolute right-[5px] top-1/2 -translate-y-1/2 text-input-icon-default"
              />
            )}
          </form>
          <Popout
            aberto={filtrosAbertos}
            aoFechar={fecharFiltros}
            ancora={formRef}
            lado="bottom"
            alinhamento="end"
            /* 8px abaixo do campo: borda de baixo do campo em y=72 e borda de
               cima do popout em y=81 (`113513`, coluna x=1250). Borda direita
               do popout em x=1269, 2px além da do campo (x=1267) — no
               alinhamento `end` o deslocamento negativo empurra para fora. */
            distancia={8}
            deslocamento={-2}
            rotulo="Filtros"
            papel="presentation"
            // o foco fica no campo: é nele que se digita o valor do filtro
            prenderFoco={false}
            focarAoAbrir={false}
            devolverFoco={false}
            // uma caixa de 356 cabe nos 390 do celular; a folha inferior
            // levantaria por cima do teclado que o próprio campo abriu
            folhaNoCelular={false}
            /* A caixa é a do `.container__16eb0` (css-bruto/sob-demanda/
               41486cd6f70b5ab4.css), que não é a do popout genérico: borda 1px
               `--border-subtle` de verdade (o `113513` mede #323237 em x=914 e
               x=1269, que é `--border-subtle` sobre #242429) e `--shadow-high`
               sem o `--shadow-border`. Por isso `superficie="nenhuma"` e a
               entrada `anim-menu` aqui. */
            superficie="nenhuma"
            className="w-[356px] rounded-lg border border-border-subtle bg-background-surface-high px-2 py-3 shadow-shadow-high anim-menu"
          >
            <FiltrosDaBusca
              idDaLista={idDaLista}
              linhas={linhas}
              ativo={ativo}
              aoEscolher={inserirPrefixo}
              aoApontar={(i) => setAtivo(i)}
            />
          </Popout>
        </div>
      </header>
    </>
  );
}

interface LinhaDeFiltro {
  icone: ReactNode;
  titulo: string;
  /** o que se digita; `null` = linha sem filtro por trás (fica "em breve"). */
  prefixo: string | null;
  dica: string;
}

/**
 * As cinco linhas do popout, na ordem e com o texto do Discord em pt-BR (print
 * 1:1 `docs/Reference/Captura de tela 2026-09-01 113513.png`). A última abre o
 * modal "Filtros" do Discord (datas, tipo de autor…), que o Streamz não tem:
 * fica visível e desabilitada com "(em breve)" (§6.6 do PROCESSO). As datas já
 * funcionam digitadas (`antes:`, `depois:`, `durante:`) — o painel de
 * resultados ensina isso quando não acha nada.
 */
const LINHAS_DE_FILTRO: LinhaDeFiltro[] = [
  { icone: <User size={20} />, titulo: "De um usuário específico", prefixo: "de:", dica: "usuário" },
  { icone: <Hash size={20} />, titulo: "Enviado em um canal específico", prefixo: "em:", dica: "canal" },
  { icone: <Paperclip size={20} />, titulo: "Inclui um tipo específico de dados", prefixo: "tem:", dica: "link, anexo ou arquivo" },
  { icone: <AtSign size={20} />, titulo: "Menciona um usuário específico", prefixo: "menciona:", dica: "usuário" },
  { icone: <SlidersHorizontal size={20} />, titulo: "Mais filtros", prefixo: null, dica: "datas, tipo de autor e muito mais" },
];

/**
 * Miolo do popout "Filtros". Medido no print 1:1 `113513` (janela de 1283 em
 * zoom 100%) e no CSS `.container__16eb0`:
 *
 * - caixa 356 de borda a borda (x914–1269), 290 de altura (y81–370), padding
 *   12×8 (`padding: var(--space-12) var(--space-8)`), fundo #242429 =
 *   `--background-surface-high`;
 * - 288 por dentro = 12 + **24 de cabeçalho** + **5 × 48 de linha** + 12 — o
 *   passo de 48 é o das linhas de base dos títulos (y≈139, 187, 235, 283, 331);
 * - "Filtros": tinta x931–964, y101–109, #abacb2 = `--text-subtle`; 9px de
 *   caixa-alta = 12px de fonte; a 8px da borda interna (x=923), igual aos ícones;
 * - ícone: tinta 16–18px (x933–948) em #96979e = `--icon-muted`, numa caixa de
 *   20 que começa a 8 da borda da linha; título a 8 do ícone (x=959);
 * - título #fbfbfb = `--text-strong`, dica logo abaixo com 18px entre as linhas
 *   de base (139 → 157) — 14px nas duas (a tinta de "De um usuário específico"
 *   tem 13px com o "p", o que dá 14); o prefixo da dica ("de:") é mais forte e
 *   mais claro, #abacb2 = `--text-subtle`, e o resto #96979e = `--text-muted`
 *   (a dica de "Mais filtros", que não tem prefixo, não passa de #96979e).
 *
 * Hover e linha ativa pelas setas: não aparecem no print. O GIF de suporte
 * `how-to-use-search-on-discord/04.gif` mostra a linha apontada com um fundo
 * cinza arredondado — cor e raio "não medidos"; usamos
 * `--interactive-background-hover` e 8 (`--radius-sm`), o par dos itens de
 * lista do resto do app.
 */
function FiltrosDaBusca({
  idDaLista,
  linhas,
  ativo,
  aoEscolher,
  aoApontar,
}: {
  idDaLista: string;
  linhas: LinhaDeFiltro[];
  ativo: number;
  aoEscolher: (prefixo: string) => void;
  aoApontar: (indice: number) => void;
}) {
  return (
    <div>
      <div
        id={`${idDaLista}-titulo`}
        className="h-[24px] px-2 pb-[6px] pt-[2px] text-text-xs font-semibold leading-4 text-text-subtle"
      >
        Filtros
      </div>
      <div role="listbox" id={idDaLista} aria-labelledby={`${idDaLista}-titulo`}>
        {linhas.map((linha, i) => {
          const conteudo = (
            <>
              <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center text-icon-muted" aria-hidden="true">
                {linha.icone}
              </span>
              <span className="min-w-0 text-text-sm leading-[18px]">
                <span className="block truncate font-semibold text-text-strong">{linha.titulo}</span>
                <span className="block truncate text-text-muted">
                  {linha.prefixo && <span className="font-semibold text-text-subtle">{linha.prefixo} </span>}
                  {linha.dica}
                </span>
              </span>
            </>
          );

          if (!linha.prefixo) {
            return (
              <Tooltip key={linha.titulo} rotulo="Mais filtros (em breve)" lado="left" className="w-full">
                <div
                  role="option"
                  aria-disabled="true"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  className="flex h-[48px] w-full cursor-not-allowed items-center gap-2 rounded-lg px-2 opacity-50"
                >
                  {conteudo}
                </div>
              </Tooltip>
            );
          }

          // o índice das setas conta só as linhas que filtram (a desabilitada
          // não recebe realce), na mesma ordem de `habilitadas` no HeaderBar
          const meu = linhas.slice(0, i).filter((l) => l.prefixo).length;
          const realcada = ativo === meu;
          return (
            <div
              key={linha.titulo}
              id={`${idDaLista}-${meu}`}
              role="option"
              aria-selected={realcada}
              // `preventDefault` no mousedown: o foco fica no campo e o `onBlur`
              // dele não fecha o popout antes do clique chegar
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => aoEscolher(linha.prefixo as string)}
              onPointerMove={() => {
                if (!realcada) aoApontar(meu);
              }}
              className={`flex h-[48px] cursor-pointer items-center gap-2 rounded-lg px-2 ${
                realcada ? "bg-interactive-background-hover" : ""
              }`}
            >
              {conteudo}
            </div>
          );
        })}
      </div>
    </div>
  );
}
