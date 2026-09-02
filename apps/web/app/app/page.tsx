"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import MemberList from "@/components/MemberList";
import VoicePanel from "@/components/VoicePanel";
import ChatView from "@/components/chat/ChatView";
import DMView from "@/components/chat/DMView";
import SearchPanel from "@/components/chat/SearchPanel";
import ThreadPanel from "@/components/chat/ThreadPanel";
import ChannelSidebar from "@/components/layout/ChannelSidebar";
import DMList from "@/components/layout/DMList";
import GuildRail from "@/components/layout/GuildRail";
import UserFooter from "@/components/layout/UserFooter";
import BarraDeTitulo from "@/components/desktop/BarraDeTitulo";
import ModalHost from "@/components/modals/ModalHost";
import ContextMenuHost from "@/components/ui/ContextMenu";
import ProfilePopoverHost from "@/components/ui/ProfilePopover";
import Toasts from "@/components/ui/Toasts";
import VoiceLayer from "@/components/voice/VoiceLayer";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRealtime } from "@/hooks/useRealtime";
import { useSettingsRoute } from "@/hooks/useSettingsRoute";
import { useAuth } from "@/stores/auth";
import { useActiveChannel, useChannels, useVoiceChannel } from "@/stores/channels";
import { useActiveDM } from "@/stores/dms";
import { useEmojis } from "@/stores/emojis";
import { useGuilds } from "@/stores/guilds";
import { useMessages } from "@/stores/messages";
// ── d-social ── ausente automático depois de 10 min sem interação
import { useAutoIdle } from "@/stores/presence";
import { useUI } from "@/stores/ui";

/**
 * Layout de 3 colunas do app (ver `design.md`).
 *
 * Esta tela só decide *o que aparece em cada coluna*. Todo o estado de domínio
 * mora nas stores de `stores/`, e os eventos do gateway entram por
 * `useRealtime` — a página não guarda mensagem, canal nem membro.
 */
export default function AppPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const loadFromStorage = useAuth((s) => s.loadFromStorage);

  const view = useUI((s) => s.view);
  const membersOpen = useUI((s) => s.membersOpen);
  const voiceChatOpen = useUI((s) => s.voiceChatOpen);
  const activeChannel = useActiveChannel();
  const activeDM = useActiveDM();
  const voiceChannel = useVoiceChannel();
  const leaveVoice = useChannels((s) => s.leaveVoice);
  const threadParentId = useMessages((s) => s.threadParentId);
  // a busca ocupa a coluna 4 (como no Discord) e tem prioridade sobre thread e membros
  const buscaAberta = useMessages((s) => s.searchResults !== null || s.searching);

  useRealtime(user?.id);
  // ── e-configuracoes ──
  useKeyboardShortcuts();
  useSettingsRoute();
  useAutoIdle(!!user);

  // sessão
  useEffect(() => loadFromStorage(), [loadFromStorage]);
  // Carga inicial ao entrar no app. A lista de servidores só era buscada no
  // `onReconnect` — que, por desenho, não dispara na primeira conexão —, então
  // abrir/recarregar o app deixava o rail vazio até o socket cair e voltar.
  // Emojis e figurinhas vêm junto; depois quem os atualiza é
  // `emoji.updated`/`sticker.updated`.
  useEffect(() => {
    if (!user) return;
    void useGuilds.getState().load();
    void useEmojis.getState().load();
  }, [user]);
  useEffect(() => {
    if (!user && typeof window !== "undefined" && !localStorage.getItem("user")) {
      router.replace("/login");
    }
  }, [user, router]);

  // `min-w` no shell: abaixo de ~940px o cabeçalho da conversa quebrava — o
  // título espremia os ícones, sobrava um caractere solto à esquerda e o
  // placeholder do composer partia em três linhas. O Discord também tem um piso
  // de largura de janela; sem ele o leiaute de quatro colunas não cabe.
  return (
    <div className="flex h-full min-w-[940px] select-none">
      {/*
        Rail e coluna dentro do mesmo bloco posicionado, e o card do usuário
        como irmão dos dois.

        O card **atravessa a rail** no Discord: começa a 10px da borda da janela,
        passa por cima dos ícones de servidor e termina 10px antes do fim da
        coluna. Conferido no print — a divisória da rail aparece acima dele e
        some atrás dele. Enquanto ele morava dentro do `<aside>`, ficava preso à
        coluna e essa travessia era impossível.

        O card usa `inset-x-2.5` neste bloco, e não larguras somadas: assim ele
        continua certo se a rail ou a coluna mudarem de tamanho de novo — e elas
        acabaram de mudar.
      */}
      <div className="relative flex shrink-0">
        <GuildRail />
        {view === "dm" ? <DMList /> : <ChannelSidebar />}
        <UserFooter />
      </div>

      {view === "dm" ? (
        <>
          <DMView />
          {activeDM && buscaAberta && <SearchPanel guildId={null} />}
          {/* thread funciona em DM como em qualquer canal (ADR-0001) */}
          {activeDM && !buscaAberta && threadParentId && <ThreadPanel channelId={activeDM.id} />}
        </>
      ) : (
        <>
          {voiceChannel ? (
            // No canal de voz o palco ocupa a área inteira — o chat de texto do
            // canal existe, mas só aparece por clique no botão do cabeçalho. É o
            // oposto da chamada em conversa, onde voz e texto convivem
            // empilhados (ver `CallSplit` no `DMView`).
            <main className="flex min-w-0 flex-1 bg-chat">
              <div className="flex min-w-0 flex-1 flex-col">
                <VoicePanel
                  // remontar por canal reinicia a conexão com a sala certa
                  key={voiceChannel.id}
                  channel={voiceChannel}
                  onLeave={leaveVoice}
                />
              </div>
              {voiceChatOpen && (
                <div className="flex w-[400px] shrink-0 flex-col border-l border-border">
                  <ChatView incorporado />
                </div>
              )}
            </main>
          ) : (
            <ChatView />
          )}

          {/* Coluna 4: busca, thread OU lista de membros — uma por vez. Não há
              caso especial de voz: o canal de voz é um canal aberto como outro
              qualquer, com busca e thread na conversa dele. */}
          {activeChannel &&
            (buscaAberta ? (
              <SearchPanel guildId={activeChannel.guildId} />
            ) : threadParentId ? (
              <ThreadPanel channelId={activeChannel.id} />
            ) : (
              membersOpen && <MemberList />
            ))}
        </>
      )}

      <VoiceLayer />
      <ModalHost />
      <ContextMenuHost />
      <ProfilePopoverHost />
      <Toasts />
      {/* f-desktop: só existe dentro do Tauri; desconta a própria altura no
          <html> (ver globals.css) e traz o aviso de atualização */}
      <BarraDeTitulo />
    </div>
  );
}
