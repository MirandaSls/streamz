"use client";

import { AtSign, Hash, Inbox, MessageCircle } from "lucide-react";
import { displayNameOf } from "@streamz/shared";
import type { InboxUnreadChannel } from "@streamz/shared";
import HeaderPopover from "@/components/chat/HeaderPopover";
import Avatar from "@/components/ui/Avatar";
import { horaCompleta } from "@/lib/format";
import { useInbox } from "@/stores/messages-inbox";
import { goToChannel, goToMessage } from "@/stores/messages-navigate";

/** Rótulo de um canal na caixa: `#canal` no servidor, o nome na conversa. */
function rotuloDoCanal(c: Pick<InboxUnreadChannel, "channelName" | "channelType">): string {
  if (c.channelType === "DM" || c.channelType === "GROUP") return c.channelName ?? "Conversa";
  return `#${c.channelName ?? "canal"}`;
}

/**
 * Caixa de entrada do cabeçalho: "Para você" (menções não lidas em todos os
 * servidores e conversas) e "Não lidos" (canais com novidade, por servidor).
 */
export default function InboxPopover() {
  const tab = useInbox((s) => s.tab);
  const setTab = useInbox((s) => s.setTab);
  const mentions = useInbox((s) => s.mentions);
  const unread = useInbox((s) => s.unread);
  const loading = useInbox((s) => s.loading);
  const load = useInbox((s) => s.load);
  const markAllRead = useInbox((s) => s.markAllRead);

  return (
    <HeaderPopover
      label="Caixa de entrada"
      title="Caixa de entrada"
      icon={<Inbox size={24} />}
      width="w-[440px]"
      onOpen={() => void load()}
      action={
        tab === "unread" && unread.length > 0 ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-xs font-medium text-txt-link hover:underline"
          >
            Marcar tudo como lido
          </button>
        ) : undefined
      }
    >
      {(fechar) => (
        <>
          <div className="mb-2 flex gap-1 px-1">
            {(
              [
                ["mentions", "Para você"],
                ["unread", "Não lidos"],
              ] as const
            ).map(([k, rotulo]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-pressed={tab === k}
                className={`rounded-[3px] px-2 py-1 text-sm font-medium transition ${
                  tab === k ? "bg-sel text-txt-primary" : "text-txt-muted hover:text-txt-normal"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {loading && <p className="p-4 text-center text-sm text-txt-muted">Carregando…</p>}

          {!loading && tab === "mentions" && (
            <>
              {mentions.length === 0 && (
                <div className="p-6 text-center">
                  <AtSign size={32} aria-hidden="true" className="mx-auto mb-2 text-txt-faint" />
                  <p className="text-sm text-txt-muted">Nenhuma menção não lida.</p>
                </div>
              )}
              {mentions.map((m) => (
                <button
                  key={m.message.id}
                  type="button"
                  onClick={() => {
                    fechar();
                    void goToMessage({
                      guildId: m.guildId,
                      channelId: m.message.channelId,
                      messageId: m.message.id,
                    });
                  }}
                  className="mb-1 block w-full rounded-[5px] bg-chat p-3 text-left last:mb-0 hover:bg-msghov"
                >
                  <div className="flex items-center gap-1.5 text-xs text-txt-muted">
                    <span className="truncate font-medium text-txt-secondary">
                      {m.guildName ?? "Mensagens diretas"}
                    </span>
                    <span aria-hidden="true">›</span>
                    <span className="truncate">
                      {rotuloDoCanal({ channelName: m.channelName, channelType: m.channelType })}
                    </span>
                    <span className="ml-auto shrink-0">{horaCompleta(m.message.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Avatar user={m.message.author} size="sm" />
                    <span className="font-medium text-txt-primary">
                      {displayNameOf(m.message.author)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 break-words text-sm text-txt-normal">
                    {m.message.content ||
                      (m.message.attachments.length > 0 ? "(anexo)" : "(mensagem vazia)")}
                  </p>
                </button>
              ))}
            </>
          )}

          {!loading && tab === "unread" && (
            <>
              {unread.length === 0 && (
                <div className="p-6 text-center">
                  <Inbox size={32} aria-hidden="true" className="mx-auto mb-2 text-txt-faint" />
                  <p className="text-sm text-txt-muted">Você está em dia. Nada por ler.</p>
                </div>
              )}
              {unread.map((g) => (
                <section key={g.guildId ?? "@me"} className="mb-2 last:mb-0">
                  <h3 className="px-2 py-1 text-xs font-semibold uppercase text-txt-muted">
                    {g.guildName}
                  </h3>
                  {g.channels.map((c) => (
                    <button
                      key={c.channelId}
                      type="button"
                      onClick={() => {
                        fechar();
                        void goToChannel({ guildId: g.guildId, channelId: c.channelId });
                      }}
                      className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left hover:bg-hov"
                    >
                      {c.channelType === "DM" || c.channelType === "GROUP" ? (
                        <MessageCircle size={20} aria-hidden="true" className="text-txt-faint" />
                      ) : (
                        <Hash size={20} aria-hidden="true" className="text-txt-faint" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-txt-normal">
                        {c.channelName ?? "Conversa"}
                      </span>
                      {c.mentionCount > 0 && (
                        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[11px] font-bold text-white">
                          {c.mentionCount}
                        </span>
                      )}
                    </button>
                  ))}
                </section>
              ))}
            </>
          )}
        </>
      )}
    </HeaderPopover>
  );
}
