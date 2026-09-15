"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { displayNameOf, type PublicUser } from "@streamz/shared";
import Avatar from "@/components/ui/Avatar";
import MaisFiltrosDaBusca, { type CanalSugerivel } from "@/components/chat/MaisFiltrosDaBusca";
import {
  AtSign,
  FileText,
  Hash,
  Image as IconeDeImagem,
  Link2,
  Megaphone,
  Paperclip,
  Search,
  SlidersHorizontal,
  User,
  Volume2,
  X,
} from "@/components/ui/icones";
import { Popout, TextInput } from "@/components/ui/primitivos";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useUI } from "@/stores/ui";

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
 * Medido no print do Discord (1919px): caixas de ícone com passo de 42px e a
 * busca de 244×32, raio 8 (`--radius-sm`), texto a 8px da borda. Remedido no
 * cartão cabecalho-do-canal, pela caixa da tinta de cada glifo no `180835`
 * (y 36–78, fundo #1a1a1e): x1496–1515, 1540–1555, 1582–1599 e 1623–1640,
 * centros 1505,5 / 1547,5 / 1590,5 / 1631,5 — passos de 42, 43 e 41 (126/3 =
 * 42). O `HeaderIcon` agora tem a caixa de 32 do `.iconWrapper__9293f`, então o
 * vão entre ícones é **10** (32 + 10 = 42; antes 24 + 18). O CSS diz
 * `.toolbar__9293f{gap:var(--space-xs)}` = 8, que daria 40: o print manda. Da
 * caixa do último ícone (centro 1631,5 → borda em 1647,5) até a borda da busca
 * (x=1662) são **14**, daí o `ml-1` da busca somado aos 10.
 *
 * **A busca abre o popout "Filtros" ao ganhar foco** (cartão 2m-busca), no lugar
 * da lista de prefixos em inglês que morava num tooltip. Ver `FiltrosDaBusca`
 * logo abaixo para as medidas.
 *
 * Cartão cabecalho-do-canal:
 * - **Ctrl+F** foca o campo e abre o popout: o atalho (`useKeyboardShortcuts`)
 *   só incrementa `focoNaBusca` em `stores/ui.ts`, e o efeito daqui observa a
 *   troca do número.
 * - **Sugestões enquanto se digita um valor**: com o cursor num token `de:`,
 *   `menciona:`, `em:` ou `tem:` (ou os sinônimos em inglês), o popout troca
 *   as linhas de filtro pela lista de valores — membros do servidor (ou os
 *   participantes da conversa), canais, tipos de anexo — e escolher uma completa
 *   o token. Ver `SugestoesDaBusca`.
 * - **"Mais filtros"** deixou de ser "(em breve)": abre `MaisFiltrosDaBusca`,
 *   um modal local que monta a consulta com os mesmos prefixos.
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
  const [maisFiltrosAberto, setMaisFiltrosAberto] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * O `Modal` devolve o foco para o campo ao fechar, e o `onFocus` do campo
   * abriria o popout por cima dos resultados que o próprio modal acabou de
   * pedir. Este sinal engole esse único foco de volta.
   */
  const ignorarProximoFocoRef = useRef(false);
  const idDaLista = useId();

  // Fontes das sugestões. Selecionam o estado cru e derivam em `useMemo`: um
  // seletor do zustand que devolve array novo a cada leitura re-renderiza sem
  // parar.
  const membrosDoServidor = useGuilds((s) => s.members);
  const canaisDoServidor = useChannels((s) => s.channels);
  const conversa = useDMs((s) => (s.activeId ? s.channels.find((c) => c.id === s.activeId) : undefined));
  const eu = useAuth((s) => s.user);

  /**
   * Quem pode ser `de:`/`menciona:`. Numa conversa direta (`semFiltroDeCanal`,
   * a busca corre só nela) são os participantes e eu; no servidor, a lista de
   * membros que a coluna de membros já carregou.
   */
  const pessoas = useMemo<PublicUser[]>(() => {
    if (!semFiltroDeCanal) return membrosDoServidor.map((m) => m.user);
    const lista = [...(conversa?.others ?? [])];
    if (eu && !lista.some((u) => u.id === eu.id)) lista.push(eu);
    return lista;
  }, [semFiltroDeCanal, membrosDoServidor, conversa, eu]);

  /**
   * Canais para `em:`. Só os que têm nome sem espaço: a consulta é quebrada em
   * tokens por espaço (`parseSearchQuery`), e `em:nome com espaço` viraria
   * `em:nome` mais texto solto. Categoria não está nesta store.
   */
  const canais = useMemo<(CanalSugerivel & { type: string })[]>(
    () =>
      semFiltroDeCanal
        ? []
        : canaisDoServidor
            .filter((c) => c.guildId && c.name && !/\s/.test(c.name))
            .map((c) => ({ id: c.id, name: c.name as string, type: c.type })),
    [semFiltroDeCanal, canaisDoServidor],
  );

  // Ctrl+F. O valor com que o cabeçalho monta não é pedido nenhum (é o
  // contador de pedidos antigos, ou o 0 de quando a store nasce): só a troca
  // depois da montagem conta.
  const focoNaBusca = useUI((s) => s.focoNaBusca);
  const focoVistoRef = useRef(focoNaBusca);
  useEffect(() => {
    if (focoNaBusca === focoVistoRef.current) return;
    focoVistoRef.current = focoNaBusca;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // com o campo já focado o `onFocus` não dispara de novo, então abre aqui
    // (o mesmo que `abrirFiltros`, escrito com os setters para o efeito não
    // depender de uma função recriada a cada render)
    setAtivo(-1);
    setFiltrosAbertos(true);
    // Com uma busca em vigor o texto fica selecionado: digitar começa uma
    // consulta nova (o campo fica vazio na primeira tecla), como o Ctrl+F do
    // navegador, sem apagar a busca cujos resultados estão abertos.
    el.select();
  }, [focoNaBusca]);

  // A consulta muda por fora — o "limpar" do painel, a troca de canal que zera
  // a busca no store — e o campo precisa acompanhar, senão fica mostrando uma
  // busca que já não existe. Digitar não passa por aqui: `searchValue` só muda
  // quando alguém envia.
  useEffect(() => {
    setQuery(searchValue ?? "");
  }, [searchValue]);

  const linhas = semFiltroDeCanal ? LINHAS_DE_FILTRO.filter((l) => l.prefixo !== "em:") : LINHAS_DE_FILTRO;

  /** O token sob o cursor (o último da consulta) e, se for um prefixo, qual. */
  const token = /(?:^|\s)(\S*)$/.exec(query)?.[1] ?? "";
  const pedido = pedidoDeSugestao(token, semFiltroDeCanal);
  // sem `useMemo`: filtrar a lista de membros a cada tecla é barato, e o
  // `pedido` é um objeto novo por render de qualquer jeito
  const sugestoes = pedido ? sugerir(pedido, pessoas, canais) : [];
  /** Quantas opções as setas percorrem: as sugestões, ou as linhas de filtro. */
  const totalDeOpcoes = pedido ? sugestoes.length : linhas.length;

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

  /** Troca o token sob o cursor pelo prefixo digitado + o valor escolhido. */
  function completarToken(valor: string) {
    if (!pedido) return;
    const nova = `${query.slice(0, query.length - token.length)}${pedido.prefixo}${valor} `;
    setQuery(nova);
    setAtivo(-1);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nova.length, nova.length);
    });
  }

  function abrirMaisFiltros() {
    fecharFiltros();
    setMaisFiltrosAberto(true);
  }

  function fecharMaisFiltros() {
    ignorarProximoFocoRef.current = true;
    setMaisFiltrosAberto(false);
    // se o foco não voltar para o campo (ele saiu da tela), o sinal não pode
    // ficar armado e engolir o próximo clique de verdade
    requestAnimationFrame(() => {
      ignorarProximoFocoRef.current = false;
    });
  }

  /** Enter ou clique na linha `i` do popout, nos dois modos. */
  function escolher(i: number) {
    if (pedido) {
      const s = sugestoes[i];
      if (s) completarToken(s.valor);
      return;
    }
    const linha = linhas[i];
    if (!linha) return;
    if (linha.prefixo) inserirPrefixo(linha.prefixo);
    else abrirMaisFiltros();
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

        {/* vão de 10 entre caixas de 32 = passo de 42; a busca leva mais 4
            (`ml-1`), os 14 do print — ver o cabeçalho do arquivo */}
        <div className="ml-auto flex shrink-0 items-center gap-[10px]">
          {tools}
          <form
            ref={formRef}
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              fecharFiltros();
              onSearch(query);
            }}
            className="relative ml-1"
          >
            {/* `TextInput` (cartão cabecalho-do-canal), não mais `<input>` nativo.
                O `ref` chega ao `<input>` (o primitivo é `forwardRef`), e role,
                aria-* e os handlers passam pelo `...resto` dele.

                Medidas que continuam valendo:
                - 244×32 e raio 8: print `180835`, linha y=57 (bordas em x=1662 e
                  x=1905) e coluna x=1750 (bordas em y=41 e y=72). Fixa, não
                  expansível: a busca que crescia ao focar empurrava os ícones.
                - Fundo e borda do campo do Discord: `.searchBar_c322aa`
                  (`398929…css`) é `background:var(--input-background-default)`
                  com `border:1px solid var(--input-border-default)`.
                  `--input-background-default` sobre `--background-base-lower` dá
                  o #17171a do print; a borda mede #303035.
                - **Sem a borda limão do foco.** No print `113513`, com o popout
                  aberto (campo em foco), as bordas de cima e de baixo (coluna
                  x=1250, y=41 e y=72) continuam #303035. O `TextInput` pinta
                  `has-[:focus-visible]:border-input-border-active` na caixa, e
                  uma classe de borda nossa empataria com ela pela ordem do CSS
                  gerado. Por isso `semCaixa` (sem `border`, a largura da borda é
                  0 e a cor do foco não aparece) e a linha de 1px vem de um
                  `ring-1 ring-inset`, que não compete com propriedade nenhuma.
                  Sem a borda de verdade o conteúdo começaria 1px antes: o
                  `paddingLateral` de 9 mantém o texto onde o `border` + `pl-2`
                  antigo punha (1 + 8 da borda de fora).
                - Texto 14px (`tamanhoDoTexto="sm"`) em `--text-default`.
                  Placeholder `--input-placeholder-text-default`, e não o
                  `text-muted` que o cartão sugeria: a tinta de "Buscar Notas" no
                  `113513` (x1034–1113, y52–61) chega a #8f9097, que é esse token
                  (o `text-muted` é #96979e). Print > cartão. */}
            <TextInput
              ref={inputRef}
              tamanho="sm"
              semCaixa
              paddingLateral={9}
              classeDaCaixa="w-[244px] bg-input-background-default ring-1 ring-inset ring-input-border-default"
              tamanhoDoTexto="sm"
              classeDoTexto="text-text-default placeholder:text-input-placeholder-text-default"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // digitar com o popout fechado por Esc reabre, como abrir de novo
                if (!filtrosAbertos) setFiltrosAbertos(true);
                setAtivo(-1);
              }}
              onFocus={() => {
                if (ignorarProximoFocoRef.current) {
                  ignorarProximoFocoRef.current = false;
                  return;
                }
                abrirFiltros();
              }}
              // clicar numa linha não tira o foco daqui (`onMouseDown` com
              // `preventDefault` nela), então perder o foco é sair da busca
              onBlur={fecharFiltros}
              onKeyDown={(e) => {
                if (!filtrosAbertos) return;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const n = totalDeOpcoes;
                  if (n === 0) return;
                  setAtivo((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
                } else if ((e.key === "Enter" || e.key === "Tab") && ativo >= 0 && ativo < totalDeOpcoes) {
                  // Tab também completa, mas só com uma linha realçada: sem
                  // realce ele segue o caminho normal do foco
                  e.preventDefault();
                  escolher(ativo);
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
              aria-activedescendant={ativo >= 0 && ativo < totalDeOpcoes ? `${idDaLista}-${ativo}` : undefined}
              aria-label={searchLabel}
              placeholder={searchPlaceholder ?? "Buscar"}
              /* Lupa com o campo vazio, X com texto — a troca do Discord
                 (a lupa no `113513` com o campo vazio; o X no GIF de suporte
                 `how-to-use-search-on-discord/05.gif`, com `from: the_real_phibi`).
                 Tinta da lupa: 15×15 em #abacb2 = `--input-icon-default`
                 (`113513`, x1247–1261, y49–63), a 5px da borda direita. No
                 `sufixo` a caixa do ícone termina no padding de 9; o `-mr-1`
                 devolve os 4 e ela volta a 5 da borda, onde o `right-[5px]`
                 absoluto antigo a punha. */
              sufixo={
                <span className="-mr-1 flex shrink-0 items-center">
                  {comTexto ? (
                    <button
                      type="button"
                      aria-label="Limpar a busca"
                      // o clique não pode tirar o foco do campo antes de limpar
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={limpar}
                      className="flex h-[20px] w-[20px] items-center justify-center rounded text-input-icon-default hover:text-interactive-text-hover"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  ) : (
                    <Search size={17} aria-hidden="true" className="pointer-events-none text-input-icon-default" />
                  )}
                </span>
              }
            />
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
            {pedido ? (
              <SugestoesDaBusca
                idDaLista={idDaLista}
                titulo={TITULO_DA_SUGESTAO[pedido.tipo]}
                sugestoes={sugestoes}
                ativo={ativo}
                aoEscolher={escolher}
                aoApontar={(i) => setAtivo(i)}
              />
            ) : (
              <FiltrosDaBusca
                idDaLista={idDaLista}
                linhas={linhas}
                ativo={ativo}
                aoEscolher={escolher}
                aoApontar={(i) => setAtivo(i)}
              />
            )}
          </Popout>
          {/* Fora do `<form>` de busca: o modal é portal, mas os eventos
              sintéticos sobem pela árvore do React, e o envio do formulário
              dele chegaria ao `onSubmit` daqui. */}
          {maisFiltrosAberto && (
            <MaisFiltrosDaBusca
              consulta={query}
              membros={pessoas}
              canais={canais}
              semFiltroDeCanal={semFiltroDeCanal}
              aoFechar={fecharMaisFiltros}
              aoBuscar={(nova) => {
                setQuery(nova);
                fecharMaisFiltros();
                onSearch(nova);
              }}
            />
          )}
        </div>
      </header>
    </>
  );
}

interface LinhaDeFiltro {
  icone: ReactNode;
  titulo: string;
  /** o que se digita; `null` = a linha "Mais filtros", que abre o modal. */
  prefixo: string | null;
  dica: string;
}

/**
 * As cinco linhas do popout, na ordem e com o texto do Discord em pt-BR (print
 * 1:1 `docs/Reference/Captura de tela 2026-09-01 113513.png`). A última abre o
 * modal de filtros: no Streamz, `MaisFiltrosDaBusca`, que monta a consulta com
 * os prefixos que a API já entende (datas incluídas). "Tipo de autor" da dica
 * do Discord não existe na API e não entrou no modal.
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
  /** índice da linha; quem chama decide se insere o prefixo ou abre o modal. */
  aoEscolher: (indice: number) => void;
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

          const realcada = ativo === i;
          return (
            <div
              key={linha.titulo}
              id={`${idDaLista}-${i}`}
              role="option"
              aria-selected={realcada}
              // `preventDefault` no mousedown: o foco fica no campo e o `onBlur`
              // dele não fecha o popout antes do clique chegar
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => aoEscolher(i)}
              onPointerMove={() => {
                if (!realcada) aoApontar(i);
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

type TipoDeSugestao = "de" | "menciona" | "em" | "tem";

interface PedidoDeSugestao {
  tipo: TipoDeSugestao;
  /** o prefixo como foi digitado (`de:`, `from:`…), mantido ao completar. */
  prefixo: string;
  /** o que já foi digitado depois dele. */
  valor: string;
}

/**
 * Prefixo → tipo de sugestão. Os mesmos nomes e sinônimos em inglês que
 * `PREFIXOS_DE_BUSCA` (`packages/shared/src/mensagens.ts`) aceita; as datas
 * (`antes:`, `depois:`, `durante:`) não têm lista a sugerir.
 */
const TIPO_DO_PREFIXO: Record<string, TipoDeSugestao> = {
  de: "de",
  from: "de",
  menciona: "menciona",
  mentions: "menciona",
  em: "em",
  in: "em",
  tem: "tem",
  has: "tem",
};

const PREFIXO_SUGERIVEL_RE = /^(de|from|menciona|mentions|em|in|tem|has):(.*)$/i;

/** O token digitado pede sugestões? `em:` numa conversa direta não pede: a API o ignora. */
function pedidoDeSugestao(token: string, semFiltroDeCanal: boolean): PedidoDeSugestao | null {
  const m = PREFIXO_SUGERIVEL_RE.exec(token);
  if (!m) return null;
  const tipo = TIPO_DO_PREFIXO[m[1].toLowerCase()];
  if (tipo === "em" && semFiltroDeCanal) return null;
  return { tipo, prefixo: `${m[1]}:`, valor: m[2] };
}

interface Sugestao {
  chave: string;
  /** o que entra na consulta depois do prefixo. */
  valor: string;
  titulo: string;
  detalhe?: string;
  icone: ReactNode;
}

/**
 * Valores de `tem:` que o `parseSearchQuery` aceita, em pt-BR (os sinônimos em
 * inglês — `image`, `file` — também funcionam digitados, mas a lista fica na
 * língua do app). "anexo" e "arquivo" são o mesmo `file` na API; os dois
 * aparecem porque a dica do Discord em pt-BR escreve os dois.
 */
const OPCOES_DE_TEM: { valor: string; detalhe: string; icone: ReactNode }[] = [
  { valor: "link", detalhe: "mensagens com link", icone: <Link2 size={16} /> },
  { valor: "imagem", detalhe: "mensagens com imagem", icone: <IconeDeImagem size={16} /> },
  { valor: "arquivo", detalhe: "mensagens com qualquer anexo", icone: <FileText size={16} /> },
  { valor: "anexo", detalhe: "mensagens com qualquer anexo", icone: <Paperclip size={16} /> },
];

/** Teto da lista: "não medido" — cabe no popout sem rolar (24 + 10 × 36 + 24). */
const MAXIMO_DE_SUGESTOES = 10;

const TITULO_DA_SUGESTAO: Record<TipoDeSugestao, string> = {
  de: "De um usuário",
  menciona: "Menciona um usuário",
  em: "Em um canal",
  tem: "Inclui",
};

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/**
 * Filtra por "contém", com quem **começa** pelo digitado primeiro — digitar
 * `de:an` põe "ana" antes de "juliana". O valor que entra na consulta é o que a
 * API compara: `username` exato para pessoas (`messages.service.ts`,
 * `searchWhere`) e o nome do canal para `em:`.
 */
function sugerir(pedido: PedidoDeSugestao, pessoas: PublicUser[], canais: (CanalSugerivel & { type: string })[]): Sugestao[] {
  const alvo = normalizar(pedido.valor.replace(/^[@#]/, ""));
  const ordenar = <T,>(itens: T[], textos: (item: T) => string[]): T[] => {
    const comPeso = itens
      .map((item) => {
        const t = textos(item).map(normalizar);
        const peso = !alvo || t.some((x) => x.startsWith(alvo)) ? 0 : t.some((x) => x.includes(alvo)) ? 1 : -1;
        return { item, peso };
      })
      .filter((x) => x.peso >= 0);
    comPeso.sort((a, b) => a.peso - b.peso);
    return comPeso.slice(0, MAXIMO_DE_SUGESTOES).map((x) => x.item);
  };

  if (pedido.tipo === "de" || pedido.tipo === "menciona") {
    return ordenar(pessoas, (u) => [u.username, displayNameOf(u)]).map((u) => {
      const nome = displayNameOf(u);
      return {
        chave: u.id,
        valor: u.username,
        titulo: nome,
        detalhe: nome === u.username ? undefined : u.username,
        icone: <Avatar user={u} size="sm" />,
      };
    });
  }
  if (pedido.tipo === "em") {
    return ordenar(canais, (c) => [c.name]).map((c) => {
      const Icone = c.type === "VOICE" ? Volume2 : c.type === "ANNOUNCEMENT" ? Megaphone : Hash;
      return { chave: c.id, valor: c.name, titulo: c.name, icone: <Icone size={20} /> };
    });
  }
  return ordenar(OPCOES_DE_TEM, (o) => [o.valor]).map((o) => ({
    chave: o.valor,
    valor: o.valor,
    titulo: o.valor,
    detalhe: o.detalhe,
    icone: o.icone,
  }));
}

/**
 * O popout no modo sugestão: mesma caixa, mesmo título em caixa-alta e o mesmo
 * realce do `FiltrosDaBusca`, com linhas de uma linha só.
 *
 * **Não medido**: não há print das sugestões do Discord nesta leva. A linha de
 * 36 com avatar de 24 (`Avatar size="sm"`) e ícone de 20 é a escala das listas
 * do app, e o título/detalhe em 14px usam os tokens das linhas de filtro
 * (`--text-strong` e `--text-muted`).
 */
function SugestoesDaBusca({
  idDaLista,
  titulo,
  sugestoes,
  ativo,
  aoEscolher,
  aoApontar,
}: {
  idDaLista: string;
  titulo: string;
  sugestoes: Sugestao[];
  ativo: number;
  aoEscolher: (indice: number) => void;
  aoApontar: (indice: number) => void;
}) {
  return (
    <div>
      <div
        id={`${idDaLista}-titulo`}
        className="h-[24px] px-2 pb-[6px] pt-[2px] text-text-xs font-semibold leading-4 text-text-subtle"
      >
        {titulo}
      </div>
      <div role="listbox" id={idDaLista} aria-labelledby={`${idDaLista}-titulo`}>
        {sugestoes.length === 0 ? (
          <div className="flex h-[36px] items-center px-2 text-text-sm text-text-muted">Nenhum resultado</div>
        ) : (
          sugestoes.map((s, i) => {
            const realcada = ativo === i;
            return (
              <div
                key={s.chave}
                id={`${idDaLista}-${i}`}
                role="option"
                aria-selected={realcada}
                // o foco fica no campo, como nas linhas de filtro
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => aoEscolher(i)}
                onPointerMove={() => {
                  if (!realcada) aoApontar(i);
                }}
                className={`flex h-[36px] cursor-pointer items-center gap-2 rounded-lg px-2 ${
                  realcada ? "bg-interactive-background-hover" : ""
                }`}
              >
                <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center text-icon-muted" aria-hidden="true">
                  {s.icone}
                </span>
                <span className="min-w-0 flex-1 truncate text-text-sm">
                  <span className="font-semibold text-text-strong">{s.titulo}</span>
                  {s.detalhe && <span className="ml-2 text-text-muted">{s.detalhe}</span>}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
