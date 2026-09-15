"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Pencil,
  Search,
  Threads,
  X,
} from "@/components/ui/icones";
import { displayNameOf, type ThreadView } from "@streamz/shared";
import HeaderPopover from "@/components/chat/HeaderPopover";
import Avatar from "@/components/ui/Avatar";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { Button, TextInput } from "@/components/ui/primitivos";
import { useEhMobile } from "@/hooks/useEhMobile";
import { horaCompleta } from "@/lib/format";
import { normalize } from "@/lib/quick-switcher";
import { useAuth } from "@/stores/auth";
import { useMessages } from "@/stores/messages";
import { useThreads } from "@/stores/messages-threads";
import { ui } from "@/stores/ui";

/**
 * Botão "Threads" do cabeçalho e o painel que ele abre.
 *
 * O cabeçalho segue o CSS bruto do painel (`sob-demanda/5d422a2a31e6e553.css`,
 * módulo `_d9c882`), na ordem em que as classes aparecem:
 *
 * - `.header`: 48 de altura (`height`/`min-height`), padding 0 16, borda de
 *   baixo 1px `--border-subtle`. O fundo é `--background-surface-high`: a regra
 *   `.container,.header{background-color:var(--background-surface-high)}` vem
 *   **depois** da que pinta o cabeçalho de `--background-base-lowest` e vence
 *   pela ordem (mesma especificidade) — o corpo e o cabeçalho têm o mesmo fundo;
 * - `.threadIcon`: 8 até o título, tinta `--interactive-text-default`;
 * - `.title`, `.divider` e cada `.tabBar .tab`: 16 à direita, e nenhum encolhe
 *   (`flex-shrink:0`);
 * - `.divider`: 1×24 em `--border-subtle`;
 * - `.tabBar .tab`: 24 de altura, conteúdo centrado, sem margem à esquerda; a
 *   ativa com fundo `--interactive-background-selected` (`.theme-dark … .tab.active`);
 * - `.spacer{flex-grow:1}` empurra o resto para a direita;
 * - `.searchIcon`: tinta `--text-default` (hover `--interactive-text-hover`),
 *   16 à direita, 2 de margem no topo. O clique troca o ícone pela
 *   `.searchBox` (fundo `--background-base-lower`, 16 à direita) — a busca é um
 *   ícone que abre a caixa, não um campo sempre à mostra;
 * - `.createButton`: 8 à esquerda; `.closeIcon`: 8 à esquerda, tinta
 *   `--interactive-text-default`.
 *
 * O item de aba vem do `TabBar` do Discord (`.topPill .item` em
 * `css-bruto/*.css`, módulo `_aa8da2`): raio `--radius-sm` (8), padding
 * lateral 12, texto `--text-subtle` que vai a
 * `--text-strong` no hover e na seleção; hover `--background-mod-subtle`. A
 * `.tab` do painel zera a margem esquerda e põe 16 na direita — exatamente as
 * duas margens que o `.topPill .item{margin:0 8px}` declara, o que indica que
 * é essa a barra por baixo. O `.topPill .item` também traz `min-height:32px`,
 * que, se valer ali, venceria o `height:24px` da `.tab`; sem print do painel
 * não dá para decidir, e fica o 24 que o próprio módulo declara.
 * Tamanho da fonte das abas e do título: "não medido" (o CSS não declara).
 *
 * Largura: `.browser_d98031` (`sob-demanda/389187.ee492c8e01f396c3.css`), do
 * mesmo módulo que o `.icon`/`.count` do botão de threads do cabeçalho:
 * `width:35vw` entre `min-width:480px` e `max-width:600px`. Os 420 de fábrica
 * do `HeaderPopover` não cabiam o cabeçalho acima.
 *
 * Renomear e arquivar não ficam expostos na linha da thread — são o menu de
 * contexto do item, como em toda lista do app.
 */
type Aba = "ativas" | "arquivadas";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "ativas", rotulo: "Ativas" },
  { valor: "arquivadas", rotulo: "Arquivadas" },
];

/** `.browser_d98031`: 35vw, preso entre 480 e 600 (ver cabeçalho). */
const LARGURA_MINIMA = 480;
const LARGURA_MAXIMA = 600;
/** Margem até a borda da janela: a mesma do `Popout`/`HeaderPopover` (8, não medida). */
const BORDA = 8;

function larguraDoPainel(janela: number): number {
  const desejada = Math.min(LARGURA_MAXIMA, Math.max(LARGURA_MINIMA, Math.round(janela * 0.35)));
  // numa janela mais estreita que o `min-width` o painel não pode sair da tela
  return Math.min(desejada, janela - 2 * BORDA);
}

