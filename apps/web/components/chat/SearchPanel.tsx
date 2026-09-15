"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Hash, Ordenar, SlidersHorizontal } from "@/components/ui/icones";
import { parseSearchQuery, type Message, type SearchFilters } from "@streamz/shared";
import MessagePreview from "@/components/chat/MessagePreview";
import { Button, Tooltip } from "@/components/ui/primitivos";
import { useCategories } from "@/stores/categories";
import { useChannels } from "@/stores/channels";
import { dmTitle, useDMs } from "@/stores/dms";
import { useFriends } from "@/stores/friends";
import { useMessages } from "@/stores/messages";
import { goToChannel, goToMessage } from "@/stores/messages-navigate";
import { ui } from "@/stores/ui";

/** Resultados por página — o Discord pagina de 25 em 25. */
const POR_PAGINA = 25;

type Ordem = "recentes" | "antigas" | "relevantes";

/** Rótulos da ordenação. Os do cliente pt-BR não estão no acervo: não verificados. */
const ROTULO_DA_ORDEM: Record<Ordem, string> = {
  recentes: "Mais recentes",
  antigas: "Mais antigas",
  relevantes: "Mais relevantes",
};

/**
 * Coluna 4 com os resultados da busca, redesenhada pelo Discord (cartão
 * 2m-busca). Não há print 1:1 do painel aberto; as medidas são do CSS bruto e
 * a forma, dos GIFs de suporte `how-to-use-search-on-discord/01.gif` e `05.gif`
 * (só proporção):
 *
 * - **Caixa** — `.searchResultsWrap_a98f3b`: `width: 418px`, fundo
 *   `--background-base-lowest`, `border-inline-start: 1px solid
 *   var(--app-frame-border)`. Antes: 416 (`w-[26rem]`) com `border-black/20`.
 *   **Começa embaixo do cabeçalho do canal**, que atravessa a área inteira: a
 *   página monta o painel dentro da região de conteúdo, como a lista de
 *   membros, com o recuo de 49 (`app/app/page.tsx`).
 * - **Cabeçalho** — `.searchHeader_ae7890`: `padding: 8px 16px`, borda de baixo
 *   `--border-subtle`; `.totalResults_ae7890` semibold ocupando o resto, e à
 *   direita (GIF 05) o botão "Filtros (n)" e o de ordenar, os dois na caixa de
 *   32 do botão secundário pequeno. A altura sai do conteúdo (8 + 32 + 8 + 1):
 *   o `h-[49px]` fixo existia só para emendar com o cabeçalho do canal quando o
 *   painel subia até o topo, e saiu junto com isso. Carregando:
 *   `.spinnerWrapper_ae7890` 16×16 a 8 do texto, traço `--text-default`.
 *   O X de fechar saiu: no Discord quem fecha a busca é o X do próprio campo
 *   (que o `HeaderBar` agora desenha).
 * - **Lista** — `.scroller_a98f3b{padding:16px 16px 0}`. Os resultados **em
 *   sequência do mesmo canal** ficam sob um cabeçalho de canal
 *   (`.searchResultGroup_a7e67f{margin-bottom:24px}`,
 *   `.channelNameContainer_a7e67f{margin-bottom:8px;cursor:pointer}`, ícone
 *   `--text-strong` com `padding-inline-end:4px`, nome sublinhado no hover). É
 *   esse cabeçalho o "contexto do canal" do Discord — as mensagens vizinhas em
 *   cinza que mostrávamos eram do leiaute antigo e não aparecem nos GIFs.
 *   Cada resultado é o `MessagePreview variante="resultado"`, 8 abaixo do
 *   outro (`.searchResult__80bf8{margin-bottom:8px}`).
 * - **Paginação** — `.paginationDock_a98f3b` (borda de cima `--border-subtle`,
 *   `--shadow-medium`, `padding: 0 16px`) com o paginador `_c15210`: botões de
 *   página redondos de 28 (`--custom-paginator-round-button-size`, raio 14,
 *   `margin:4px`, `padding:6px`, semibold `--text-strong`, hover
 *   `--background-mod-normal` + `--interactive-text-hover`), a página atual em
 *   `--brand-500` — limão, com texto escuro (ADR-0009 §3.5) —, "…" de 28 com
 *   `margin: 8px 4px`, e "Voltar"/"Próximo" nas pontas (`.endButton_c15210`,
 *   `padding: 0 8px`, 12 do lado de dentro; seta de 1em a 4 do texto).
 * - **Vazio** — `.emptyResultsWrap_a98f3b`: centralizado, `padding: 20px`, 16px
 *   medium `--text-default`, linha 24, texto em 280 (`.noResults_a98f3b`). A
 *   ilustração de 160×160 (`.noResultsImage_a98f3b`) não existe no acervo.
 * - **Erro** — a mesma caixa do vazio, com o texto em 300
 *   (`.errorMessage_a98f3b{width:300px}`) e "Tentar de novo", que refaz a última
 *   busca (`retrySearch`). A ilustração `.errorImage_a98f3b` (160×160) também
 *   não existe no acervo; a distância do botão ao texto não foi medida.
 * - **Bloqueados** — resultados de quem eu bloqueei saem da lista, e cada
 *   sequência deles vira uma linha `.resultsBlocked_a7e67f` ("N resultados de
 *   usuários bloqueados"): `padding: 6px 18px`, fundo `--background-mod-normal`,
 *   borda 1px `--background-base-lowest`, raio 3, 14px `--text-muted` (hover
 *   `--text-default`). Clicar mostra aquela sequência. O ícone de 32×32 a 20 do
 *   texto (`.resultsBlockedImage_a7e67f`) não existe no acervo; o texto pt-BR e
 *   o "Mostrar" não estão no acervo (não verificados).
 */
