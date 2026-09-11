"use client";

import { useCallback, useEffect, useState, type ReactNode, type UIEvent } from "react";
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
 */
function DateDivider({ iso }: { iso: string }) {
  return (
    <div role="separator" className="mx-4 mt-6 flex items-center">
      <span className="h-px flex-1 bg-border-subtle" />
      <span className="px-1 text-xs font-semibold text-text-muted">{rotuloDoDia(iso)}</span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

/** A linha vermelha com o rótulo NOVO, acima da primeira mensagem não lida. */
function UnreadDivider() {
  return (
    <div
      id={ID_DIVISOR}
      role="separator"
      aria-label="Mensagens não lidas a partir daqui"
      className="pointer-events-none relative mt-3 flex items-center"
    >
      <span className="h-px flex-1 bg-status-danger" />
      <span className="rounded-b-sm bg-status-danger px-1 py-px text-[10px] font-bold uppercase leading-[13px] tracking-wide text-control-critical-primary-text-default">
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

/** Onde está o divisor de não lidas em relação à parte visível da lista. */
type PosicaoDivisor = "acima" | "visivel" | "abaixo" | null;

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
  const [posicaoDivisor, setPosicaoDivisor] = useState<PosicaoDivisor>(null);

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

  const medirDivisor = useCallback(() => {
    const caixa = scrollRef.current;
    const divisor = caixa?.querySelector(`#${ID_DIVISOR}`);
    if (!caixa || !divisor) {
      setPosicaoDivisor(null);
      return;
    }
    const a = caixa.getBoundingClientRect();
    const b = divisor.getBoundingClientRect();
    setPosicaoDivisor(b.bottom < a.top ? "acima" : b.top > a.bottom ? "abaixo" : "visivel");
  }, [scrollRef]);

  useEffect(() => {
    medirDivisor();
  }, [medirDivisor, items, fronteira]);

  function aoRolar(event: UIEvent<HTMLDivElement>) {
    handleScroll(event);
    medirDivisor();
  }

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
      {/* barra superior: há não lido acima do que está na tela */}
      {channelId && posicaoDivisor === "acima" && (
        <div className="absolute inset-x-0 top-0 z-20 flex h-6 items-center justify-between bg-status-danger px-4 text-xs font-semibold text-control-critical-primary-text-default">
          <span>Você tem mensagens não lidas</span>
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
        onScroll={aoRolar}
        className={`scroller-auto scroller-fade flex-1 select-text overflow-y-auto ${className}`}
      >
        {loadingOlder && (
          <div className="grid place-items-center py-3" role="status" aria-label="Carregando mensagens">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-normal border-t-text-muted" />
          </div>
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

      {/* barra de largura total colada ao composer: há não lido abaixo da tela */}
      {channelId && posicaoDivisor === "abaixo" && (
        <div className="flex h-6 shrink-0 items-center justify-between bg-brand-500 px-4 text-xs font-semibold text-control-primary-text-default">
          <span>Mensagens novas desde {rotuloDoDia(fronteira ?? new Date().toISOString())}</span>
          <button type="button" onClick={() => marcarLidas(channelId)} className="hover:underline">
            Marcar como lidas
          </button>
        </div>
      )}

      {/* voltar ao presente: um botão redondo no canto, não uma pílula no meio */}
      {showJump && (
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label="Ir para as mensagens mais recentes"
          /* 39×39 com `h-10 w-10`; no celular vai a 44 literal, e sobe um pouco
             para não encostar na cápsula do composer */
          className="absolute bottom-4 right-6 grid h-10 w-10 place-items-center rounded-full bg-background-base-lowest text-text-default shadow-popout transition hover:bg-interactive-background-hover hover:text-text-strong celular:bottom-5 celular:right-4 celular:h-[44px] celular:w-[44px]"
        >
          <ArrowDown size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