/** `vw` não existe numa largura em px: a conta é refeita a cada resize. */
function useLarguraDoPainel(): number {
  const [largura, setLargura] = useState(LARGURA_MINIMA);
  useEffect(() => {
    const medir = () => setLargura(larguraDoPainel(window.innerWidth));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  return largura;
}

export default function ThreadsPopover({
  channelId,
  canManage,
}: {
  channelId: string;
  /** moderação do canal: pode renomear/arquivar thread de qualquer um. */
  canManage: boolean;
}) {
  const [aba, setAba] = useState<Aba>("ativas");
  const [busca, setBusca] = useState("");
  const [buscaAberta, setBuscaAberta] = useState(false);
  const largura = useLarguraDoPainel();
  // altura em px vai por `style` no `Button`/`TextInput`: uma classe
  // `celular:h-[44px]` perderia para ela, então o piso de toque é a prop
  const ehMobile = useEhMobile();
  const me = useAuth((s) => s.user);
  const items = useThreads((s) => s.items);
  const loading = useThreads((s) => s.loading);
  const load = useThreads((s) => s.load);
  const criar = useThreads((s) => s.create);
  const rename = useThreads((s) => s.rename);
  const setArchived = useThreads((s) => s.setArchived);
  const openThread = useMessages((s) => s.openThread);
  // a thread nasce de uma mensagem raiz: sem mensagem no canal não há o que criar
  const ultimaMensagem = useMessages((s) => {
    const itens = s.byChannel[channelId]?.items ?? [];
    for (let i = itens.length - 1; i >= 0; i--) {
      if (!itens[i].pending && !itens[i].failed) return itens[i];
    }
    return null;
  });

  const lista = useMemo(() => {
    const alvo = normalize(busca);
    return items
      .filter((t) => (aba === "ativas" ? !t.archived : t.archived))
      .filter((t) => !alvo || normalize(t.name).includes(alvo));
  }, [items, aba, busca]);

  /** ← → trocam de aba e levam o foco, como no primitivo `Tabs`. */
  function moverAba(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = ABAS.findIndex((a) => a.valor === aba);
    const passo = e.key === "ArrowRight" ? 1 : -1;
    const proxima = ABAS[(i + passo + ABAS.length) % ABAS.length];
    setAba(proxima.valor);
    const barra = e.currentTarget.parentElement;
    barra?.querySelector<HTMLButtonElement>(`[data-aba="${proxima.valor}"]`)?.focus();
  }

  function abrirMenuDaThread(t: ThreadView, x: number, y: number) {
    // renomear/arquivar: quem criou a thread ou a moderação do canal
    const podeMexer = canManage || t.createdBy.id === me?.id;
    if (!podeMexer) return;
    ui.openContextMenu(
      x,
      y,
      [
        {
          label: "Renomear",
          icon: <Pencil size={18} />,
          onSelect: () => void rename(channelId, t),
        },
        {
          label: t.archived ? "Reabrir" : "Arquivar",
          icon: t.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />,
          onSelect: () => void setArchived(channelId, t, !t.archived),
        },
      ],
      MENU_WIDTH,
    );
  }

  return (
    <HeaderPopover
      label="Threads"
      title="Threads"
      // 19 para ~17,8 de tinta, contando o `Threads` no quadro `10 10 80 80`
      // dos ativos de `svg/` (o caminho de `threads.svg` vai de 12,5 a 87,5:
      // 75 de 80). Discord 18, medido no cabeçalho (print `180835`, ver
      // `ChatView.tsx`); o `MessagesSquare` antigo precisava de 21 (69,2 de 80)
      icon={<Threads size={19} />}
      largura={largura}
      onOpen={() => void load(channelId)}
      // CSS bruto do painel de threads (`sob-demanda/5d422a2a31e6e553.css`):
      // `.list_c441f0{padding:0 16px}` e `.activeThreadsList_c441f0{padding-top:16px;padding-bottom:8px}`
      // — 16px nas laterais e no topo, 8 embaixo; o `p-2` (8 uniforme) do
      // painel de fábrica não vem daqui, é só o padrão de quem não mede.
      corpoClassName="px-4 pb-2 pt-4"
      cabecalho={(fechar) => (
        /*
          Medidas no cabeçalho do arquivo. No celular o painel é a folha do
          `Popout`, que já tem a alça como "Fechar" e ~400 de largura: o título,
          o divisor e o "×" saem para as abas, a lupa e o "Criar" caberem com o
          piso de toque de 44.
        */
        <header className="flex h-12 min-h-[48px] shrink-0 items-center border-b border-border-subtle bg-background-surface-high px-4">
          <span aria-hidden="true" className="mr-2 shrink-0 text-interactive-text-default celular:hidden">
            {/* tamanho do `.threadIcon` não medido: o mesmo glifo do botão */}
            <Threads size={19} />
          </span>
          {/*
            O CSS diz `flex-shrink:0` no título; aqui ele é o único que cede
            (trunca) quando a caixa de busca aberta não cabe na largura mínima
            de 480 — sem isso o "×" era empurrado para fora do painel.
          */}
          <h2 className="mr-4 min-w-0 truncate text-text-md font-semibold text-text-strong celular:hidden">
            Threads
          </h2>
          <span aria-hidden="true" className="mr-4 h-6 w-px shrink-0 bg-border-subtle celular:hidden" />

          <div role="tablist" aria-label="Filtrar threads" className="flex shrink-0 items-center">
            {ABAS.map((a) => {
              const ativa = a.valor === aba;
              return (
                <button
                  key={a.valor}
                  type="button"
                  role="tab"
                  data-aba={a.valor}
                  aria-selected={ativa}
                  tabIndex={ativa ? 0 : -1}
                  onClick={() => setAba(a.valor)}
                  onKeyDown={moverAba}
                  className={`mr-4 flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 text-center text-text-sm font-medium transition-colors celular:h-[44px] ${
                    ativa
                      ? "bg-interactive-background-selected text-text-strong"
                      : "text-text-subtle hover:bg-background-mod-subtle hover:text-text-strong active:bg-background-mod-subtle"
                  }`}
                >
                  {a.rotulo}
                </button>
              );
            })}
          </div>

          <span aria-hidden="true" className="flex-grow" />

          {buscaAberta ? (
            /* largura da `.searchBox` e altura: não medidas (o módulo só dá o
               fundo e a margem); 24 é a altura do botão "Criar" ao lado */
            <TextInput
              tamanho={ehMobile ? 44 : 24}
              semCaixa
              classeDaCaixa="mr-4 w-[180px] min-w-[120px] shrink bg-background-base-lower"
              tamanhoDoTexto="sm"
              data-autofocus
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onBlur={() => {
                if (!busca) setBuscaAberta(false);
              }}
              aoLimpar={() => {
                setBusca("");
                setBuscaAberta(false);
              }}
              sufixo={<Search size={16} aria-hidden="true" className="shrink-0 text-input-icon-default" />}
              type="search"
              aria-label="Buscar threads"
              placeholder="Buscar threads"
            />
          ) : (
            <button
              type="button"
              aria-label="Buscar threads"
              onClick={() => setBuscaAberta(true)}
              className="mr-4 mt-[2px] grid shrink-0 place-items-center text-text-default transition-colors hover:text-interactive-text-hover celular:mt-0 celular:h-[44px] celular:w-[44px]"
            >
              {/* tamanho do `.searchIcon` não medido */}
              <Search size={20} aria-hidden="true" />
            </button>
          )}

          <Button
            variante="primario"
            tamanho={ehMobile ? 44 : "xs"}
            className="ml-2 shrink-0"
            disabled={!ultimaMensagem}
            aria-label="Criar thread"
            onClick={() => {
              if (!ultimaMensagem) return;
              void criar(channelId, ultimaMensagem.id, ultimaMensagem.content);
            }}
          >
            Criar
          </Button>

          <button
            type="button"
            aria-label="Fechar"
            onClick={fechar}
            className="ml-2 grid shrink-0 place-items-center text-interactive-text-default transition-colors hover:text-interactive-text-hover celular:hidden"
          >
            {/* tamanho do `.closeIcon` e o hover: não medidos */}
            <X size={20} aria-hidden="true" />
          </button>
        </header>
      )}
    >
      {(fechar) => (
        <div role="tabpanel" aria-label={aba === "ativas" ? "Threads ativas" : "Threads arquivadas"}>
          {loading && <p className="p-4 text-center text-sm text-text-muted">Carregando…</p>}

          {!loading && lista.length === 0 && (
            <div className="p-6 text-center">
              <Threads size={32} aria-hidden="true" className="mx-auto mb-2 text-channels-default" />
              <p className="text-sm text-text-muted">
                {busca
                  ? "Nenhuma thread com esse nome."
                  : aba === "ativas"
                    ? "Nenhuma thread ativa. Crie uma a partir de uma mensagem."
                    : "Nenhuma thread arquivada."}
              </p>
            </div>
          )}

          {lista.map((t) => (
            <div
              key={t.id}
              onContextMenu={(e) => {
                e.preventDefault();
                abrirMenuDaThread(t, e.clientX, e.clientY);
              }}
              className="mb-1 rounded-[5px] last:mb-0 hover:bg-interactive-background-hover"
            >
              <button
                type="button"
                onClick={() => {
                  fechar();
                  void openThread(channelId, { id: t.id });
                }}
                className="w-full rounded-[5px] p-2 text-left"
              >
                <span className="block truncate font-medium text-text-strong">{t.name}</span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                  <span className="flex -space-x-1.5" aria-hidden="true">
                    {t.participants.map((p) => (
                      <Avatar key={p.id} user={p} size="xs" className="ring-2 ring-background-surface-higher" />
                    ))}
                  </span>
                  <span className="shrink-0 font-medium text-text-subtle">
                    {displayNameOf(t.createdBy)}
                  </span>
                  <span className="shrink-0">
                    {t.messageCount} {t.messageCount === 1 ? "mensagem" : "mensagens"}
                  </span>
                  <span className="ml-auto shrink-0 text-channels-default">
                    {t.lastMessageAt ? horaCompleta(t.lastMessageAt) : horaCompleta(t.createdAt)}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </HeaderPopover>
  );
}
