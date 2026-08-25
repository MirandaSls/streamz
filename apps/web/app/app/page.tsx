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
import ContextMenuHost from "@/components/ui/ContextMenu";
import ProfilePopoverHost from "@/components/ui/ProfilePopover";
import Toasts from "@/components/ui/Toasts";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/stores/auth";
import { useActiveChannel, useChannels, useVoiceChannel } from "@/stores/channels";
import { useActiveDM } from "@/stores/dms";
import { useEmojis } from "@/stores/emojis";
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

  useRealtime(user?.id);

  // sessão
  useEffect(() => loadFromStorage(), [loadFromStorage]);
  // emojis e figurinhas de todos os meus servidores, uma vez por sessão
  // (depois disso quem atualiza é `emoji.updated`/`sticker.updated`)
  useEffect(() => {
    if (user) void useEmojis.getState().load();
  }, [user]);
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
          {/* thread funciona em DM como em qualquer canal (ADR-0001) */}
          {activeDM && threadParentId && <ThreadPanel channelId={activeDM.id} />}
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
                channelName={voiceChannel.name ?? "voz"}
                onLeave={leaveVoice}
              />
            </main>
          ) : (
            <ChatView />
          )}

          {/* coluna 4: thread aberta OU lista de membros — nunca as duas */}
          {!voiceChannel &&
            activeChannel &&
            (threadParentId ? <ThreadPanel channelId={activeChannel.id} /> : membersOpen && <MemberList />)}
        </>
      )}

      <ModalHost />
      <ContextMenuHost />
      <ProfilePopoverHost />
      <Toasts />
    </div>
  );
}
