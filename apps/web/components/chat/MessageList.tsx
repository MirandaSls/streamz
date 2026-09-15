"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowDown } from "@/components/ui/icones";
import { isSystemMessage, type Message } from "@streamz/shared";
import MessageItem from "@/components/MessageItem";
import BlockedMessages from "@/components/chat/BlockedMessages";
import { useFronteiraNaoLida, useMarcadorNaoLido } from "@/components/chat/marcador-nao-lido";
import { Button } from "@/components/ui/primitivos";
import { useStickyScroll } from "@/hooks/useStickyScroll";
import { continuaAnterior, mesmoDia, rotuloDoDia } from "@/lib/format";
import { agruparBloqueadas, primeiraDoBloco } from "@/lib/timeline";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useBlockedIds } from "@/stores/friends";
import type { ChatMessage } from "@/stores/messages-core";

/** Id do divisor de não lidas — a barra de aviso o localiza na rolagem. */
const ID_DIVISOR = "divisor-nao-lido";

/**
 * Linha com a data entre dois dias de conversa.
 *
 * Sem margem inferior: o respiro abaixo é o `--espaco-entre-grupos` que a
 * primeira mensagem do dia já traz. Somar os dois abria um buraco que o Discord
 * não tem.
 *
 * O rótulo é a mesma peça `.content` do divisor de não lidas — só sem a cor de
 * perigo: `background: var(--background-gradient-chat, --background-base-lower)`,
 * `border-radius: 8px`, `color: var(--text-muted)`, `padding: 2px 4px`,
 * `font-size: 12px` (`line-height: 13px`, perto o bastante da nossa escala
 * `text-text-xs` de 12/16 para não abrir uma classe só para isto — a diferença
 * de 3px de entrelinha não se vê numa etiqueta de uma linha).
 * Origem: css-bruto/59565.8f14bd4f00233666.css `.content__908e2`.
 */
