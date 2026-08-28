"use client";

import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Bell, MessageSquare, MoreHorizontal, Users, X } from "lucide-react";
import { displayNameOf, messageLinkPath, type NotificationLevel } from "@streamz/shared";
import Composer from "@/components/chat/Composer";
import MessageList from "@/components/chat/MessageList";
import ReplyBar from "@/components/chat/ReplyBar";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { ultimaMinhaMensagem } from "@/components/chat/ultima-minha";
import Avatar from "@/components/ui/Avatar";
import Tooltip from "@/components/ui/Tooltip";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useCanModerate } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
import { useChannelSetting, useNotifications } from "@/stores/notifications";
import { ui, type MenuItem } from "@/stores/ui";

/** Largura inicial e limites do painel de thread. */
const LARGURA_PADRAO = 480;
const LARGURA_MIN = 340;
const LARGURA_MAX = 720;
const CHAVE_LARGURA = "streamz:largura-thread";

const NIVEIS: { valor: NotificationLevel; rotulo: string }[] = [
  { valor: "ALL", rotulo: "Todas as mensagens" },
  { valor: "MENTIONS", rotulo: "Só menções" },
  { valor: "NONE", rotulo: "Nada" },
];

function larguraSalva(): number {
  if (typeof window === "undefined") return LARGURA_PADRAO;
  const n = Number(window.localStorage?.getItem(CHAVE_LARGURA));
  return Number.isFinite(n) && n >= LARGURA_MIN ? Math.min(n, LARGURA_MAX) : LARGURA_PADRAO;
}

