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
import ModalHost from "@/components/modals/ModalHost";
import ContextMenuHost from "@/components/ui/ContextMenu";
import ProfilePopoverHost from "@/components/ui/ProfilePopover";
import Toasts from "@/components/ui/Toasts";
import VoiceLayer from "@/components/voice/VoiceLayer";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/stores/auth";
import { useActiveChannel, useChannels, useVoiceChannel } from "@/stores/channels";
import { useActiveDM } from "@/stores/dms";
import { useMessages } from "@/stores/messages";
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
  const activeChannel = useActiveChannel();
  const activeDM = useActiveDM();
  const voiceChannel = useVoiceChannel();
  const leaveVoice = useChannels((s) => s.leaveVoice);
  const threadParentId = useMessages((s) => s.threadParentId);
  // a busca ocupa a coluna 4 (como no Discord) e tem prioridade sobre thread e membros
  const buscaAberta = useMessages((s) => s.searchResults !== null || s.searching);

  useRealtime(user?.id);

  // sessão
  useEffect(() => loadFromStorage(), [loadFromStorage]);
  useEffect(() => {
    if (!user && typeof window !== "undefined" && !localStorage.getItem("user")) {
      router.replace("/login");
    }
  }, [user, router]);

  return (
    <div className="flex h-screen select-none">
      <GuildRail />

      {view === "dm" ? (
        <>
          <DMList />
          <DMView />
          {activeDM && buscaAberta && <SearchPanel guildId={null} />}
          {/* thread funciona em DM como em qualquer canal (ADR-0001) */}
          {activeDM && !buscaAberta && threadParentId && <ThreadPanel channelId={activeDM.id} />}
        </>
      ) : (
        <>
          <ChannelSidebar />

          {voiceChannel ? (
            <main className="flex min-w-0 flex-1 flex-col bg-chat">
              <VoicePanel
                // remontar por canal reinicia a conexão com a sala certa
                key={voiceChannel.id}
                channel={voiceChannel}
                onLeave={leaveVoice}
              />
            </main>
          ) : (
            <ChatView />
          )}

          {/* coluna 4: busca, thread aberta OU lista de membros — nunca duas */}
          {!voiceChannel &&
            activeChannel &&
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
    </div>
  );
}