export default function SearchPanel({ guildId }: { guildId: string | null }) {
  const query = useMessages((s) => s.searchQuery);
  const results = useMessages((s) => s.searchResults);
  const searching = useMessages((s) => s.searching);
  const erro = useMessages((s) => s.searchError);
  const bloqueados = useFriends((s) => s.blocked);
  const canais = useChannels((s) => s.channels);
  const categorias = useCategories((s) => s.categories);
  const conversas = useDMs((s) => s.channels);
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [pagina, setPagina] = useState(0);
  /** Sequências de bloqueados já reveladas, pelo id da primeira mensagem delas. */
  const [revelados, setRevelados] = useState<ReadonlySet<string>>(() => new Set());
  const listaRef = useRef<HTMLDivElement>(null);
  const ordenarRef = useRef<HTMLButtonElement>(null);

  const filtros = parseSearchQuery(query);
  const termo = filtros.text.trim();

  const ordenados = useMemo(() => {
    // com erro não há lista: os resultados de antes não são a resposta desta busca
    const lista = erro ? [] : [...(results ?? [])];
    if (ordem === "recentes") return lista.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (ordem === "antigas") return lista.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    // "Relevantes" sem apoio do servidor: quantas vezes as palavras do termo
    // aparecem, desempatando pela mais recente.
    const palavras = termo.toLowerCase().split(/\s+/).filter(Boolean);
    const peso = (m: Message) => {
      const texto = m.content.toLowerCase();
      return palavras.reduce((soma, p) => soma + texto.split(p).length - 1, 0);
    };
    return lista.sort((a, b) => peso(b) - peso(a) || b.createdAt.localeCompare(a.createdAt));
  }, [results, erro, ordem, termo]);

  const total = ordenados.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const visiveis = ordenados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  // busca nova (ou outra ordem) recomeça da primeira página
  useEffect(() => setPagina(0), [results, ordem]);
  // e esconde de novo os bloqueados que tinham sido revelados na anterior
  useEffect(() => setRevelados(new Set()), [results]);
  // trocar de página volta ao topo da lista, senão a página nova abre no fim
  useEffect(() => {
    listaRef.current?.scrollTo({ top: 0 });
  }, [pagina]);

  if (results === null && !searching && erro === null) return null;

  /** Nome, categoria e tipo do cabeçalho de um grupo. */
  function contextoDoCanal(channelId: string): { nome: string; categoria: string | null; ehServidor: boolean } {
    const canal = canais.find((c) => c.id === channelId);
    if (canal?.name) {
      const categoria = canal.categoryId ? (categorias.find((c) => c.id === canal.categoryId)?.name ?? null) : null;
      return { nome: canal.name, categoria, ehServidor: true };
    }
    const conversa = conversas.find((d) => d.id === channelId);
    return { nome: conversa ? dmTitle(conversa) : "Conversa", categoria: null, ehServidor: false };
  }

  // resultados seguidos do mesmo canal dividem um cabeçalho
  const grupos: { channelId: string; mensagens: Message[] }[] = [];
  for (const m of visiveis) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.channelId === m.channelId) ultimo.mensagens.push(m);
    else grupos.push({ channelId: m.channelId, mensagens: [m] });
  }
  const idsBloqueados = new Set(bloqueados.map((u) => u.id));

  const resumo = resumoDosFiltros(filtros);

  function abrirOrdenacao() {
    const r = ordenarRef.current?.getBoundingClientRect();
    if (!r) return;
    // o menu é o `ContextMenu` do app (a mesma caixa medida do `.menu_c1e9c4`);
    // a distância de 8 do botão é a padrão dos popouts, não medida aqui
    ui.openContextMenu(
      r.left,
      r.bottom + 8,
      (Object.keys(ROTULO_DA_ORDEM) as Ordem[]).map((valor) => ({
        label: ROTULO_DA_ORDEM[valor],
        control: "radio" as const,
        checked: ordem === valor,
        onSelect: () => setOrdem(valor),
      })),
    );
  }

  return (
    <aside
      aria-label="Resultados da busca"
      aria-busy={searching}
      className="flex w-[418px] shrink-0 flex-col border-l border-app-frame-border bg-background-base-lowest celular:w-full"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center font-semibold text-text-strong" aria-live="polite">
          <span className="truncate">
            {searching ? "Buscando…" : `${total} ${total === 1 ? "resultado" : "resultados"}`}
          </span>
          {searching && <Girando />}
        </div>
        {/* O "Filtros" do Discord abre um modal de filtros por lista (de, em,
            menciona, datas, tipo de autor), que o Streamz não tem. Fica
            visível, com a contagem do que a consulta já filtra, e desabilitado
            com "(em breve)". O `span` recebe o ponteiro: botão desabilitado
            não dispara hover e a dica nunca abriria. */}
        <Tooltip rotulo="Editar filtros (em breve)" subtitulo={resumo || undefined}>
          <span className="inline-flex">
            <Button variante="secundario" tamanho="sm" icone={<SlidersHorizontal size={16} />} disabled>
              {resumo ? `Filtros (${contarFiltros(filtros)})` : "Filtros"}
            </Button>
          </span>
        </Tooltip>
        <Tooltip rotulo="Ordenar">
          <Button
            ref={ordenarRef}
            variante="secundario"
            tamanho="sm"
            aria-label={`Ordenar: ${ROTULO_DA_ORDEM[ordem]}`}
            aria-haspopup="menu"
            // as duas setas verticais do Discord (`sort.svg` do acervo)
            icone={<Ordenar size={16} />}
            onClick={abrirOrdenacao}
          />
        </Tooltip>
      </div>

      <div ref={listaRef} className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
        {!searching && erro !== null && (
          <ErroDaBusca mensagem={erro} aoTentarDeNovo={() => void useMessages.getState().retrySearch()} />
        )}
        {!searching && erro === null && total === 0 && <SemResultados />}

        {grupos.map((grupo, i) => {
          const ctx = contextoDoCanal(grupo.channelId);
          return (
            <section key={`${grupo.channelId}-${i}`} className="mb-6" aria-label={ctx.nome}>
              {/* GIF 05: "# baking-recipes" em semibold claro e a categoria
                  pequena ao lado. Tamanho do nome: não medido (16, o do total
                  no cabeçalho, que no GIF tem a mesma altura). Categoria:
                  `.searchResultChannelCategory__16eb0` — 10px semibold, sem
                  caixa-alta no refresh (`.mana-type-consolidation`), a 4 do
                  nome. O ícone de pasta que o GIF mostra antes dela não existe
                  no acervo. */}
              <button
                type="button"
                onClick={() => void goToChannel({ guildId, channelId: grupo.channelId })}
                className="group/canal mb-2 flex w-full min-w-0 items-center text-left"
              >
                {ctx.ehServidor && <Hash size={16} aria-hidden="true" className="mr-1 shrink-0 text-text-strong" />}
                <span className="min-w-0 truncate font-semibold text-text-strong group-hover/canal:underline">
                  {ctx.nome}
                </span>
                {ctx.categoria && (
                  <span className="ml-1 min-w-0 shrink truncate text-text-xxs font-semibold text-text-muted">
                    {ctx.categoria}
                  </span>
                )}
              </button>
              {itensDoGrupo(grupo.mensagens, idsBloqueados, revelados).map((item) =>
                item.tipo === "bloqueados" ? (
                  <LinhaDeBloqueados
                    key={`bloqueados-${item.chave}`}
                    quantidade={item.quantidade}
                    aoMostrar={() => setRevelados((atual) => new Set(atual).add(item.chave))}
                  />
                ) : (
                  <MessagePreview
                    key={item.mensagem.id}
                    message={item.mensagem}
                    variante="resultado"
                    realce={termo || undefined}
                    className="mb-2 last:mb-0"
                    aoAbrir={() =>
                      void goToMessage({ guildId, channelId: item.mensagem.channelId, messageId: item.mensagem.id })
                    }
                  />
                ),
              )}
            </section>
          );
        })}
      </div>

      {total > POR_PAGINA && (
        <nav
          aria-label="Páginas de resultados"
          className="z-[2] shrink-0 border-t border-border-subtle px-4 shadow-shadow-medium"
        >
          <Paginador pagina={pagina} paginas={paginas} aoMudar={setPagina} />
        </nav>
      )}
    </aside>
  );
}