/** Coluna 4 quando há thread aberta: a raiz, as respostas e o campo de resposta. */
export default function ThreadPanel({ channelId }: { channelId: string }) {
  const user = useAuth((s) => s.user);
  const canModerate = useCanModerate(user?.id);

  const parentId = useMessages((s) => s.threadParentId);
  const items = useMessages((s) => s.threadItems);
  const loading = useMessages((s) => s.threadLoading);
  const closeThread = useMessages((s) => s.closeThread);
  const send = useMessages((s) => s.send);
  const edit = useMessages((s) => s.edit);
  const remove = useMessages((s) => s.remove);
  const toggleReaction = useMessages((s) => s.toggleReaction);
  const retry = useMessages((s) => s.retry);
  const discard = useMessages((s) => s.discard);
  const guildId = useChannels((s) => s.guildId);
  const preferencia = useChannelSetting(channelId);
  const setChannelLevel = useNotifications((s) => s.setChannelLevel);

  const [largura, setLargura] = useState(LARGURA_PADRAO);
  useEffect(() => setLargura(larguraSalva()), []);
  const comecarArraste = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const mover = (ev: PointerEvent) =>
      setLargura(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, window.innerWidth - ev.clientX)));
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      document.body.style.cursor = "";
      setLargura((l) => {
        try {
          window.localStorage?.setItem(CHAVE_LARGURA, String(l));
        } catch {
          // storage indisponível: a largura vale só nesta sessão
        }
        return l;
      });
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }, []);

  if (!parentId) return null;
  const replies = Math.max(0, items.length - 1);
  // a raiz é o primeiro item da thread; dela sai o nome quando a thread tem um
  const raiz = items[0];
  const nome = raiz?.thread?.name;
  const participantes = raiz?.thread?.participants ?? [];

  function abrirMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const items: MenuItem[] = [
      {
        label: "Copiar link do tópico",
        onSelect: () => {
          const caminho = messageLinkPath(guildId, channelId, parentId as string);
          const url =
            typeof window === "undefined" ? caminho : `${window.location.origin}${caminho}`;
          void navigator.clipboard?.writeText(url);
          ui.toast("Link do tópico copiado");
        },
      },
      { separator: true },
      { label: "Fechar tópico", onSelect: closeThread },
    ];
    ui.openContextMenu(r.right - 188, r.bottom + 4, items);
  }

  function abrirNotificacoes(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    // não há escopo "thread" no contrato: a preferência é a do canal em que o
    // tópico vive (ver relatório de pendências)
    const items: MenuItem[] = NIVEIS.map((n) => ({
      label: n.rotulo,
      control: "radio" as const,
      checked: (preferencia?.level ?? "ALL") === n.valor,
      onSelect: () => void setChannelLevel(channelId, n.valor),
    }));
    ui.openContextMenu(r.right - 188, r.bottom + 4, items);
  }

  return (
    <aside
      aria-label="Thread"
      style={{ width: largura }}
      className="relative flex shrink-0 flex-col border-l border-black/20 bg-chat"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar o tópico"
        onPointerDown={comecarArraste}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize"
      />

      <div className="flex h-12 shrink-0 items-center gap-2 px-4 shadow-header">
        <MessageSquare size={20} aria-hidden="true" className="shrink-0 text-txt-secondary" />
        <span className="min-w-0 flex-1 truncate font-semibold text-txt-primary">
          {nome ?? "Tópico"}
        </span>

        {participantes.length > 0 && (
          <Tooltip
            label={`${participantes.length} ${participantes.length === 1 ? "participante" : "participantes"}: ${participantes
              .map((p) => displayNameOf(p))
              .join(", ")}`}
          >
            <span className="flex shrink-0 items-center gap-1 text-txt-secondary">
              <Users size={16} aria-hidden="true" />
              <span className="flex -space-x-1.5" aria-hidden="true">
                {participantes.slice(0, 3).map((p) => (
                  <Avatar key={p.id} user={p} size="xs" className="ring-2 ring-chat" />
                ))}
              </span>
            </span>
          </Tooltip>
        )}

        <Tooltip label="Notificações">
          <button
            type="button"
            onClick={abrirNotificacoes}
            aria-label="Notificações do tópico"
            className="shrink-0 text-txt-secondary transition hover:text-txt-primary"
          >
            <Bell size={20} />
          </button>
        </Tooltip>
        <Tooltip label="Mais">
          <button
            type="button"
            onClick={abrirMenu}
            aria-label="Mais opções do tópico"
            className="shrink-0 text-txt-secondary transition hover:text-txt-primary"
          >
            <MoreHorizontal size={20} />
          </button>
        </Tooltip>
        <Tooltip label="Fechar tópico">
          <button
            type="button"
            onClick={closeThread}
            aria-label="Fechar thread"
            className="shrink-0 text-txt-secondary transition hover:text-txt-primary"
          >
            <X size={24} />
          </button>
        </Tooltip>
      </div>

      <MessageList
        key={`lista-${parentId}`}
        items={items}
        hasMore={false}
        loading={loading}
        currentUserId={user?.id}
        canModerate={canModerate}
        threadId={parentId}
        onEdit={edit}
        onDelete={(id, semConfirmar) => void remove(id, semConfirmar)}
        onToggleReaction={(id, emoji) => toggleReaction(id, emoji, user?.id)}
        onRetry={retry}
        onDiscard={discard}
        emptyText="Thread vazia."
        className="pb-2"
        firstSeparator={
          // mesmo desenho do divisor de data: antes ficava mais apertado que ele
          <div className="mx-4 mt-6 flex items-center" role="separator">
            <span className="h-px flex-1 bg-border" />
            <span className="px-1 text-xs font-semibold text-txt-muted">
              {replies} {replies === 1 ? "resposta" : "respostas"}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        }
      />

      {user && (
        <>
          <ReplyBar channelId={channelId} threadId={parentId} />
          <Composer
            key={`composer-${parentId}`}
            channelId={channelId}
            guildId={guildId}
            // o composer da thread é o mesmo do canal: "+", GIF e figurinha
            // inclusive — o recuo diferente era o que denunciava a diferença
            allowAttachments
            draftKey={`thread:${parentId}`}
            placeholder="Responder na thread…"
            ariaLabel="Responder na thread"
            destino={nome ?? "este tópico"}
            ultimaMinhaMensagem={() => ultimaMinhaMensagem(items, user.id)}
            onSend={(content, attachments, sticker) =>
              send({ channelId, author: user, content, attachments, sticker, parentId })
            }
          />
          <TypingIndicator channelId={channelId} />
        </>
      )}
    </aside>
  );
}