function DateDivider({ iso }: { iso: string }) {
  return (
    <div role="separator" className="mx-4 mt-6 flex items-center">
      <span className="h-px flex-1 bg-border-subtle" />
      <span className="rounded-lg px-1 py-0.5 text-text-xs font-semibold text-text-muted">
        {rotuloDoDia(iso)}
      </span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

/**
 * A linha vermelha com o rótulo NOVO, acima da primeira mensagem não lida.
 *
 * A etiqueta é o `.endCap` do Discord: só o lado direito arredondado
 * (`border-radius: 0 4px 4px 0`, o nosso `rounded` de 4px — não os 2px de
 * `rounded-b-sm` que estava aqui), `height: 13px`, `padding-inline: 1px 4px`
 * sem padding vertical, `line-height: 9px` (não 13 — o texto sobra menor que a
 * caixa e o flex centraliza). Cor: fundo `--background-feedback-notification`
 * = `--status-danger` (`#da3e44`, mesmo valor) e texto branco
 * (`--control-critical-primary-text-default`), os dois já batendo com o que
 * tínhamos. Sem `letter-spacing`: o Discord não abre tracking aqui.
 * Origem: css-bruto/59565.8f14bd4f00233666.css `.endCap__908e2`.
 */
function UnreadDivider() {
  return (
    <div
      id={ID_DIVISOR}
      role="separator"
      aria-label="Mensagens não lidas a partir daqui"
      className="pointer-events-none relative mt-3 flex items-center"
    >
      <span className="h-px flex-1 bg-status-danger" />
      <span className="flex h-[13px] items-center justify-center rounded-r bg-status-danger pl-px pr-1 text-[10px] font-bold uppercase leading-[9px] text-control-critical-primary-text-default">
        Novo
      </span>
    </div>
  );
}

/** Marca o canal como lido nas duas stores possíveis e some com o divisor. */
function marcarLidas(channelId: string) {
  const canais = useChannels.getState();
  if (canais.channels.some((c) => c.id === channelId)) void canais.markRead(channelId);
  const dms = useDMs.getState();
  if (dms.channels.some((d) => d.id === channelId)) void dms.markRead(channelId);
  useMarcadorNaoLido.getState().esquecer(channelId);
}

export interface Welcome {
  icon: ReactNode;
  /**
   * O ícone já é a figura inteira (o avatar de 80px da conversa direta) e não
   * vai dentro do círculo de 68px do canal.
   */
  semCirculo?: boolean;
  title: string;
  /** linha logo abaixo do título — o username na conversa direta (20px/600). */
  subtitle?: string;
  /** aceita nó porque a DM põe o nome do contato em negrito. */
  description: ReactNode;
  /**
   * O que vem abaixo da descrição ("Editar canal"; "Nenhum servidor em comum ·
   * Desfazer amizade · Bloquear"). Quem chama traz a margem: a distância medida
   * no Discord difere entre canal e DM.
   */
  actions?: ReactNode;
}

/**
 * Botão da fileira do início do canal/conversa ("Editar canal", "Bloquear",
 * "Desfazer amizade"): o chip neutro do Discord — `<Button variante="secundario"
 * tamanho="sm">`, sem variante de perigo mesmo para "Bloquear", porque no print
 * de referência a fileira inteira é neutra. O ícone continua envolto em
 * `aria-hidden`: quem chama (`ChatView`) passa o `Pencil` sem marcar isso
 * sozinho, e é este componente que sempre escondeu o desenho do leitor de tela.
 */
export function BotaoBoasVindas({
  icon,
  label,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variante="secundario"
      tamanho="sm"
      icone={icon && <span aria-hidden="true">{icon}</span>}
      onClick={onClick}
      /* 44 literal no celular: estes botões das boas-vindas são os primeiros
         alvos de quem abre uma conversa vazia. */
      className="celular:h-[44px] celular:px-4"
    >
      {label}
    </Button>
  );
}

/**
 * Área rolável de mensagens, com paginação para trás, divisor de não lidas,
 * agrupamento por autor (Discord: 7 min), divisores de data e o cabeçalho de
 * "início do canal" quando não há mais histórico.
 */
export default function MessageList({
  items,
  channelId,
  threadId = null,
  hasMore,
  loading,
  loadingOlder,
  loadingOlderError,
  onLoadOlder,
  currentUserId,
  canModerate,
  onEdit,
  onDelete,
  onToggleReaction,
  onOpenThread,
  onRetry,
  onDiscard,
  scrollToId,
  emptyText,
  welcome,
  firstSeparator,
  className = "pb-4",
}: {
  items: ChatMessage[];
  /** canal desta lista — sem ele não há não-lido a marcar (painel de thread). */
  channelId?: string;
  /** id da thread quando a lista é o painel de thread (escopo do "Responder"). */
  threadId?: string | null;
  hasMore: boolean;
  loading: boolean;
  loadingOlder?: boolean;
  /**
   * A paginação para trás falhou (hoje `messages.ts:378` só avisa por toast).
   * Opcional e ainda não passada por nenhum chamador — ver "faltando" do
   * cartão 2e-lista-mensagens: falta o fio de `ChatView`/`DMView`/
   * `ThreadPanel` até aqui. Sem isto, o card de erro nunca aparece, mas também
   * não quebra ninguém que já usa o componente sem o prop.
   */
  loadingOlderError?: boolean;
  onLoadOlder?: () => void;
  currentUserId?: string;
  canModerate?: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string, semConfirmar?: boolean) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  onOpenThread?: (message: Message) => void;
  onRetry?: (nonce: string) => void;
  onDiscard?: (nonce: string) => void;
  /** mensagem a trazer para a tela (o "ir para" de fixadas, busca e menções). */
  scrollToId?: string | null;
  emptyText: string;
  /** cabeçalho do início do canal ("Bem-vindo a #geral!"). */
  welcome?: Welcome;
  /** separador exibido logo após a primeira mensagem (usado na thread). */
  firstSeparator?: ReactNode;
  className?: string;
}) {
  const { scrollRef, handleScroll, showJump, jumpToLatest } = useStickyScroll(items, {
    canLoadOlder: hasMore && !loadingOlder && Boolean(onLoadOlder),
    onReachTop: onLoadOlder,
  });
  // ── d-social ── mensagens de quem eu bloqueei viram um bloco recolhido
  const bloqueados = useBlockedIds();
  const fronteira = useFronteiraNaoLida(channelId);
  const sair = useMarcadorNaoLido((s) => s.sair);

  // sair do canal fecha a decisão desta visita: voltar depois recalcula onde a
  // leitura parou, em vez de reaproveitar um divisor velho
  useEffect(() => {
    if (!channelId) return;
    return () => sair(channelId);
  }, [channelId, sair]);

  /*
    Grudar no fim quando a **caixa** muda de tamanho, e não só quando chega
    mensagem nova.

    Três casos, todos do telefone. (1) O teclado sobe e a área rolável encolhe:
    o `scrollTop` continua onde estava e a última mensagem sai por baixo —
    medido indo de 390×844 para 390×460, a distância do fim ia de 0 para 384px
    (412×915 → 412×500: 0 → 415). (2) A cápsula do composer cresce ao digitar
    várias linhas e come a mesma altura: 384 → 538 (Android 415 → 569). (3) Mídia sem
    dimensão conhecida (prévia de link, GIF por URL, figurinha) só ocupa espaço
    quando termina de carregar, e aí empurra o fim para baixo *depois* do
    `useLayoutEffect` do `useStickyScroll`, que só reage a itens novos.

    `load` na fase de **captura**: o `load` de `<img>`/`<video>` não borbulha,
    então um ouvinte comum no container nunca o veria.

    Só quando já se está no fim (`!showJump`): quem subiu para ler histórico não
    pode ser arrancado de lá por um teclado nem por uma foto que carregou.
  */
  useEffect(() => {
    const caixa = scrollRef.current;
    if (!caixa || showJump) return;
    const grudar = () => {
      if (caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 1) return;
      caixa.scrollTop = caixa.scrollHeight;
    };
    caixa.addEventListener("load", grudar, true);
    const observador =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(grudar);
    observador?.observe(caixa);
    return () => {
      observador?.disconnect();
      caixa.removeEventListener("load", grudar, true);
    };
  }, [scrollRef, showJump]);

  // o "ir para a mensagem" corre depois do layout da lista (useLayoutEffect da
  // rolagem grudenta), então este efeito é quem tem a última palavra na posição
  useEffect(() => {
    if (!scrollToId) return;
    const el = document.getElementById(`mensagem-${scrollToId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollToId, items]);

  const atStart = !hasMore && !loading;
  const blocos = agruparBloqueadas(items, bloqueados);
  /** Primeira mensagem depois da fronteira: é acima dela que a linha vermelha vai. */
  const idPrimeiraNaoLida =
    fronteira === undefined
      ? null
      : (items.find(
          (m) =>
            m.author.id !== currentUserId &&
            (fronteira === null || new Date(m.createdAt).getTime() > new Date(fronteira).getTime()),
        )?.id ?? null);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/*
        Barra "mensagens novas desde…", presa ao topo da área rolável — não do
        composer, e não em duas versões por posição de rolagem. O que tínhamos
        antes (barra vermelha no topo quando o divisor ficava acima da tela,
        barra verde colada ao composer quando ficava abaixo) não existe no
        Discord: lá é UMA barra só, verde, sempre no topo enquanto houver algo
        não lido nesta visita — some só ao "Marcar como lidas" ou ao sair do
        canal (`marcador-nao-lido.ts`). A versão colada ao composer era também
        a origem da faixa oliva de 7px que a revisão viu em thread-painel
        (na verdade o fundo do bloco de código, `--background-code`: a
        investigação deste cartão descartou a hipótese de bug ali — ver
        "medidas").
        Medidas — css-bruto/554669.2db5a96a8c197f0c.css `.newMessagesBar__0f481`:
        height 32px (h-8), border-radius "0 0 8px 8px" (rounded-b-lg),
        box-shadow var(--elevation-low) (shadow-elevation-low), padding-inline
        var(--space-16) (px-4), bg var(--brand-500) (bg-brand-500 — a mesma
        variável, não o alias `control-primary`). Texto: o Discord usa
        `color:var(--white)`, mas a regra 2 da ADR-0009 barra branco sobre
        marca — vira `text-control-primary-text-default` (accent-ink).
      */}
      {channelId && idPrimeiraNaoLida && (
        <div className="absolute inset-x-0 top-0 z-20 flex h-8 items-center justify-between rounded-b-lg bg-brand-500 px-4 text-xs font-semibold text-control-primary-text-default shadow-elevation-low">
          <span>Mensagens novas desde {rotuloDoDia(fronteira ?? new Date().toISOString())}</span>
          <button type="button" onClick={() => marcarLidas(channelId)} className="hover:underline">
            Marcar como lidas
          </button>
        </div>
      )}

      {/* `select-text`: a casca do app é `select-none` (rail, colunas, cabeçalhos
          não são texto para copiar), mas a timeline é — relato do usuário em
          2026-09-04: não dava para selecionar mensagem nem no site nem no app. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`scroller-auto scroller-fade flex-1 select-text overflow-y-auto ${className}`}
      >
        {loadingOlderError ? (
          /* `.messagesErrorBar` do Discord (mesmo arquivo, extends `.barBase`):
             bg `--notice-background-critical`, borda `--border-feedback-critical`,
             texto `--notice-text-critical`, `padding: var(--space-4) var(--space-8)`
             (py-1 px-2). Aqui embutido no fluxo, não flutuante — não há ainda um
             `onLoadOlder` de "tentar de novo" separado do de paginar, então o
             botão reusa o mesmo callback. */
          <div
            role="alert"
            className="mx-4 my-3 flex items-center justify-between gap-3 rounded border border-border-feedback-critical bg-notice-background-critical px-2 py-1 text-xs text-notice-text-critical"
          >
            <span>Não foi possível carregar mensagens mais antigas.</span>
            {onLoadOlder && (
              <button type="button" onClick={onLoadOlder} className="font-semibold hover:underline">
                Tentar novamente
              </button>
            )}
          </div>
        ) : (
          loadingOlder && (
            <div className="grid place-items-center py-3" role="status" aria-label="Carregando mensagens">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-normal border-t-text-muted" />
            </div>
          )
        )}

        {atStart && welcome && (
          <div className="mx-4 mt-4">
            {welcome.semCirculo ? (
              welcome.icon
            ) : (
              <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-border-subtle text-text-strong">
                {welcome.icon}
              </div>
            )}
            {/* Distâncias medidas no Discord, do topo da tinta ao topo da tinta:
                figura → título 17px, título → subtítulo 44px (canal) e 45px
                (nome → username na DM), username → descrição 48px. As margens
                descontam a metade da entrelinha e a folga do ascendente de cada
                fonte; sem app aberto, o resultado é aritmética, não render. */}
            {/* nome de canal é conteúdo: Archivo sim, caixa-alta não. */}
            <h2 className="mt-2 font-headline text-[32px] font-extrabold leading-10 text-text-strong">
              {welcome.title}
            </h2>
            {welcome.subtitle && (
              <p className="mt-1.5 text-xl font-semibold leading-7 text-text-strong">{welcome.subtitle}</p>
            )}
            <p className={`${welcome.subtitle ? "mt-5" : "mt-1.5"} text-text-muted`}>
              {welcome.description}
            </p>
            {welcome.actions}
          </div>
        )}

        {loading && items.length === 0 && (
          <div className="grid place-items-center py-6" role="status" aria-label="Carregando mensagens">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border-normal border-t-text-muted" />
          </div>
        )}
        {!loading && items.length === 0 && !welcome && (
          <div className="py-6 text-center text-sm text-text-muted">{emptyText}</div>
        )}

        {blocos.map((bloco, index) => {
          const primeira = primeiraDoBloco(bloco);
          const anterior = bloco.anterior;
          const novoDia = !anterior || !mesmoDia(anterior.createdAt, primeira.createdAt);
          // mensagem de sistema não é fala de ninguém: ela quebra o bloco, senão
          // "X entrou" no meio de duas falas do mesmo autor passaria batido
          const agrupada =
            !novoDia &&
            !!anterior &&
            !isSystemMessage(anterior) &&
            !isSystemMessage(primeira) &&
            continuaAnterior(anterior, primeira);
          return (
            <div key={primeira.id}>
              {/* o divisor de data é sempre desenhado acima do primeiro item:
                  suprimi-lo enquanto há histórico por carregar deixava o topo
                  da lista sem data nenhuma */}
              {novoDia && <DateDivider iso={primeira.createdAt} />}
              {/* logo abaixo do bloco de boas-vindas o Discord também põe a data */}
              {index === 0 && !novoDia && atStart && welcome && (
                <DateDivider iso={primeira.createdAt} />
              )}
              {primeira.id === idPrimeiraNaoLida && <UnreadDivider />}

              {bloco.kind === "bloqueadas" ? (
                <BlockedMessages
                  items={bloco.items}
                  currentUserId={currentUserId}
                  canModerate={canModerate}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleReaction={onToggleReaction}
                  onOpenThread={onOpenThread}
                  onRetry={onRetry}
                  onDiscard={onDiscard}
                />
              ) : (
                <MessageItem
                  message={bloco.message}
                  grouped={agrupada}
                  primeiro={index === 0}
                  threadId={threadId}
                  currentUserId={currentUserId}
                  canModerate={canModerate}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleReaction={onToggleReaction}
                  onOpenThread={onOpenThread}
                  onRetry={onRetry}
                  onDiscard={onDiscard}
                />
              )}

              {index === 0 && firstSeparator}
            </div>
          );
        })}
      </div>

      {/*
        Voltar ao presente: botão redondo no canto, não uma pílula no meio —
        o `.jumpToPresentButton` do Discord, não o `.newMessagesPill` (esse é
        a versão com "X" de dispensar, que não temos). Medidas —
        css-bruto/554669.2db5a96a8c197f0c.css `.jumpToPresentButtonContainer`
        (bottom:16px, inset-inline:0 16px → `bottom-4 right-4`) e
        `.jumpToPresentButton`/`Icon` (padding 6px + ícone 24px = 36px, ou
        seja `h-9 w-9` com raio total — não os 40px de `h-10 w-10` — ícone
        `size={24}`, não 20; fundo `--background-surface-high`, hover
        `--background-base-lowest` — o par estava invertido — sem sombra e
        sem troca de cor do ícone no hover, que o Discord não tem aqui).
        No celular o alvo de toque sobe a 44 literal — isso é nosso, não do
        Discord: alvo de toque tem piso de acessibilidade, não medida dele.
      */}
      {showJump && (
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label="Ir para as mensagens mais recentes"
          className="absolute bottom-4 right-4 grid h-9 w-9 place-items-center rounded-full bg-background-surface-high text-text-default transition hover:bg-background-base-lowest celular:bottom-5 celular:right-4 celular:h-[44px] celular:w-[44px]"
        >
          <ArrowDown size={24} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