type ItemDoGrupo =
  | { tipo: "mensagem"; mensagem: Message }
  | { tipo: "bloqueados"; chave: string; quantidade: number };

/**
 * As mensagens de um grupo com cada sequência de autores bloqueados trocada
 * por uma linha só. A chave da sequência é o id da primeira mensagem dela, que
 * é o que `revelados` guarda: revelar uma sequência não revela as outras.
 */
function itensDoGrupo(
  mensagens: Message[],
  bloqueados: ReadonlySet<string>,
  revelados: ReadonlySet<string>,
): ItemDoGrupo[] {
  const itens: ItemDoGrupo[] = [];
  let sequencia: Message[] = [];
  const fechar = () => {
    if (sequencia.length === 0) return;
    const chave = sequencia[0].id;
    if (revelados.has(chave)) {
      for (const m of sequencia) itens.push({ tipo: "mensagem", mensagem: m });
    } else {
      itens.push({ tipo: "bloqueados", chave, quantidade: sequencia.length });
    }
    sequencia = [];
  };
  for (const m of mensagens) {
    if (bloqueados.has(m.author.id)) {
      sequencia.push(m);
    } else {
      fechar();
      itens.push({ tipo: "mensagem", mensagem: m });
    }
  }
  fechar();
  return itens;
}

