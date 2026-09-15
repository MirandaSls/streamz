"use client";

import { useEffect, useState } from "react";
import { Bell, EyeOff, Hash, Lock, Megaphone, Pencil, Users, Volume2 } from "@/components/ui/icones";
import { channelNotificationScope, isMuted } from "@streamz/shared";
import Composer from "@/components/chat/Composer";
// ── h-moderacao ──
import { RulesNotice, SemPermissaoNotice, TimeoutNotice } from "@/components/moderation/ComposerNotice";

import { useModeration, useMustAcceptRules, useMyTimeout } from "@/stores/moderation";
import { usePolls } from "@/stores/polls";
import HeaderBar, { HeaderIcon } from "@/components/chat/HeaderBar";
import MessageList, { BotaoBoasVindas } from "@/components/chat/MessageList";
import PinsPopover from "@/components/chat/PinsPopover";
import ReplyBar from "@/components/chat/ReplyBar";
import ThreadsPopover from "@/components/chat/ThreadsPopover";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { ultimaMinhaMensagem } from "@/components/chat/ultima-minha";
import { MENU_WIDTH } from "@/components/ui/ContextMenu";
import { Button, Tooltip } from "@/components/ui/primitivos";
import { useSlowmode } from "@/hooks/useSlowmode";
import { useT } from "@/lib/i18n";
import { submenuNotificacoes, submenuSilenciar } from "@/lib/notification-menu";
import { useAuth } from "@/stores/auth";
import { useActiveChannel } from "@/stores/channels";
import { useGuilds } from "@/stores/guilds";
import { useNotifications } from "@/stores/notifications";
import {
  useCanManageActiveChannel,
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

/**
 * Coluna 3 no modo servidor: cabeçalho, busca, timeline e composer.
 *
 * `incorporado` é para quando a conversa divide a coluna com o palco de um canal
 * de voz (ver `CallSplit`): aí ela é uma seção dentro do `<main>` da página, e
 * não o `<main>` — dois `<main>` aninhados não existem.
 */
export default function ChatView({ incorporado = false }: { incorporado?: boolean }) {
  const Raiz = incorporado ? "section" : "main";
  const user = useAuth((s) => s.user);
  const channel = useActiveChannel();
  // o placeholder da busca é "Buscar <servidor>": a busca corre no servidor inteiro
  const nomeDoServidor = useGuilds(
    (s) => s.guilds.find((g) => g.id === s.activeGuildId)?.name ?? null,
  );
  // quem posta neste canal é SEND_MESSAGES na permissão efetiva (ADR-0002):
  // somente-leitura é deny no @everyone, e um cargo pode ter allow de volta
  const podePostar = useCanPostActiveChannel();
  // apagar mensagem dos outros é MANAGE_MESSAGES no canal, não mais o papel
  const canModerate = useCanModerateActiveChannel();
  // "Editar canal" nas boas-vindas abre as configurações do canal: a permissão
  // dele é MANAGE_CHANNELS, a mesma da engrenagem da barra lateral. Ficava atrás
  // de MANAGE_MESSAGES, que é a de apagar mensagem dos outros — quem modera a
  // conversa não necessariamente edita o canal.
  const podeEditarCanal = useCanManageActiveChannel();
  const slowmode = useSlowmode(channel?.id ?? null);
  const [liberado, setLiberado] = useState<string[]>([]);
  const slice = useActiveSlice();
  const membersOpen = useUI((s) => s.membersOpen);
  const toggleMembers = useUI((s) => s.toggleMembers);
  // o sino do cabeçalho: mesmo par (config. de silêncio + nível) do menu de
  // contexto do canal na barra lateral (`ChannelSidebar.openChannelMenu`)
  const t = useT();
  const porEscopo = useNotifications((s) => s.porEscopo);
  // ── h-moderacao ──
  const timeoutUntil = useMyTimeout();
  const mustAcceptRules = useMustAcceptRules();
  const rulesChannelId = useModeration((s) => s.membership?.onboarding.rulesChannelId ?? null);
  const guildId = useModeration((s) => s.membership?.guildId ?? null);
  const loadMyVotes = usePolls((s) => s.loadMine);
  const channelId = channel?.id;

  // meus votos das enquetes do canal: o DTO da mensagem é igual para todo
  // mundo, então a marcação "eu votei aqui" vem numa chamada à parte
  useEffect(() => {
    if (channelId) void loadMyVotes(channelId);
  }, [channelId, loadMyVotes]);

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
      <Raiz className="grid min-w-0 flex-1 place-items-center bg-background-base-lower text-text-muted">
        Escolha um canal
      </Raiz>
    );
  }

  const readOnly = !podePostar;
  // canal de servidor sempre tem nome; o tipo é nullable por causa das DMs
  const name = channel.name ?? "canal";
  const Icon =
    channel.type === "VOICE"
      ? Volume2
      : channel.type === "ANNOUNCEMENT" || channel.readOnly
        ? Megaphone
        : channel.private
          ? Lock
          : Hash;
  // canal de voz não é "#": o prefixo é do canal de texto, e escrever "#geral"
  // ao lado do alto-falante confundiria os dois na mesma coluna
  const prefixo = channel.type === "VOICE" ? "" : "#";

  // conteúdo sensível: o canal só abre depois do aviso
  if (channel.nsfw && !liberado.includes(channel.id) && !jaConfirmou(channel.id)) {
    return (
      <Raiz className="grid min-w-0 flex-1 place-items-center bg-background-base-lower px-8 text-center">
        <div className="max-w-md">
          <EyeOff size={64} strokeWidth={1} className="mx-auto text-text-muted" aria-hidden="true" />
          <h2 className="mt-4 font-headline text-2xl font-extrabold text-text-strong">
            {prefixo}
            {name}
          </h2>
          <p className="mt-2 text-text-muted">
            Este canal foi marcado como sensível. O conteúdo pode não ser apropriado
            para todo mundo.
          </p>
          <Button
            variante="primario"
            onClick={() => {
              confirmar(channel.id);
              setLiberado((ids) => [...ids, channel.id]);
            }}
            className="mt-6"
          >
            Continuar mesmo assim
          </Button>
        </div>
      </Raiz>
    );
  }

  return (
    <Raiz className="flex min-h-0 min-w-0 flex-1 flex-col bg-background-base-lower">
      {/* Incorporado ao palco de uma chamada, o cabeçalho é o do
          `PainelDeChatDaCall` (balão + nome + X, 49px): na print do Discord a
          coluna da conversa da call **não** tem busca, alfinete nem lista de
          membros. Dois cabeçalhos empilhados comeriam 93px de timeline numa
          coluna de 450. */}
      {!incorporado && (
      <HeaderBar
        icon={<Icon size={24} />}
        title={name}
        subtitle={
          channel.topic ? (
            <Tooltip rotulo="Ver o tópico completo">
              <button
                type="button"
                onClick={() => ui.openModal({ kind: "channelTopic", channelId: channel.id })}
                className="max-w-[40vw] truncate text-left hover:text-text-default"
              >
                {channel.topic}
              </button>
            </Tooltip>
          ) : undefined
        }
        searchLabel={`Buscar mensagens em ${name}`}
        searchPlaceholder={nomeDoServidor ? `Buscar ${nomeDoServidor}` : "Buscar"}
        searchValue={searchQuery}
        onSearch={(q) => {
          setSearchQuery(q);
          // no servidor a busca é do servidor inteiro, com `em:#canal` filtrando
          void runSearch({ channelId: channel.id, guildId: channel.guildId });
        }}
        tools={
          // a ordem do Discord, medida no `HeaderBar` (passo de 42px, print
          // `180835`): threads → sino → alfinete → membros → busca. Tinta
          // medida no print: 18×18 em cada glifo; `size` por ícone porque cada
          // desenho ocupa uma fração diferente do quadro (Threads e Pin a 21
          // já dão os 18px; o sino usa o mesmo 21 pelo mesmo motivo).
          <>
            <ThreadsPopover channelId={channel.id} canManage={canModerate} />
            <HeaderIcon
              // rótulo muda com o estado, como o de membros logo abaixo — o
              // Discord não escreve "(silenciado)" no tooltip do sino, mas sem
              // pista nenhuma o botão que abre "Silenciar canal" e já mudo
              // pareceria quebrado
              label={
                isMuted(porEscopo[channelNotificationScope(channel.id)])
                  ? "Notificações do canal (silenciado)"
                  : "Notificações do canal"
              }
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const escopo = { tipo: "canal" as const, channelId: channel.id };
                const setting = porEscopo[channelNotificationScope(channel.id)];
                // alinhado pela borda direita do botão, 4px abaixo — o mesmo
                // cálculo do menu do cabeçalho do servidor
                // (`CabecalhoDoServidor`, linha 161) e do canal
                // (`ChannelSidebar.openChannelMenu`), cujos dois primeiros
                // itens são estes dois submenus
                ui.openContextMenu(
                  r.right - MENU_WIDTH,
                  r.bottom + 4,
                  [submenuSilenciar("Silenciar canal", escopo, setting, t), submenuNotificacoes(escopo, setting, t)],
                  MENU_WIDTH,
                );
              }}
            >
              <Bell size={21} />
            </HeaderIcon>
            <PinsPopover channelId={channel.id} guildId={channel.guildId} canPin={canModerate} />
            <HeaderIcon
              label={membersOpen ? "Ocultar lista de membros" : "Mostrar lista de membros"}
              active={membersOpen}
              onClick={toggleMembers}
            >
              <Users size={22} />
            </HeaderIcon>
          </>
        }
      />
      )}

      <MessageList
        // remonta a cada canal para zerar a rolagem e os marcadores de posição
        key={`lista-${channel.id}`}
        channelId={channel.id}
        items={slice.items}
        hasMore={slice.hasMore}
        loading={slice.loading}
        loadingOlder={slice.loadingOlder}
        loadingOlderError={slice.loadingOlderError}
        onLoadOlder={() => void loadOlder(channel.id)}
        currentUserId={user?.id}
        canModerate={canModerate}
        onEdit={edit}
        onDelete={(id, semConfirmar) => void remove(id, semConfirmar)}
        onToggleReaction={(id, emoji) => toggleReaction(id, emoji, user?.id)}
        onOpenThread={(message) => void openThread(channel.id, message)}
        onRetry={retry}
        onDiscard={discard}
        scrollToId={highlightId}
        emptyText="Nenhuma mensagem ainda. Diga um oi."
        welcome={{
          icon: <Icon size={42} />,
          // o texto do Discord em pt-BR: "Bem-vindo(a) a #geral!" e "começo"
          title: `Bem-vindo(a) a ${prefixo}${name}!`,
          description: channel.topic || `Este é o começo do canal ${prefixo}${name}.`,
          // No print do Discord, quem administra vê só "Editar canal" aqui;
          // "Convidar amigos" mora no cabeçalho da coluna de canais. Quem não
          // administra não vê fileira nenhuma (a regra de permissão de antes).
          // Descrição → topo do botão: 30px medidos; 14px de margem + a folga
          // do parágrafo.
          actions: podeEditarCanal ? (
            <div className="mt-3.5 flex flex-wrap gap-2">
              <BotaoBoasVindas
                icon={<Pencil size={16} />}
                label="Editar canal"
                onClick={() =>
                  ui.openModal({ kind: "channelSettings", channelId: channel.id, tab: "geral" })
                }
              />
            </div>
          ) : undefined,
        }}
      />

      {readOnly ? (
        // mesmo aviso "somente-leitura" do composer em todo o app (h-moderacao)
        <SemPermissaoNotice />
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
              guildId={channel.guildId}
              allowAttachments
              placeholder={
                slowmode.blocked
                  ? `Modo lento: aguarde ${slowmode.remaining}s`
                  : `Conversar em ${prefixo}${name}`
              }
              ariaLabel={`Mensagem para ${prefixo}${name}`}
              destino={`${prefixo}${name}`}
              // o aviso de modo lento vive dentro do composer (contador à
              // direita do campo), não como parágrafo solto acima dele
              modoLento={
                slowmode.seconds > 0
                  ? {
                      segundos: slowmode.seconds,
                      restante: slowmode.remaining,
                      bloqueado: slowmode.blocked,
                    }
                  : undefined
              }
              // ↑ no campo vazio reabre a última mensagem minha para editar
              ultimaMinhaMensagem={() => ultimaMinhaMensagem(slice.items, user.id)}
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
            {/* o "digitando…" flutua sobre a lista desde o #60; este irmão do
                composer só dá o respiro de 10px até o fundo e mede a altura
                dele, então só faz sentido onde há composer */}
            <TypingIndicator channelId={channel.id} />
          </>
        )
      )}
    </Raiz>
  );
}
