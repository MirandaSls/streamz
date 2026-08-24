"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  WS_EVENTS,
  type Message,
  type GuildMemberView,
  type MessageDeletedEvent,
  type PresenceUpdatePayload,
  type DMChannelView,
  type DirectMessage,
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
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const prependingRef = useRef(false);
  const joinedChannelRef = useRef<string | null>(null);

  // DMs
  const [dmMode, setDmMode] = useState(false);
  const [dmChannels, setDmChannels] = useState<DMChannelView[]>([]);
  const [activeDM, setActiveDM] = useState<DMChannelView | null>(null);
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
  const [dmDraft, setDmDraft] = useState("");
  const dmBottomRef = useRef<HTMLDivElement>(null);

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
    setDmMode(false);
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
    setSearchResults(null);
    setSearchQuery("");
    const history = await api.history(c.id);
    setMessages(history);
    setHasMore(history.length >= 50);
    const socket = getSocket();
    // sai da sala do canal anterior antes de entrar no novo, para não continuar
    // recebendo (e notificando) mensagens de canais que não estão mais abertos
    if (joinedChannelRef.current && joinedChannelRef.current !== c.id) {
      socket.emit(WS_EVENTS.CHANNEL_LEAVE, joinedChannelRef.current);
    }
    socket.emit(WS_EVENTS.CHANNEL_JOIN, c.id);
    joinedChannelRef.current = c.id;
  }, []);

  // recebe mensagens novas em tempo real
  useEffect(() => {
    const socket = getSocket();
    const onNew = (m: Message) => {
      if (m.channelId !== activeChannel?.id) return;
      setMessages((prev) => [...prev, m]);
      // notificação nativa (desktop) / do browser quando a janela não está
      // em foco e a mensagem é de outra pessoa
      if (
        m.author.id !== user?.id &&
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        notify(`#${activeChannel.name}`, `${m.author.username}: ${m.content}`);
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
    // não rola pro fim quando estamos adicionando histórico antigo no topo
    if (prependingRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // carrega histórico mais antigo ao chegar no topo
  async function loadOlder() {
    if (loadingMoreRef.current || !hasMore || !activeChannel || messages.length === 0) return;
    loadingMoreRef.current = true;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const older = await api.history(activeChannel.id, messages[0].id);
      if (older.length > 0) {
        prependingRef.current = true;
        setMessages((prev) => [...older, ...prev]);
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight;
          prependingRef.current = false;
        });
      }
      if (older.length < 50) setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChannel || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await api.searchMessages(activeChannel.id, searchQuery.trim());
      setSearchResults(results);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  // presença em tempo real: atualiza o status na lista de membros
  useEffect(() => {
    const socket = getSocket();
    const onPresence = ({ userId, status }: PresenceUpdatePayload) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.user.id === userId ? { ...m, user: { ...m.user, status } } : m,
        ),
      );
    };
    socket.on(WS_EVENTS.PRESENCE_UPDATE, onPresence);
    return () => {
      socket.off(WS_EVENTS.PRESENCE_UPDATE, onPresence);
    };
  }, []);

  // mensagens diretas em tempo real
  useEffect(() => {
    const socket = getSocket();
    const onDM = (m: DirectMessage) => {
      if (m.dmChannelId === activeDM?.id) {
        setDmMessages((prev) => [...prev, m]);
      }
    };
    socket.on(WS_EVENTS.DM_NEW, onDM);
    return () => {
      socket.off(WS_EVENTS.DM_NEW, onDM);
    };
  }, [activeDM]);

  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages]);

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

  async function createInvite() {
    if (!activeGuild) return;
    try {
      const inv = await api.createInvite(activeGuild.id);
      setInviteCode(inv.code);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function joinByCode() {
    const code = prompt("Cole o código do convite:");
    if (!code) return;
    try {
      const g = await api.redeemInvite(code.trim());
      setGuilds((prev) => (prev.some((x) => x.id === g.id) ? prev : [...prev, g]));
      selectGuild(g);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function kickMember(userId: string) {
    if (!activeGuild || !confirm("Expulsar este membro?")) return;
    try {
      await api.kickMember(activeGuild.id, userId);
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function banMember(userId: string) {
    if (!activeGuild || !confirm("Banir este membro? Ele não poderá voltar.")) return;
    try {
      await api.banMember(activeGuild.id, userId);
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // ── DMs ──────────────────────────────────────────────────────
  async function openDMs() {
    setDmMode(true);
    setVoiceChannel(null);
    try {
      setDmChannels(await api.listDMs());
    } catch {
      /* ignora */
    }
  }

  async function openDMWith(userId: string) {
    try {
      const dm = await api.openDM(userId);
      setDmMode(true);
      setVoiceChannel(null);
      setDmChannels((prev) => (prev.some((d) => d.id === dm.id) ? prev : [dm, ...prev]));
      selectDM(dm);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function selectDM(dm: DMChannelView) {
    setActiveDM(dm);
    try {
      setDmMessages(await api.dmHistory(dm.id));
    } catch {
      setDmMessages([]);
    }
  }

  function sendDM(e: React.FormEvent) {
    e.preventDefault();
    if (!dmDraft.trim() || !activeDM) return;
    getSocket().emit(WS_EVENTS.DM_CREATE, {
      dmChannelId: activeDM.id,
      content: dmDraft.trim(),
    });
    setDmDraft("");
  }

  return (
    <div className="flex h-screen">
      {/* rail de servidores */}
      <nav className="flex w-[72px] flex-col items-center gap-2 bg-rail py-3">
        <button
          onClick={openDMs}
          title="Mensagens diretas"
          className={`grid h-12 w-12 place-items-center rounded-2xl text-xl transition ${
            dmMode ? "bg-accent text-white" : "bg-panel text-neutral-200"
          }`}
        >
          ✉️
        </button>
        <div className="my-1 h-px w-8 bg-black/30" />
        {guilds.map((g) => (
          <button
            key={g.id}
            onClick={() => selectGuild(g)}
            title={g.name}
            className={`grid h-12 w-12 place-items-center rounded-2xl text-sm font-bold transition ${
              !dmMode && activeGuild?.id === g.id ? "bg-accent text-white" : "bg-panel text-neutral-200"
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
        <button
          onClick={joinByCode}
          className="grid h-12 w-12 place-items-center rounded-2xl bg-panel text-lg text-neutral-300 hover:text-white"
          title="Entrar com convite"
        >
          ⤵
        </button>
      </nav>

      {dmMode ? (
        <>
          {/* lista de DMs */}
          <aside className="flex w-60 flex-col bg-panel">
            <div className="border-b border-black/20 px-4 py-3 font-semibold">
              Mensagens diretas
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {dmChannels.length === 0 && (
                <p className="px-2 py-1 text-sm text-neutral-500">
                  Nenhuma conversa. Abra uma pelo 💬 na lista de membros de um servidor.
                </p>
              )}
              {dmChannels.map((d) => (
                <button
                  key={d.id}
                  onClick={() => selectDM(d)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
                    activeDM?.id === d.id ? "bg-black/30 text-white" : "text-neutral-400"
                  }`}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-rail text-xs font-bold text-neutral-200">
                    {d.other.username.slice(0, 2).toUpperCase()}
                  </span>
                  {d.other.username}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-black/20 px-3 py-2 text-sm">
              <span className="truncate">{user?.username}</span>
              <button
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
                className="text-neutral-400"
              >
                sair
              </button>
            </div>
          </aside>

          <main className="flex flex-1 flex-col bg-chat">
            {activeDM ? (
              <>
                <header className="border-b border-black/20 px-4 py-3 font-semibold">
                  @ {activeDM.other.username}
                </header>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {dmMessages.map((m) => (
                    <div key={m.id} className="mb-2">
                      <span className="mr-2 font-semibold text-white">{m.author.username}</span>
                      <span className="text-xs text-neutral-500">
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </span>
                      <div className="text-neutral-200">{m.content}</div>
                    </div>
                  ))}
                  <div ref={dmBottomRef} />
                </div>
                <form onSubmit={sendDM} className="px-4 pb-4">
                  <input
                    value={dmDraft}
                    onChange={(e) => setDmDraft(e.target.value)}
                    placeholder={`Conversar com ${activeDM.other.username}`}
                    className="w-full rounded bg-panel px-4 py-3 text-sm outline-none"
                  />
                </form>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-neutral-500">
                Selecione uma conversa
              </div>
            )}
          </main>
        </>
      ) : (
        <>
      {/* lista de canais */}
      <aside className="flex w-60 flex-col bg-panel">
        <div className="flex items-center justify-between border-b border-black/20 px-4 py-3 font-semibold">
          {activeGuild?.name ?? "Selecione um servidor"}
          {activeGuild && (
            <div className="flex items-center gap-3">
              <button
                onClick={createInvite}
                className="text-base text-neutral-400 hover:text-white"
                title="Criar convite"
              >
                🔗
              </button>
              <button
                onClick={createChannel}
                className="text-lg text-neutral-400 hover:text-white"
                title="Novo canal"
              >
                +
              </button>
            </div>
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
            <header className="flex items-center justify-between gap-3 border-b border-black/20 px-4 py-3">
              <span className="font-semibold">
                {activeChannel ? `# ${activeChannel.name}` : "Escolha um canal"}
              </span>
              {activeChannel && (
                <form onSubmit={handleSearch}>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar mensagens…"
                    className="w-52 rounded bg-rail px-3 py-1 text-sm outline-none"
                  />
                </form>
              )}
            </header>

            {searchResults !== null && (
              <div className="border-b border-black/20 bg-panel px-4 py-2">
                <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
                  <span>
                    {searchResults.length} resultado(s) para “{searchQuery}”
                  </span>
                  <button
                    onClick={() => {
                      setSearchResults(null);
                      setSearchQuery("");
                    }}
                    className="hover:text-white"
                  >
                    fechar
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <div className="py-2 text-sm text-neutral-500">Nada encontrado.</div>
                  ) : (
                    searchResults.map((m) => (
                      <div key={m.id} className="border-b border-black/10 py-1.5 text-sm">
                        <span className="font-semibold text-white">{m.author.username}</span>{" "}
                        <span className="text-xs text-neutral-500">
                          {new Date(m.createdAt).toLocaleString()}
                        </span>
                        <div className="text-neutral-300">{m.content}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div
              ref={scrollRef}
              onScroll={(e) => {
                if (e.currentTarget.scrollTop < 80) loadOlder();
              }}
              className="flex-1 overflow-y-auto px-4 py-3"
            >
              {!hasMore && messages.length > 0 && (
                <div className="mb-2 text-center text-xs text-neutral-600">
                  — início da conversa —
                </div>
              )}
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
      {!voiceChannel && activeChannel && (
        <MemberList
          members={members}
          currentUserId={user?.id}
          canModerate={canModerate}
          onKick={kickMember}
          onBan={banMember}
          onOpenDM={openDMWith}
        />
      )}
        </>
      )}

      {/* modal de convite criado */}
      {inviteCode && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60"
          onClick={() => setInviteCode(null)}
        >
          <div
            className="w-[360px] rounded-lg bg-panel p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-bold text-white">Convite criado</h2>
            <p className="mb-3 text-sm text-neutral-400">
              Compartilhe este código para entrarem no servidor:
            </p>
            <div className="mb-4 flex items-center gap-2">
              <code className="flex-1 rounded bg-rail px-3 py-2 font-mono text-sm text-accent">
                {inviteCode}
              </code>
              <button
                onClick={() => navigator.clipboard?.writeText(inviteCode)}
                className="rounded bg-accent px-3 py-2 text-sm font-medium text-white"
              >
                Copiar
              </button>
            </div>
            <button
              onClick={() => setInviteCode(null)}
              className="w-full rounded bg-rail py-2 text-sm text-neutral-300 hover:text-white"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