/**
 * `.resultsBlocked_a7e67f` (medidas no cabeçalho do arquivo). É um botão
 * inteiro, como no Discord (`cursor: pointer` na linha toda). O hover acende o
 * texto onde há ponteiro fino (`hoverOnlyWhenSupported`); no toque quem acende
 * é o `active:`.
 */
function LinhaDeBloqueados({ quantidade, aoMostrar }: { quantidade: number; aoMostrar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoMostrar}
      className="mb-2 flex w-full items-center rounded-[3px] border border-background-base-lowest bg-background-mod-normal px-[18px] py-[6px] text-left text-text-sm text-text-muted last:mb-0 hover:text-text-default active:text-text-default"
    >
      <span className="min-w-0 flex-1">
        {quantidade} {quantidade === 1 ? "resultado de usuário bloqueado" : "resultados de usuários bloqueados"}
      </span>
      <span className="ml-2 shrink-0 font-semibold">Mostrar</span>
    </button>
  );
}

/** Quantos filtros a consulta tem — o número do "Filtros (n)" do Discord. */
function contarFiltros(f: SearchFilters): number {
  return (
    (f.from ? 1 : 0) +
    (f.in ? 1 : 0) +
    (f.mentions ? 1 : 0) +
    f.has.length +
    (f.before ? 1 : 0) +
    (f.after ? 1 : 0)
  );
}

const ROTULO_DO_TEM: Record<SearchFilters["has"][number], string> = {
  link: "link",
  image: "imagem",
  file: "arquivo",
};

/**
 * O que a consulta está filtrando, em pt-BR, para a dica do "Filtros". Serve
 * de confirmação de que o prefixo pegou: um filtro digitado errado volta a ser
 * texto (`parseSearchQuery`) e simplesmente não aparece aqui.
 */
function resumoDosFiltros(f: SearchFilters): string {
  const partes: string[] = [];
  if (f.from) partes.push(`de @${f.from}`);
  if (f.in) partes.push(`em #${f.in}`);
  if (f.mentions) partes.push(`menciona @${f.mentions}`);
  for (const h of f.has) partes.push(`tem ${ROTULO_DO_TEM[h]}`);
  if (f.after) partes.push(`depois de ${f.after}`);
  if (f.before) partes.push(`antes de ${f.before}`);
  return partes.join(" · ");
}

/**
 * `.spinnerWrapper_ae7890`: 16×16, `margin-inline-start: 8px`, traço
 * `--text-default` (`.spinnerPath_ae7890`). O desenho do spinner do Discord é
 * SVG do JS e não foi medido: um arco girando.
 */
