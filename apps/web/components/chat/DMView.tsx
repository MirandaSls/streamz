"use client";

import { useEffect, useState } from "react";
import { PhoneCall, Settings, UserPlus, UserProfile, Users, Video } from "@/components/ui/icones";
import { isGroupChannel } from "@streamz/shared";
import Composer from "@/components/chat/Composer";
import DMMemberList from "@/components/chat/DMMemberList";
import DMProfilePanel from "@/components/chat/DMProfilePanel";
import HeaderBar, { HeaderIcon } from "@/components/chat/HeaderBar";
import MessageList, { BotaoBoasVindas } from "@/components/chat/MessageList";
import PinsPopover from "@/components/chat/PinsPopover";
import ReplyBar from "@/components/chat/ReplyBar";
import TypingIndicator from "@/components/chat/TypingIndicator";
import { ultimaMinhaMensagem } from "@/components/chat/ultima-minha";
import FriendsPage from "@/components/friends/FriendsPage";
import Avatar, { GroupAvatar } from "@/components/ui/Avatar";
import CallBanner from "@/components/voice/CallBanner";
import CallSplit from "@/components/voice/CallSplit";
import CallStage from "@/components/voice/CallStage";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { dmTitle, useActiveDM } from "@/stores/dms";
import { useBlockedIds, useFriends, useRelationship } from "@/stores/friends";
import { useActiveSlice, useMessages } from "@/stores/messages";
import { resolveStatus, usePresence } from "@/stores/presence";
import { ui, useUI } from "@/stores/ui";
import { useVoice } from "@/stores/voice";

/**
 * Coluna 3 no modo DM: a página Amigos (a home) ou a conversa aberta.
 *
 * A conversa é a mesma timeline do canal de servidor (`ChatView`) — uma DM é um
 * canal — só muda o cabeçalho e o fato de não haver moderação: em DM só o autor
 * apaga. A coluna 4 (participantes) é montada aqui e não na página, porque só o
 * modo DM a tem.
 *
 * Com chamada em andamento o corpo se empilha, como no Discord: o palco em
 * cima, a conversa embaixo, com o divisor arrastável do `CallSplit`. Enquanto
 * eu estou na chamada a conversa começa fechada (o palco é o que interessa);
 * de fora dela, aberta — quem só está vendo que existe uma call continua lendo
 * o histórico.
 */
