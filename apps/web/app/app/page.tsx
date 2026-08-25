"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import MemberList from "@/components/MemberList";
import VoicePanel from "@/components/VoicePanel";
import ChatView from "@/components/chat/ChatView";
import DMView from "@/components/chat/DMView";
import ThreadPanel from "@/components/chat/ThreadPanel";
import ChannelSidebar from "@/components/layout/ChannelSidebar";
import DMList from "@/components/layout/DMList";
import GuildRail from "@/components/layout/GuildRail";
import ModalHost from "@/components/modals/ModalHost";
import Toasts from "@/components/ui/Toasts";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/stores/auth";
import { useActiveChannel, useChannels, useVoiceChannel } from "@/stores/channels";
import { useDMs } from "@/stores/dms";
import { useCanModerate, useGuilds } from "@/stores/guilds";
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
  const activeChannel = useActiveChannel();
  const voiceChannel = useVoiceChannel();
  const leaveVoice = useChannels((s) => s.leaveVoice);
  const threadParentId = useMessages((s) => s.threadParentId);

  const members = useGuilds((s) => s.members);
  const loadGuilds = useGuilds((s) => s.load);
  const kick = useGuilds((s) => s.kick);
  const ban = useGuilds((s) => s.ban);
  const canModerate = useCanModerate(user?.id);
  const openDMWith = useDMs((s) => s.openWith);

  useRealtime(user?.id);

  // sessão
  useEffect(() => loadFromStorage(), [loadFromStorage]);
  useEffect(() => {
    if (!user && typeof window !== "undefined" && !localStorage.getItem("user")) {
      router.replace("/login");
    }
  }, [user, router]);

  useEffect(() => {
    void loadGuilds();
  }, [loadGuilds]);

  return (
    <div className="flex h-screen">
      <GuildRail />

      {view === "dm" ? (
        <>
          <DMList />
          <DMView />
        </>
      ) : (
        <>
          <ChannelSidebar />

          {voiceChannel ? (
            <main className="flex min-w-0 flex-1 flex-col bg-chat">
              <VoicePanel
                // remontar por canal reinicia a conexão com a sala certa
                key={voiceChannel.id}
                channelId={voiceChannel.id}
                channelName={voiceChannel.name}
                onLeave={leaveVoice}
              />
            </main>
          ) : (
            <ChatView />
          )}

          {/* coluna 4: thread aberta OU lista de membros — nunca as duas */}
          {!voiceChannel &&
            activeChannel &&
            (threadParentId ? (
              <ThreadPanel channelId={activeChannel.id} />
            ) : (
              <MemberList
                members={members}
                currentUserId={user?.id}
                canModerate={canModerate}
                onKick={(userId) => void kick(userId)}
                onBan={(userId) => void ban(userId)}
                onOpenDM={(userId) => void openDMWith(userId)}
              />
            ))}
        </>
      )}

      <ModalHost />
      <Toasts />
    </div>
  );
}