function Girando() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="ml-2 h-4 w-4 shrink-0 animate-spin text-text-default motion-reduce:animate-none"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="28"
        strokeDashoffset="10"
      />
    </svg>
  );
}

/**
 * Nada encontrado. O texto do Discord em inglês é "We searched far and wide.
 * Unfortunately, no results were found."; a tradução do cliente pt-BR não está
 * no acervo. A segunda linha é nossa: os filtros de data só existem digitados
 * (o modal "Mais filtros" é "em breve"), e é aqui que quem não achou nada
 * procura o que mais tentar.
 */
function SemResultados() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-5 text-center">
      <p className="w-[280px] max-w-full text-text-md font-medium leading-6 text-text-default">
        Procuramos em todo canto. Infelizmente, nenhum resultado foi encontrado.
      </p>
      <p className="mt-4 w-[280px] max-w-full text-text-sm text-text-muted">
        Para datas, digite <strong className="font-semibold text-text-subtle">antes:</strong>,{" "}
        <strong className="font-semibold text-text-subtle">depois:</strong> ou{" "}
        <strong className="font-semibold text-text-subtle">durante:</strong> seguido de AAAA-MM-DD.
      </p>
    </div>
  );
}

/**
 * A busca falhou: a caixa do `.emptyResultsWrap_a98f3b` com o texto em 300
 * (`.errorMessage_a98f3b`). O texto é o que a API devolveu, com "A busca
 * falhou." quando ela não diz nada (`errorMessage`). O botão é o secundário
 * pequeno; a distância de 16 até o texto não foi medida.
 */
function ErroDaBusca({ mensagem, aoTentarDeNovo }: { mensagem: string; aoTentarDeNovo: () => void }) {
  return (
    <div role="alert" className="flex min-h-full flex-col items-center justify-center p-5 text-center">
      <p className="w-[300px] max-w-full text-text-md font-medium leading-6 text-text-default">{mensagem}</p>
      <Button variante="secundario" tamanho="sm" className="mt-4" onClick={aoTentarDeNovo}>
        Tentar de novo
      </Button>
    </div>
  );
}

/** Páginas mostradas: todas até 7; depois, a primeira, a última e as vizinhas da atual. */
function paginasVisiveis(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const perto = [...new Set([0, total - 1, atual - 1, atual, atual + 1])]
    .filter((p) => p >= 0 && p < total)
    .sort((a, b) => a - b);
  const saida: (number | "…")[] = [];
  perto.forEach((p, i) => {
    if (i > 0 && p - perto[i - 1] > 1) saida.push("…");
    saida.push(p);
  });
  return saida;
}

/** O paginador `_c15210` do Discord — medidas no cabeçalho do `SearchPanel`. */
function Paginador({ pagina, paginas, aoMudar }: { pagina: number; paginas: number; aoMudar: (p: number) => void }) {
  // o desabilitado das pontas não foi medido; 50% é o dos primitivos
  const ponta =
    "m-1 flex h-[28px] items-center rounded-[14px] font-semibold text-text-strong hover:bg-background-mod-normal hover:text-interactive-text-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-text-strong";
  return (
    <div className="mx-auto flex w-min items-center py-1">
      <button
        type="button"
        onClick={() => aoMudar(Math.max(0, pagina - 1))}
        disabled={pagina === 0}
        className={`${ponta} pl-2 pr-3`}
      >
        <ChevronLeft size="1em" aria-hidden="true" className="mr-1" />
        Voltar
      </button>
      {paginasVisiveis(pagina, paginas).map((p, i) =>
        p === "…" ? (
          <span key={`intervalo-${i}`} aria-hidden="true" className="mx-1 my-2 w-[28px] text-center text-text-default">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => aoMudar(p)}
            aria-current={p === pagina ? "page" : undefined}
            aria-label={`Página ${p + 1}`}
            className={`m-1 flex h-[28px] min-w-[28px] items-center justify-center rounded-[14px] p-1.5 font-semibold ${
              p === pagina
                ? "bg-brand-500 text-control-primary-text-default"
                : "text-text-strong hover:bg-background-mod-normal hover:text-interactive-text-hover"
            }`}
          >
            {p + 1}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => aoMudar(Math.min(paginas - 1, pagina + 1))}
        disabled={pagina >= paginas - 1}
        className={`${ponta} pl-3 pr-2`}
      >
        Próximo
        <ChevronRight size="1em" aria-hidden="true" className="ml-1" />
      </button>
    </div>
  );
}
