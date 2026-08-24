"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  WS_EVENTS,
  type Message,
  type GuildMemberView,
  type MessageDeletedEvent,
} from "@newdisc/shared";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/stores/auth";
import VoicePanel from "@/components/VoicePanel";
import MessageItem from "@/components/MessageItem";
import MemberList from "@/components/MemberList";
import { notify } from "@/lib/desktop";

type Guild = { id: string; name: string };
type Channel = { id: string; name: string; type: "TEXT" | "VOICE" };

export default function AppPage() {
  const router = useRouter();
  const { user, loadFromStorage, logout } = useAuth();

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [activeGuild, setActiveGuild] = useState<Guild | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [voiceChannel, setVoiceChannel] = useState<Channel | null>(null);
  const [members, setMembers] = useState<GuildMemberView[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const canModerate = members.some(
    (m) => m.user.id === user?.id && (m.role === "OWNER" || m.role === "ADMIN"),
  );

  // sessão
  useEffect(() => loadFromStorage(), [loadFromStorage]);
  useEffect(() => {
    if (!user && typeof window !== "undefined" && !localStorage.getItem("user")) {
      router.replace("/login");
    }
  }, [user, router]);

  // lista de servidores
  useEffect(() => {
    api.listGuilds().then((g) => {
      setGuilds(g);
      if (g[0]) selectGuild(g[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectGuild = useCallback(async (g: Guild) => {
    setActiveGuild(g);
    const full = await api.getGuild(g.id);
    setChannels(full.channels ?? []);
    api.members(g.id).then(setMembers).catch(() => setMembers([]));
    const firstText = (full.channels ?? []).find((c: Channel) => c.type === "TEXT");
    if (firstText) selectChannel(firstText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectChannel = useCallback(async (c: Channel) => {
    if (c.type === "VOICE") {
      // entra na call de voz (VoicePanel assume a área principal)
      setVoiceChannel(c);
      return;
    }
    // canal de texto: sai da call e volta pro fluxo de chat normal
    setVoiceChannel(null);
    setActiveChannel(c);
    const history = await api.history(c.id);
    setMessages(history);
    const socket = getSocket();
    socket.emit(WS_EVENTS.CHANNEL_JOIN, c.id);
  }, []);

  // recebe mensagens novas em tempo real
  useEffect(() => {
    const socket = getSocket();
    const onNew = (m: Message) => {
      setMessages((prev) =>
        m.channelId === activeChannel?.id ? [...prev, m] : prev,
      );
      // notificação nativa (desktop) / do browser quando a janela não está
      // em foco e a mensagem é de outra pessoa
      if (
        m.author.id !== user?.id &&
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        notify(`#${activeChannel?.name ?? "canal"}`, `${m.author.username}: ${m.content}`);
      }
    };
    const onUpdated = (m: Message) => {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    };
    const onDeleted = (d: MessageDeletedEvent) => {
      setMessages((prev) => prev.filter((x) => x.id !== d.messageId));
    };
    socket.on(WS_EVENTS.MESSAGE_NEW, onNew);
    socket.on(WS_EVENTS.MESSAGE_UPDATED, onUpdated);
    socket.on(WS_EVENTS.MESSAGE_DELETED, onDeleted);
    return () => {
      socket.off(WS_EVENTS.MESSAGE_NEW, onNew);
      socket.off(WS_EVENTS.MESSAGE_UPDATED, onUpdated);
      socket.off(WS_EVENTS.MESSAGE_DELETED, onDeleted);
    };
  }, [activeChannel, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !activeChannel) return;
    getSocket().emit(WS_EVENTS.MESSAGE_CREATE, {
      channelId: activeChannel.id,
      content: draft.trim(),
    });
    setDraft("");
  }

  function editMessage(id: string, content: string) {
    getSocket().emit(WS_EVENTS.MESSAGE_EDIT, { messageId: id, content });
  }

  function deleteMessage(id: string) {
    if (confirm("Apagar esta mensagem?")) {
      getSocket().emit(WS_EVENTS.MESSAGE_DELETE, { messageId: id });
    }
  }

  function toggleReaction(id: string, emoji: string) {
    const group = messages.find((m) => m.id === id)?.reactions.find((r) => r.emoji === emoji);
    const mine = group?.userIds.includes(user?.id ?? "");
    getSocket().emit(mine ? WS_EVENTS.REACTION_REMOVE : WS_EVENTS.REACTION_ADD, {
      messageId: id,
      emoji,
    });
  }

  async function createGuild() {
    const name = prompt("Nome do servidor?");
    if (!name) return;
    const g = await api.createGuild(name);
    setGuilds((prev) => [...prev, g]);
    selectGuild(g);
  }

  async function createChannel() {
    if (!activeGuild) return;
    const name = prompt("Nome do canal?");
    if (!name) return;
    const c = await api.createChannel(activeGuild.id, name, "TEXT");
    setChannels((prev) => [...prev, c]);
  }

  return (
    <div className="flex h-screen">
      {/* rail de servidores */}
      <nav className="flex w-[72px] flex-col items-center gap-2 bg-rail py-3">
        {guilds.map((g) => (
          <button
            key={g.id}
            onClick={() => selectGuild(g)}
            title={g.name}
            className={`grid h-12 w-12 place-items-center rounded-2xl text-sm font-bold transition ${
              activeGuild?.id === g.id ? "bg-accent text-white" : "bg-panel text-neutral-200"
            }`}
          >
            {g.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button
          onClick={createGuild}
          className="grid h-12 w-12 place-items-center rounded-2xl bg-panel text-2xl text-green-400"
          title="Criar servidor"
        >
          +
        </button>
      </nav>

      {/* lista de canais */}
      <aside className="flex w-60 flex-col bg-panel">
        <div className="flex items-center justify-between border-b border-black/20 px-4 py-3 font-semibold">
          {activeGuild?.name ?? "Selecione um servidor"}
          {activeGuild && (
            <button onClick={createChannel} className="text-lg text-neutral-400" title="Novo canal">
              +
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => selectChannel(c)}
              className={`flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm ${
                (c.type === "VOICE" ? voiceChannel?.id : activeChannel?.id) === c.id
                  ? "bg-black/30 text-white"
                  : "text-neutral-400"
              }`}
            >
              <span className="text-neutral-500">{c.type === "VOICE" ? "🔊" : "#"}</span>
              {c.name}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-black/20 px-3 py-2 text-sm">
          <span className="truncate">{user?.username}</span>
          <button onClick={() => { logout(); router.replace("/login"); }} className="text-neutral-400">
            sair
          </button>
        </div>
      </aside>

      {/* área principal: call de voz OU chat de texto */}
      <main className="flex flex-1 flex-col bg-chat">
        {voiceChannel ? (
          <VoicePanel
            key={voiceChannel.id}
            channelId={voiceChannel.id}
            channelName={voiceChannel.name}
            onLeave={() => setVoiceChannel(null)}
          />
        ) : (
          <>
            <header className="border-b border-black/20 px-4 py-3 font-semibold">
              {activeChannel ? `# ${activeChannel.name}` : "Escolha um canal"}
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  currentUserId={user?.id}
                  canModerate={canModerate}
                  onEdit={editMessage}
                  onDelete={deleteMessage}
                  onToggleReaction={toggleReaction}
                />
              ))}
              <div ref={bottomRef} />
            </div>
            {activeChannel && (
              <form onSubmit={send} className="px-4 pb-4">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Conversar em #${activeChannel.name}`}
                  className="w-full rounded bg-panel px-4 py-3 text-sm outline-none"
                />
              </form>
            )}
          </>
        )}
      </main>

      {/* coluna de membros (só no chat de texto) */}
      {!voiceChannel && activeChannel && <MemberList members={members} />}
    </div>
  );
}
