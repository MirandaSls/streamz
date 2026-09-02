"use client";

import { useMemo, useState } from "react";
import {
  AtSign,
  Check,
  CornerUpRight,
  Hash,
  Inbox,
  MessageCircle,
  Settings,
} from "@/components/ui/icones";
import { mentionsUser } from "@streamz/shared";
import type { InboxMention, InboxUnreadChannel } from "@streamz/shared";
import HeaderPopover from "@/components/chat/HeaderPopover";
import MessagePreview, { AcaoDoCartao } from "@/components/chat/MessagePreview";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useChannels } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useGuilds } from "@/stores/guilds";
import { useInbox } from "@/stores/messages-inbox";
import { goToChannel, goToMessage } from "@/stores/messages-navigate";
import { ui } from "@/stores/ui";

/**
 * Caixa de entrada do cabeçalho.
 *
 * São **três** abas, como no Discord: "Para Você" (tudo que chegou para mim —
 * menções e respostas), "Não Lidas" (canais com novidade) e "Menções" (só o que
 * cita o meu @). As três moram na linha do título, não como pílulas dentro do
 * corpo do painel.
 *
 * As duas primeiras listas vêm do mesmo `GET /me/mentions`: o contrato não
 * separa menção de resposta, então a aba "Menções" filtra pelo texto com a
 * mesma `mentionsUser` que decide se algo notifica.
 */
type Aba = "paraVoce" | "naoLidas" | "mencoes";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "paraVoce", rotulo: "Para Você" },
  { id: "naoLidas", rotulo: "Não Lidas" },
  { id: "mencoes", rotulo: "Menções" },
];

/** Rótulo de um canal na caixa: `#canal` no servidor, o nome na conversa. */
function rotuloDoCanal(c: Pick<InboxUnreadChannel, "channelName" | "channelType">): string {
  if (c.channelType === "DM" || c.channelType === "GROUP") return c.channelName ?? "Conversa";
  return `#${c.channelName ?? "canal"}`;
}