export default function DMView() {
  const user = useAuth((s) => s.user);
  const active = useActiveDM();
  const slice = useActiveSlice();
  const statuses = usePresence((s) => s.statuses);
  const startCall = useVoice((s) => s.startCall);
  const naChamada = useVoice((s) => s.channelId);
  const friendsOpen = useFriends((s) => s.open);
  // hook antes de qualquer `return` antecipado; o uso vem depois de `other`
  const bloqueados = useBlockedIds();
  const membersOpen = useUI((s) => s.membersOpen);
  const toggleMembers = useUI((s) => s.toggleMembers);

  // O início da conversa 1:1 traz "N servidores em comum · Desfazer amizade ·
  // Bloquear", como no Discord. A relação vem das listas em memória (o botão
  // some no instante em que a amizade acaba); os servidores em comum vêm do
  // perfil calculado por espectador (`GET /users/:id/profile`), o mesmo que a
  // coluna 4 usa — sem resposta a linha fica só com os botões.
  const outroId = active && !isGroupChannel(active) ? active.others[0]?.id : undefined;
  const relacao = useRelationship(outroId, user?.id);
  const removerAmigo = useFriends((s) => s.remove);
  const bloquear = useFriends((s) => s.block);
  const desbloquear = useFriends((s) => s.unblock);
  const [servidoresEmComum, setServidoresEmComum] = useState<number | null>(null);
  useEffect(() => {
    setServidoresEmComum(null);
    if (!outroId) return;
    let vivo = true;
    void api
      .profile(outroId)
      .then((p) => vivo && setServidoresEmComum(p.mutualGuilds.length))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [outroId]);

  // chamada em andamento nesta conversa (minha ou de outro participante)
  const emChamada = useVoice((s) => (s.statesOf(active?.id ?? "").length > 0));
  // Padrão da chamada em conversa: palco E conversa juntos. Numa DM o histórico
  // é o contexto da própria chamada — esconder o texto por estar em call
  // obrigava a reabrir na mão toda vez. Quem quiser só o palco usa a tela cheia.
  const [chatManual, setChatManual] = useState<boolean | null>(null);
  useEffect(() => setChatManual(null), [active?.id, emChamada]);
  const chatAberto = chatManual ?? true;

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

  // a página Amigos ocupa a coluna 3 no lugar da conversa
  if (friendsOpen) return <FriendsPage />;

  if (!active) {
    return (
      <main className="grid min-w-0 flex-1 place-items-center bg-chat text-txt-muted">
        Selecione uma conversa
      </main>
    );
  }

  const title = dmTitle(active);
  const group = isGroupChannel(active);
  const other = !group ? active.others[0] : undefined;
  const bloqueado = !!other && bloqueados.has(other.id);

  const palco = (
    <CallStage
      channelId={active.id}
      titulo={title}
      chatAberto={chatAberto}
      onToggleChat={() => setChatManual(!chatAberto)}
    />
  );

  const conversa = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MessageList
        // remonta a cada conversa para zerar a rolagem e os marcadores de posição
        key={`lista-${active.id}`}
        channelId={active.id}
        items={slice.items}
        hasMore={slice.hasMore}
        loading={slice.loading}
        loadingOlder={slice.loadingOlder}
        onLoadOlder={() => void loadOlder(active.id)}
        currentUserId={user?.id}
        canModerate={false}
        onEdit={edit}
        onDelete={(id, semConfirmar) => void remove(id, semConfirmar)}
        onToggleReaction={(id, emoji) => toggleReaction(id, emoji, user?.id)}
        onOpenThread={(message) => void openThread(active.id, message)}
        onRetry={retry}
        onDiscard={discard}
        scrollToId={highlightId}
        emptyText="Nenhuma mensagem ainda. Diga um oi."
        welcome={
          other
            ? {
                // medido no Discord: avatar de 80px sem círculo, nome 32/800,
                // username 20/600 logo abaixo, nome do contato em negrito na
                // frase (sem "@"), e a linha de relação com botões de 32/raio 8
                icon: <Avatar user={other} size="xl" />,
                semCirculo: true,
                title,
                subtitle: other.username,
                description: (
                  <>
                    Este é o começo do seu histórico de mensagens diretas com{" "}
                    <strong className="font-semibold text-txt-primary">{title}</strong>.
                  </>
                ),
                // descrição → topo dos botões: 25px medidos (8 de margem + a folga
                // do parágrafo). Texto → ponto → botão: 12px de cada lado; entre
                // botões, 8px.
                actions: (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {servidoresEmComum !== null && (
                      <>
                        <span className="text-sm text-txt-muted">
                          {servidoresEmComum === 0
                            ? "Nenhum servidor em comum"
                            : servidoresEmComum === 1
                              ? "1 servidor em comum"
                              : `${servidoresEmComum} servidores em comum`}
                        </span>
                        <span aria-hidden="true" className="mx-1 h-1 w-1 rounded-full bg-txt-muted" />
                      </>
                    )}
                    {relacao === "friend" && (
                      <BotaoBoasVindas label="Desfazer amizade" onClick={() => void removerAmigo(other)} />
                    )}
                    {relacao === "blocked" ? (
                      <BotaoBoasVindas label="Desbloquear" onClick={() => void desbloquear(other.id)} />
                    ) : (
                      <BotaoBoasVindas label="Bloquear" onClick={() => void bloquear(other)} />
                    )}
                  </div>
                ),
              }
            : {
                icon: <GroupAvatar iconUrl={active.iconUrl} size="lg" />,
                title,
                description: `Bem-vindo(a) ao começo do grupo ${title}.`,
              }
        }
      />

      {user && (
        <>
          <ReplyBar channelId={active.id} />
          <Composer
            key={`composer-${active.id}`}
            channelId={active.id}
            allowAttachments
            placeholder={`Conversar em ${group ? title : `@${title}`}`}
            ariaLabel={`Mensagem para ${title}`}
            // sem o destino, o overlay de arrastar caía no fallback e
            // escrevia "em esta conversa"
            destino={group ? title : `@${title}`}
            // ↑ no campo vazio também edita a última mensagem minha aqui
            ultimaMinhaMensagem={() => ultimaMinhaMensagem(slice.items, user.id)}
            onSend={(content, attachments, sticker) =>
              send({ channelId: active.id, author: user, content, attachments, sticker })
            }
          />
          <TypingIndicator channelId={active.id} />
        </>
      )}
    </div>
  );

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col bg-chat">
        <HeaderBar
          icon={
            other ? (
              <Avatar user={other} size="sm" status={resolveStatus(statuses, other)} surface="border-chat" />
            ) : (
              <GroupAvatar iconUrl={active.iconUrl} size="sm" />
            )
          }
          title={title}
          searchLabel={`Buscar mensagens em ${title}`}
          // "Buscar <username>" na conversa 1:1 e "Buscar <nome do grupo>" no
          // grupo — a busca corre só neste canal nos dois casos
          searchPlaceholder={`Buscar ${other ? other.username : title}`}
          searchValue={searchQuery}
          onSearch={(q) => {
            setSearchQuery(q);
            // conversa não tem servidor: a busca corre só neste canal
            void runSearch({ channelId: active.id, guildId: null });
          }}
          tools={
            // a ordem do Discord: telefone → vídeo → alfinete → adicionar → perfil → busca
            <>
              {/* bloqueado não recebe chamada: a API recusa, e oferecer o botão
                  só para o clique falhar é pior que não ter o botão */}
              {!bloqueado && (
                <>
                  <HeaderIcon
                    label="Iniciar chamada de voz"
                    active={naChamada === active.id}
                    onClick={() => void startCall(active.id, false)}
                  >
                    <PhoneCall size={20} />
                  </HeaderIcon>
                  <HeaderIcon
                    label="Iniciar chamada de vídeo"
                    onClick={() => void startCall(active.id, true)}
                  >
                    <Video size={20} />
                  </HeaderIcon>
                </>
              )}
              {/* em conversa direta não há moderação: qualquer participante fixa */}
              <PinsPopover channelId={active.id} guildId={null} canPin />
              {group && (
                <>
                  <HeaderIcon
                    label="Adicionar pessoas"
                    onClick={() => ui.openModal({ kind: "addGroupMembers", channelId: active.id })}
                  >
                    <UserPlus size={20} />
                  </HeaderIcon>
                  <HeaderIcon
                    label="Configurações do grupo"
                    onClick={() => ui.openModal({ kind: "groupSettings", channelId: active.id })}
                  >
                    <Settings size={20} />
                  </HeaderIcon>
                </>
              )}
              {/* só em 1:1: no grupo o "adicionar pessoas" já existe acima */}
              {!group && !bloqueado && (
                <HeaderIcon
                  label="Adicionar amigo à conversa"
                  onClick={() => ui.openModal({ kind: "createGroupDM" })}
                >
                  <UserPlus size={20} />
                </HeaderIcon>
              )}
              <HeaderIcon
                label={group ? "Mostrar participantes" : "Mostrar perfil"}
                active={membersOpen}
                onClick={toggleMembers}
              >
                {/* em conversa 1:1 o painel é o perfil do contato, e o sinal é
                    a pessoa dentro do círculo; em grupo continua sendo a lista
                    de participantes */}
                {group ? <Users size={20} /> : <UserProfile size={20} />}
              </HeaderIcon>
            </>
          }
        />

        {/* Faixa fina "Fulano está numa chamada — Entrar", para quem está lendo
            a conversa sem ter entrado. Some sozinha quando eu entro. */}
        <CallBanner channelId={active.id} />

        {/* f-voz: com chamada, o palco toma a coluna e a conversa vai para a
            direita, numa coluna de 450 (ver `CallSplit`) */}
        {emChamada && chatAberto ? (
          <CallSplit
            chamada={palco}
            chat={conversa}
            titulo={title}
            onFecharChat={() => setChatManual(false)}
          />
        ) : emChamada ? (
          palco
        ) : (
          conversa
        )}
      </main>

      {/*
        Coluna 4 do modo DM. O botão do cabeçalho é o mesmo; o que ele abre é
        que depende da conversa, como no Discord: em grupo, quem está nela; em
        conversa 1:1, o perfil do contato — uma lista de um nome só não
        acrescentava nada ao cabeçalho.
      */}
      {membersOpen &&
        (group || !other ? <DMMemberList dm={active} /> : <DMProfilePanel user={other} />)}
    </>
  );
}
