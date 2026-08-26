"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  EyeOff,
  Hash,
  Images,
  Lock,
  Megaphone,
  MessagesSquare,
  Shield,
  Users,
} from "lucide-react";
import { slowmodeLabel } from "@streamz/shared";
import Composer from "@/components/chat/Composer";
// ── h-moderacao ──
import { RulesNotice, TimeoutNotice } from "@/components/moderation/ComposerNotice";
import SelectionBar from "@/components/moderation/SelectionBar";

import { useModeration, useMustAcceptRules, useMyTimeout } from "@/stores/moderation";
import { usePolls } from "@/stores/polls";
import HeaderBar, { HeaderIcon } from "@/components/chat/HeaderBar";
import NotificationBell from "@/components/chat/NotificationBell";
import MessageList from "@/components/chat/MessageList";
import PinsPopover from "@/components/chat/PinsPopover";
import ReplyBar from "@/components/chat/ReplyBar";
import ThreadsPopover from "@/components/chat/ThreadsPopover";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { useSlowmode } from "@/hooks/useSlowmode";
import { useAuth } from "@/stores/auth";
import { useActiveChannel } from "@/stores/channels";
import {
  useCanModerateActiveChannel,
  useCanPostActiveChannel,
} from "@/stores/permissions";
import { useActiveSlice, useMessages } from "@/stores/messages";
import { ui, useUI } from "@/stores/ui";

/**
 * Canais marcados como sensíveis pedem confirmação uma vez por aba: guardar no
 * `sessionStorage` evita reperguntar a cada troca de canal sem "lembrar para
 * sempre" de um consentimento que é do momento.
 */
const CHAVE_NSFW = "streamz:nsfw-confirmados";

function jaConfirmou(channelId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (window.sessionStorage.getItem(CHAVE_NSFW) ?? "").split(",").includes(channelId);
  } catch {
    return false;
  }
}

function confirmar(channelId: string) {
  if (typeof window === "undefined") return;
  try {
    const atual = (window.sessionStorage.getItem(CHAVE_NSFW) ?? "").split(",").filter(Boolean);
    window.sessionStorage.setItem(CHAVE_NSFW, [...new Set([...atual, channelId])].join(","));
  } catch {
    // storage indisponível: o aviso volta a aparecer, o que é o lado seguro
  }
}

/** A última mensagem confirmada de um autor, para o `↑` do composer. */
function ultimaDe(
  items: { id: string; content: string; author: { id: string }; pending?: boolean }[],
  userId: string,
): { id: string; content: string } | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const m = items[i];
    if (m.author.id === userId && !m.pending) return { id: m.id, content: m.content };
  }
  return null;
}


