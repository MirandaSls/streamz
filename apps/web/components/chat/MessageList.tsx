"use client";

import { useCallback, useEffect, useState, type ReactNode, type UIEvent } from "react";
import { ArrowDown } from "@/components/ui/icones";
import { isSystemMessage, type Message } from "@streamz/shared";
import MessageItem from "@/components/MessageItem";
import BlockedMessages from "@/components/chat/BlockedMessages";
import { useFronteiraNaoLida, useMarcadorNaoLido } from "@/components/chat/marcador-nao-lido";
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
      <span className="h-px flex-1 bg-border" />
      <span className="px-1 text-xs font-semibold text-txt-muted">{rotuloDoDia(iso)}</span>
      <span className="h-px flex-1 bg-border" />
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
      <span className="h-px flex-1 bg-red" />
      <span className="rounded-b-sm bg-red px-1 py-px text-[10px] font-bold uppercase leading-[13px] tracking-wide text-white">
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
  title: string;
  description: string;
  /** fileira de ações abaixo da descrição ("Editar canal", "Convidar amigos"). */
  actions?: ReactNode;
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
        <div className="absolute inset-x-0 top-0 z-20 flex h-6 items-center justify-between bg-red px-4 text-xs font-semibold text-white">
          <span>Você tem mensagens não lidas</span>
          <button type="button" onClick={() => marcarLidas(channelId)} className="hover:underline">
            Marcar como lidas
          </button>
        </div>
      )}

      <div ref={scrollRef} onScroll={aoRolar} className={`flex-1 overflow-y-auto ${className}`}>
        {loadingOlder && (
          <div className="grid place-items-center py-3" role="status" aria-label="Carregando mensagens">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-txt-muted" />
          </div>
        )}

        {atStart && welcome && (
          <div className="mx-4 mt-4">
            <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-border text-txt-primary">
              {welcome.icon}
            </div>
            {/* nome de canal é conteúdo: Archivo sim, caixa-alta não. */}
            <h2 className="mt-3 font-display text-[32px] font-extrabold leading-10 tracking-wordmark text-txt-primary">
              {welcome.title}
            </h2>
            <p className="text-txt-muted">{welcome.description}</p>
            {welcome.actions && <div className="mt-3 flex flex-wrap gap-2">{welcome.actions}</div>}
          </div>
        )}

        {loading && items.length === 0 && (
          <div className="grid place-items-center py-6" role="status" aria-label="Carregando mensagens">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-txt-muted" />
          </div>
        )}
        {!loading && items.length === 0 && !welcome && (
          <div className="py-6 text-center text-sm text-txt-muted">{emptyText}</div>
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
        <div className="flex h-6 shrink-0 items-center justify-between bg-accent px-4 text-xs font-semibold text-accent-ink">
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
          className="absolute bottom-4 right-6 grid h-10 w-10 place-items-center rounded-full bg-panel text-txt-normal shadow-high transition hover:bg-hov hover:text-txt-primary"
        >
          <ArrowDown size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