export default function InboxPopover({
  tamanhoDoIcone = 20,
}: {
  /** o ícone é de 20px no cabeçalho e de 16px na barra de título do desktop. */
  tamanhoDoIcone?: number;
} = {}) {
  const [aba, setAba] = useState<Aba>("paraVoce");
  /** "este servidor" filtra os não-lidos pelo servidor aberto. */
  const [soEsteServidor, setSoEsteServidor] = useState(false);
  /** menções já resolvidas nesta sessão do painel (o contrato não tem "ler uma"). */
  const [lidas, setLidas] = useState<Set<string>>(new Set());
  const me = useAuth((s) => s.user);
  const guildAtiva = useGuilds((s) => s.activeGuildId);
  const mentions = useInbox((s) => s.mentions);
  const unread = useInbox((s) => s.unread);
  const loading = useInbox((s) => s.loading);
  const load = useInbox((s) => s.load);
  const markAllRead = useInbox((s) => s.markAllRead);

  const paraVoce = useMemo(
    () => mentions.filter((m) => !lidas.has(m.message.id)),
    [mentions, lidas],
  );
  const soMencoes = useMemo(
    () => paraVoce.filter((m) => !!me && mentionsUser(m.message.content, me.username)),
    [paraVoce, me],
  );
  const naoLidas = useMemo(
    () => (soEsteServidor ? unread.filter((g) => g.guildId === guildAtiva) : unread),
    [unread, soEsteServidor, guildAtiva],
  );

  const contagem: Record<Aba, number> = {
    paraVoce: paraVoce.length,
    naoLidas: naoLidas.reduce((total, g) => total + g.channels.length, 0),
    mencoes: soMencoes.length,
  };

  /** Marca o canal da menção como lido e tira o cartão da lista. */
  function marcarComoLida(m: InboxMention) {
    setLidas((s) => new Set(s).add(m.message.id));
    const channelId = m.message.channelId;
    // a chamada é direta porque a menção pode ser de um servidor que não está
    // aberto — as stores só conhecem os canais do servidor/conversas carregados
    void api.markRead(channelId).catch(() => undefined);
    void useChannels.getState().markRead(channelId);
    void useDMs.getState().markRead(channelId);
  }

  const lista = aba === "mencoes" ? soMencoes : paraVoce;

  return (
    <HeaderPopover
      label="Caixa de entrada"
      title="Caixa de Entrada"
      icon={<Inbox size={tamanhoDoIcone} />}
      largura={440}
      onOpen={() => void load()}
      tituloControle={() => (
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 font-semibold text-txt-primary">Caixa de Entrada</h2>
          <div role="tablist" aria-label="Caixa de entrada" className="flex min-w-0 gap-1">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={`flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-xs font-medium transition ${
                  aba === a.id ? "bg-sel text-txt-primary" : "text-txt-muted hover:text-txt-normal"
                }`}
              >
                {a.rotulo}
                {contagem[a.id] > 0 && (
                  <span className="text-[11px] text-txt-faint">{contagem[a.id]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      action={
        <button
          type="button"
          onClick={() => ui.openModal({ kind: "settings", tab: "notificacoes" })}
          aria-label="Configurações de notificação"
          className="grid h-6 w-6 place-items-center rounded text-txt-secondary transition hover:text-txt-primary"
        >
          <Settings size={18} />
        </button>
      }
    >
      {(fechar) => (
        <div role="tabpanel">
          {loading && <p className="p-4 text-center text-sm text-txt-muted">Carregando…</p>}

          {!loading && aba !== "naoLidas" && (
            <>
              {lista.length === 0 && (
                <div className="p-6 text-center">
                  <AtSign size={32} aria-hidden="true" className="mx-auto mb-2 text-txt-faint" />
                  <p className="text-sm text-txt-muted">Nada esperando por você.</p>
                </div>
              )}
              {lista.map((m) => (
                <MessagePreview
                  key={m.message.id}
                  message={m.message}
                  className="mb-1 last:mb-0"
                  acima={
                    <div className="mb-1 flex items-center gap-1.5 pr-16 text-xs text-txt-muted">
                      <span className="truncate font-medium text-txt-secondary">
                        {m.guildName ?? "Mensagens diretas"}
                      </span>
                      <span aria-hidden="true">›</span>
                      <span className="truncate">
                        {rotuloDoCanal({
                          channelName: m.channelName,
                          channelType: m.channelType,
                        })}
                      </span>
                    </div>
                  }
                  acoes={
                    <>
                      <AcaoDoCartao label="Marcar como lida" onClick={() => marcarComoLida(m)}>
                        <Check size={16} />
                      </AcaoDoCartao>
                      <AcaoDoCartao
                        label="Saltar"
                        onClick={() => {
                          fechar();
                          void goToMessage({
                            guildId: m.guildId,
                            channelId: m.message.channelId,
                            messageId: m.message.id,
                          });
                        }}
                      >
                        <CornerUpRight size={16} />
                      </AcaoDoCartao>
                    </>
                  }
                />
              ))}
            </>
          )}

          {!loading && aba === "naoLidas" && (
            <>
              <div className="mb-2 flex items-center gap-1 px-1">
                {(
                  [
                    [true, "Este servidor"],
                    [false, "Todos os servidores"],
                  ] as const
                ).map(([valor, rotulo]) => (
                  <button
                    key={rotulo}
                    type="button"
                    onClick={() => setSoEsteServidor(valor)}
                    aria-pressed={soEsteServidor === valor}
                    className={`rounded-[3px] px-2 py-1 text-xs font-medium transition ${
                      soEsteServidor === valor
                        ? "bg-sel text-txt-primary"
                        : "text-txt-muted hover:text-txt-normal"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
                {naoLidas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="ml-auto text-xs font-medium text-txt-link hover:underline"
                  >
                    Marcar tudo como lido
                  </button>
                )}
              </div>

              {naoLidas.length === 0 && (
                <div className="p-6 text-center">
                  <Inbox size={32} aria-hidden="true" className="mx-auto mb-2 text-txt-faint" />
                  <p className="text-sm text-txt-muted">Você está em dia. Nada por ler.</p>
                </div>
              )}
              {naoLidas.map((g) => (
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
        </div>
      )}
    </HeaderPopover>
  );
}