/** Coluna 3 no modo servidor: cabeçalho, busca, timeline e composer. */
export default function ChatView() {
  const user = useAuth((s) => s.user);
  const channel = useActiveChannel();
  // quem posta neste canal é SEND_MESSAGES na permissão efetiva (ADR-0002):
  // somente-leitura é deny no @everyone, e um cargo pode ter allow de volta
  const podePostar = useCanPostActiveChannel();
  // apagar mensagem dos outros é MANAGE_MESSAGES no canal, não mais o papel
  const canModerate = useCanModerateActiveChannel();
  const slowmode = useSlowmode(channel?.id ?? null);
  const [liberado, setLiberado] = useState<string[]>([]);
  const slice = useActiveSlice();
  const membersOpen = useUI((s) => s.membersOpen);
  const toggleMembers = useUI((s) => s.toggleMembers);
  const mediaOpen = useUI((s) => s.mediaOpen);
  const toggleMedia = useUI((s) => s.toggleMedia);
  // ── h-moderacao ──
  const timeoutUntil = useMyTimeout();
  const mustAcceptRules = useMustAcceptRules();
  const rulesChannelId = useModeration((s) => s.membership?.onboarding.rulesChannelId ?? null);
  const guildId = useModeration((s) => s.membership?.guildId ?? null);
  const loadMyVotes = usePolls((s) => s.loadMine);
  const cancelSelection = useModeration((s) => s.cancelSelection);
  const channelId = channel?.id;

  // meus votos das enquetes do canal: o DTO da mensagem é igual para todo
  // mundo, então a marcação "eu votei aqui" vem numa chamada à parte
  useEffect(() => {
    if (channelId) void loadMyVotes(channelId);
  }, [channelId, loadMyVotes]);

  // trocar de canal sai do modo de seleção — ela é sempre de um canal só
  useEffect(() => () => cancelSelection(), [channelId, cancelSelection]);

  const searchQuery = useMessages((s) => s.searchQuery);
  const setSearchQuery = useMessages((s) => s.setSearchQuery);
  const runSearch = useMessages((s) => s.runSearch);
  const highlightId = useMessages((s) => s.highlightId);
  const loadOlder = useMessages((s) => s.loadOlder);
  const send = useMessages((s) => s.send);
  const edit = useMessages((s) => s.edit);
  const remove = useMessages((s) => s.remove);
  const toggleReaction = useMessages((s) => s.toggleReaction);
  const openThread = useMessages((s) => s.openThread);
  const retry = useMessages((s) => s.retry);
  const discard = useMessages((s) => s.discard);

  if (!channel) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center bg-chat text-txt-muted">
        Escolha um canal
      </main>
    );
  }

  const readOnly = !podePostar;
  // canal de servidor sempre tem nome; o tipo é nullable por causa das DMs
  const name = channel.name ?? "canal";
  const Icon =
    channel.type === "ANNOUNCEMENT" || channel.readOnly
      ? Megaphone
      : channel.private
        ? Lock
        : Hash;

  // conteúdo sensível: o canal só abre depois do aviso
  if (channel.nsfw && !liberado.includes(channel.id) && !jaConfirmou(channel.id)) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center bg-chat px-8 text-center">
        <div className="max-w-md">
          <EyeOff size={64} strokeWidth={1} className="mx-auto text-txt-muted" aria-hidden="true" />
          <h2 className="mt-4 text-2xl font-bold text-txt-primary">#{name}</h2>
          <p className="mt-2 text-txt-muted">
            Este canal foi marcado como sensível. O conteúdo pode não ser apropriado
            para todo mundo.
          </p>
          <button
            type="button"
            onClick={() => {
              confirmar(channel.id);
              setLiberado((ids) => [...ids, channel.id]);
            }}
            className="mt-6 h-[38px] rounded-[3px] bg-accent px-4 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
          >
            Continuar mesmo assim
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-chat">
      <HeaderBar
        bell={<NotificationBell channelId={channel.id} />}
        icon={<Icon size={24} />}
        title={name}
        subtitle={
          channel.topic ? (
            <button
              type="button"
              onClick={() => ui.openModal({ kind: "channelTopic", channelId: channel.id })}
              title="Ver o tópico completo"
              className="max-w-[40vw] truncate text-left hover:text-txt-normal"
            >
              {channel.topic}
            </button>
          ) : undefined
        }
        searchLabel={`Buscar mensagens em ${name}`}
        searchValue={searchQuery}
        onSearch={(q) => {
          setSearchQuery(q);
          // no servidor a busca é do servidor inteiro, com `in:#canal` filtrando
          void runSearch({ channelId: channel.id, guildId: channel.guildId });
        }}
        pins={
          <PinsPopover channelId={channel.id} guildId={channel.guildId} canPin={canModerate} />
        }
        tools={
          <>
            <ThreadsPopover channelId={channel.id} canManage={canModerate} />
            <HeaderIcon
              label={mediaOpen ? "Ocultar mídia do canal" : "Mídia do canal"}
              active={mediaOpen}
              onClick={toggleMedia}
            >
              <Images size={24} />
            </HeaderIcon>
            {canModerate && guildId && (
              <HeaderIcon
                label="Configurações do servidor"
                onClick={() => ui.openModal({ kind: "serverSettings", guildId })}
              >
                <Shield size={24} />
              </HeaderIcon>
            )}
            <HeaderIcon label={membersOpen ? "Ocultar lista de membros" : "Mostrar lista de membros"} active={membersOpen} onClick={toggleMembers}>
              <Users size={24} />
            </HeaderIcon>
          </>
        }
      />

      <MessageList
        // remonta a cada canal para zerar a rolagem e os marcadores de posição
        key={`lista-${channel.id}`}
        items={slice.items}
        hasMore={slice.hasMore}
        loading={slice.loading}
        loadingOlder={slice.loadingOlder}
        onLoadOlder={() => void loadOlder(channel.id)}
        currentUserId={user?.id}
        canModerate={canModerate}
        onEdit={edit}
        onDelete={(id) => void remove(id)}
        onToggleReaction={(id, emoji) => toggleReaction(id, emoji, user?.id)}
        onOpenThread={(message) => void openThread(channel.id, message)}
        onRetry={retry}
        onDiscard={discard}
        scrollToId={highlightId}
        emptyText="Nenhuma mensagem ainda. Diga um oi."
        welcome={{
          icon: <Icon size={42} />,
          title: `Bem-vindo a #${name}!`,
          description: channel.topic || `Este é o início do canal #${name}.`,
        }}
      />

      {slowmode.seconds > 0 && !readOnly && (
        // o aviso vive aqui, e não dentro do Composer, para não disputar o
        // arquivo do composer com quem cuida dele — o hook useSlowmode é o
        // ponto de integração se ele quiser mover a contagem para dentro
        <p
          aria-live="polite"
          className="mx-4 mb-1 flex items-center gap-1.5 text-xs text-txt-muted"
        >
          <Clock size={14} aria-hidden="true" />
          {slowmode.blocked
            ? `Modo lento: aguarde ${slowmode.remaining}s`
            : `Modo lento ligado (${slowmodeLabel(slowmode.seconds)})`}
        </p>
      )}

      {/* h-moderacao: barra do modo "selecionar mensagens" */}
      <SelectionBar channelId={channel.id} />

      {readOnly ? (
        <p className="mx-4 mb-6 rounded-lg bg-input px-4 py-3 text-center text-sm text-txt-muted">
          Você não tem permissão para enviar mensagens neste canal.
        </p>
      ) : timeoutUntil ? (
        // h-moderacao: o castigo troca o composer pelo aviso de até quando
        <TimeoutNotice until={timeoutUntil} />
      ) : mustAcceptRules ? (
        <RulesNotice rulesChannelId={rulesChannelId} />
      ) : (
        user && (
          <>
            <ReplyBar channelId={channel.id} />
            <Composer
              key={`composer-${channel.id}`}
              channelId={channel.id}
              allowAttachments
              placeholder={`Conversar em #${name}`}
              ariaLabel={`Mensagem para #${name}`}
              channelName={name}
              // ↑ no campo vazio reabre a última mensagem minha para editar
              ultimaMinhaMensagem={() => ultimaDe(slice.items, user.id)}
              onEditMessage={edit}
              onCreatePoll={() => ui.openModal({ kind: "createPoll", channelId: channel.id })}
              onSend={(content, attachments, sticker) => {
                // a API recusaria com 429; barrar aqui evita a mensagem otimista
                // aparecer e sumir na cara de quem escreveu
                if (slowmode.blocked) {
                  ui.toast(`Modo lento: aguarde ${slowmode.remaining}s`, "error");
                  return;
                }
                send({
                  channelId: channel.id,
                  guildId: channel.guildId,
                  author: user,
                  content,
                  attachments,
                  sticker,
                });
              }}
            />
          </>
        )
      )}
      <TypingIndicator channelId={channel.id} />
    </main>
  );
}
