"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  WS_EVENTS,
  type Message,
  type GuildMemberView,
  type MessageDeletedEvent,
  type PresenceUpdatePayload,
  type DMChannelView,
  type DirectMessage,
  type GuildRemovedEvent,
  type PublicUser,
  type Attachment,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from "@newdisc/shared";
import { api } from "@/lib/api";
import { getSocket, joinChannel, leaveChannel } from "@/lib/socket";
import { useAuth } from "@/stores/auth";
import VoicePanel from "@/components/VoicePanel";
import MessageItem from "@/components/MessageItem";
import MemberList from "@/components/MemberList";
import { notify } from "@/lib/desktop";

type Guild = { id: string; name: string };
type Channel = {
  id: string;
  name: string;
  type: "TEXT" | "VOICE";
  private: boolean;
  readOnly: boolean;
};

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

  // anexos em preparo no composer do canal
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // criação de canal
  const [channelModal, setChannelModal] = useState(false);
  const [chName, setChName] = useState("");
  const [chType, setChType] = useState<"TEXT" | "VOICE">("TEXT");
  const [chPrivate, setChPrivate] = useState(false);
  const [chReadOnly, setChReadOnly] = useState(false);
  const [chPicks, setChPicks] = useState<Set<string>>(new Set());

  // gerenciar acesso de canal privado
  const [accessModal, setAccessModal] = useState<Channel | null>(null);
  const [accessAllowed, setAccessAllowed] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [threadParentId, setThreadParentId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadDraft, setThreadDraft] = useState("");
  const threadParentIdRef = useRef<string | null>(null);
  const threadBottomRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const prependingRef = useRef(false);
  const joinedChannelRef = useRef<string | null>(null);
  const activeGuildRef = useRef<Guild | null>(null);

  // DMs
  const [dmMode, setDmMode] = useState(false);
  const [dmChannels, setDmChannels] = useState<DMChannelView[]>([]);
  const [activeDM, setActiveDM] = useState<DMChannelView | null>(null);
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
  const [dmDraft, setDmDraft] = useState("");
  const dmBottomRef = useRef<HTMLDivElement>(null);

  // criação de grupo de DM
  const [groupModal, setGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPicks, setGroupPicks] = useState<Set<string>>(new Set());
  // contatos = usuários das suas DMs 1-a-1 (sem endpoint de busca no MVP)
  const dmContacts = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const d of dmChannels) {
      if (d.isGroup) continue;
      for (const u of d.others) map.set(u.id, u);
    }
    return Array.from(map.values());
  }, [dmChannels]);

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
    setPending([]);
    setDraft("");
    closeThread();
    const history = await api.history(c.id);
    setMessages(history);
    setHasMore(history.length >= 50);
    // sai da sala do canal anterior antes de entrar no novo, para não continuar
    // recebendo (e notificando) mensagens de canais que não estão mais abertos
    if (joinedChannelRef.current && joinedChannelRef.current !== c.id) {
      leaveChannel(joinedChannelRef.current);
    }
    // helper do socket: registra a sala para reentrar sozinho após reconexão
    joinChannel(c.id);
    joinedChannelRef.current = c.id;
  }, []);

  // recebe mensagens novas em tempo real
  useEffect(() => {
    const socket = getSocket();
    const onNew = (m: Message) => {
      if (m.channelId !== activeChannel?.id) return;
      if (m.parentId) {
        // resposta: incrementa o contador da raiz e alimenta a thread aberta;
        // não entra na timeline principal
        setMessages((prev) =>
          prev.map((x) =>
            x.id === m.parentId ? { ...x, replyCount: x.replyCount + 1 } : x,
          ),
        );
        if (threadParentIdRef.current === m.parentId) {
          setThreadMessages((prev) => [...prev, m]);
        }
        return;
      }
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
      setThreadMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    };
    const onDeleted = (d: MessageDeletedEvent) => {
      setMessages((prev) =>
        prev
          .filter((x) => x.id !== d.messageId)
          .map((x) =>
            d.parentId && x.id === d.parentId
              ? { ...x, replyCount: Math.max(0, x.replyCount - 1) }
              : x,
          ),
      );
      setThreadMessages((prev) => prev.filter((x) => x.id !== d.messageId));
      // a raiz da thread aberta foi apagada → fecha o painel
      if (threadParentIdRef.current === d.messageId) closeThread();
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

  // mantém o servidor ativo acessível dentro de listeners sem re-registrar
  useEffect(() => {
    activeGuildRef.current = activeGuild;
  }, [activeGuild]);

  // idem para a thread aberta (usado nos handlers de socket)
  useEffect(() => {
    threadParentIdRef.current = threadParentId;
  }, [threadParentId]);

  // rola a thread para o fim quando chegam respostas
  useEffect(() => {
    threadBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  // fui expulso/banido de um servidor: some da lista e limpa a área se estava aberto
  useEffect(() => {
    const socket = getSocket();
    const onRemoved = ({ guildId }: GuildRemovedEvent) => {
      setGuilds((prev) => prev.filter((g) => g.id !== guildId));
      if (activeGuildRef.current?.id === guildId) {
        setActiveGuild(null);
        setChannels([]);
        setActiveChannel(null);
        setMembers([]);
        setMessages([]);
        setVoiceChannel(null);
        joinedChannelRef.current = null;
      }
    };
    socket.on(WS_EVENTS.GUILD_REMOVED, onRemoved);
    return () => {
      socket.off(WS_EVENTS.GUILD_REMOVED, onRemoved);
    };
  }, []);

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

  // envia arquivos ao storage e adiciona ao preparo (input/drag-drop/colar)
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const room = MAX_ATTACHMENTS_PER_MESSAGE - pending.length;
      if (room <= 0) {
        alert(`Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem.`);
        return;
      }
      setUploading(true);
      try {
        for (const file of list.slice(0, room)) {
          try {
            const att = await api.uploadFile(file);
            setPending((prev) => [...prev, att]);
          } catch (err) {
            alert(`Falha ao enviar ${file.name}: ${(err as Error).message}`);
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [pending.length],
  );

  function removePending(id: string) {
    setPending((prev) => prev.filter((a) => a.id !== id));
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChannel || uploading) return;
    const content = draft.trim();
    if (!content && pending.length === 0) return;
    getSocket().emit(WS_EVENTS.MESSAGE_CREATE, {
      channelId: activeChannel.id,
      content,
      attachmentIds: pending.map((a) => a.id),
    });
    setDraft("");
    setPending([]);
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
    const pool = [...messages, ...threadMessages];
    const group = pool.find((m) => m.id === id)?.reactions.find((r) => r.emoji === emoji);
    const mine = group?.userIds.includes(user?.id ?? "");
    getSocket().emit(mine ? WS_EVENTS.REACTION_REMOVE : WS_EVENTS.REACTION_ADD, {
      messageId: id,
      emoji,
    });
  }

  // ── threads ──────────────────────────────────────────────────
  async function openThread(m: Message) {
    if (!activeChannel) return;
    setThreadParentId(m.id);
    threadParentIdRef.current = m.id;
    try {
      setThreadMessages(await api.thread(activeChannel.id, m.id));
    } catch {
      setThreadMessages([]);
    }
  }

  function closeThread() {
    setThreadParentId(null);
    threadParentIdRef.current = null;
    setThreadMessages([]);
    setThreadDraft("");
  }

  function sendThreadReply(e: React.FormEvent) {
    e.preventDefault();
    const t = threadDraft.trim();
    if (!t || !activeChannel || !threadParentId) return;
    getSocket().emit(WS_EVENTS.MESSAGE_CREATE, {
      channelId: activeChannel.id,
      content: t,
      parentId: threadParentId,
    });
    setThreadDraft("");
  }

  async function createGuild() {
    const name = prompt("Nome do servidor?");
    if (!name) return;
    const g = await api.createGuild(name);
    setGuilds((prev) => [...prev, g]);
    selectGuild(g);
  }

  function openChannelModal() {
    if (!activeGuild) return;
    setChName("");
    setChType("TEXT");
    setChPrivate(false);
    setChReadOnly(false);
    setChPicks(new Set());
    setChannelModal(true);
  }

  async function submitChannel() {
    if (!activeGuild || !chName.trim()) return;
    try {
      const c = await api.createChannel(activeGuild.id, chName.trim(), chType, {
        isPrivate: chPrivate,
        readOnly: chReadOnly,
        memberIds: chPrivate ? Array.from(chPicks) : undefined,
      });
      setChannels((prev) => [...prev, c]);
      setChannelModal(false);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function openAccess(c: Channel) {
    if (!activeGuild) return;
    setAccessModal(c);
    try {
      const rows = await api.channelMembers(activeGuild.id, c.id);
      setAccessAllowed(new Set(rows.map((r) => r.user.id)));
    } catch {
      setAccessAllowed(new Set());
    }
  }

  async function toggleAccess(userId: string) {
    if (!activeGuild || !accessModal) return;
    const has = accessAllowed.has(userId);
    try {
      if (has) await api.removeChannelMember(activeGuild.id, accessModal.id, userId);
      else await api.addChannelMember(activeGuild.id, accessModal.id, userId);
      setAccessAllowed((prev) => {
        const next = new Set(prev);
        has ? next.delete(userId) : next.add(userId);
        return next;
      });
    } catch (e) {
      alert((e as Error).message);
    }
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
  function dmTitle(d: DMChannelView): string {
    if (d.isGroup) return d.name || d.others.map((u) => u.username).join(", ") || "Grupo";
    return d.others[0]?.username ?? "Conversa";
  }

  function toggleGroupPick(userId: string) {
    setGroupPicks((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  async function submitGroup() {
    const ids = Array.from(groupPicks);
    if (ids.length < 2) {
      alert("Escolha ao menos 2 contatos para formar um grupo.");
      return;
    }
    try {
      const dm = await api.createGroupDM(ids, groupName.trim() || undefined);
      setDmChannels((prev) => [dm, ...prev]);
      setGroupModal(false);
      setGroupName("");
      setGroupPicks(new Set());
      selectDM(dm);
    } catch (e) {
      alert((e as Error).message);
    }
  }

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
            <div className="flex items-center justify-between border-b border-black/20 px-4 py-3 font-semibold">
              Mensagens diretas
              <button
                onClick={() => setGroupModal(true)}
                title="Criar grupo"
                className="text-lg text-neutral-400 hover:text-white"
              >
                ＋
              </button>
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
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rail text-xs font-bold text-neutral-200">
                    {d.isGroup ? "👥" : dmTitle(d).slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{dmTitle(d)}</span>
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
                  {activeDM.isGroup ? "👥 " : "@ "}
                  {dmTitle(activeDM)}
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
                    placeholder={`Conversar em ${dmTitle(activeDM)}`}
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
                onClick={openChannelModal}
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
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${
                (c.type === "VOICE" ? voiceChannel?.id : activeChannel?.id) === c.id
                  ? "bg-black/30 text-white"
                  : "text-neutral-400"
              }`}
            >
              <button
                onClick={() => selectChannel(c)}
                className="flex min-w-0 flex-1 items-center gap-1 text-left"
              >
                <span className="text-neutral-500">
                  {c.private ? "🔒" : c.type === "VOICE" ? "🔊" : "#"}
                </span>
                <span className="truncate">{c.name}</span>
                {c.readOnly && <span title="Somente leitura">📢</span>}
              </button>
              {c.private && canModerate && (
                <button
                  onClick={() => openAccess(c)}
                  title="Gerenciar acesso"
                  className="hidden text-xs text-neutral-400 hover:text-white group-hover:block"
                >
                  ⚙️
                </button>
              )}
            </div>
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
                  onOpenThread={openThread}
                />
              ))}
              <div ref={bottomRef} />
            </div>
            {activeChannel &&
              (activeChannel.readOnly && !canModerate ? (
                <div className="px-4 pb-4 text-center text-sm text-neutral-500">
                  📢 Canal somente leitura
                </div>
              ) : (
                <form
                  onSubmit={send}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
                  }}
                  className={`px-4 pb-4 ${dragging ? "opacity-70" : ""}`}
                >
                  {/* preview dos anexos em preparo */}
                  {(pending.length > 0 || uploading) && (
                    <div className="mb-2 flex flex-wrap gap-2 rounded bg-panel p-2">
                      {pending.map((a) => (
                        <div
                          key={a.id}
                          className="relative flex items-center gap-2 rounded bg-rail px-2 py-1 text-xs"
                        >
                          {a.contentType.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={a.url}
                              alt={a.filename}
                              className="h-10 w-10 rounded object-cover"
                            />
                          ) : (
                            <span className="text-lg">📎</span>
                          )}
                          <span className="max-w-[8rem] truncate">{a.filename}</span>
                          <button
                            type="button"
                            onClick={() => removePending(a.id)}
                            title="Remover"
                            className="text-neutral-400 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {uploading && (
                        <span className="self-center text-xs text-neutral-400">
                          Enviando…
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 rounded bg-panel px-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        if (e.target.files?.length) addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Anexar arquivo"
                      className="text-xl text-neutral-400 hover:text-white"
                    >
                      ＋
                    </button>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onPaste={(e) => {
                        const files = Array.from(e.clipboardData.files);
                        if (files.length) {
                          e.preventDefault();
                          addFiles(files);
                        }
                      }}
                      placeholder={
                        dragging
                          ? "Solte os arquivos para anexar…"
                          : `Conversar em #${activeChannel.name}`
                      }
                      className="flex-1 bg-transparent py-3 text-sm outline-none"
                    />
                  </div>
                </form>
              ))}
          </>
        )}
      </main>

      {/* coluna da direita: thread aberta OU lista de membros (só no chat de texto) */}
      {!voiceChannel && activeChannel && threadParentId ? (
        <aside className="flex w-[22rem] flex-col border-l border-black/20 bg-panel">
          <div className="flex items-center justify-between border-b border-black/20 px-4 py-3">
            <span className="font-semibold">Thread</span>
            <button
              onClick={closeThread}
              className="text-neutral-400 hover:text-white"
              title="Fechar thread"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-3">
            {threadMessages.map((m, i) => (
              <div key={m.id}>
                <MessageItem
                  message={m}
                  currentUserId={user?.id}
                  canModerate={canModerate}
                  onEdit={editMessage}
                  onDelete={deleteMessage}
                  onToggleReaction={toggleReaction}
                />
                {i === 0 && (
                  <div className="my-2 flex items-center gap-2 px-2 text-xs text-neutral-500">
                    <span className="h-px flex-1 bg-black/20" />
                    {threadMessages.length - 1}{" "}
                    {threadMessages.length - 1 === 1 ? "resposta" : "respostas"}
                    <span className="h-px flex-1 bg-black/20" />
                  </div>
                )}
              </div>
            ))}
            <div ref={threadBottomRef} />
          </div>
          <form onSubmit={sendThreadReply} className="px-3 pb-4">
            <input
              value={threadDraft}
              onChange={(e) => setThreadDraft(e.target.value)}
              placeholder="Responder na thread…"
              className="w-full rounded bg-rail px-3 py-2 text-sm outline-none"
            />
          </form>
        </aside>
      ) : (
        !voiceChannel &&
        activeChannel && (
          <MemberList
            members={members}
            currentUserId={user?.id}
            canModerate={canModerate}
            onKick={kickMember}
            onBan={banMember}
            onOpenDM={openDMWith}
          />
        )
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

      {/* modal de criação de grupo de DM */}
      {groupModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60"
          onClick={() => setGroupModal(false)}
        >
          <div
            className="w-[380px] rounded-lg bg-panel p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-bold text-white">Novo grupo</h2>
            <p className="mb-3 text-sm text-neutral-400">
              Escolha 2 ou mais contatos das suas conversas.
            </p>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Nome do grupo (opcional)"
              className="mb-3 w-full rounded bg-rail px-3 py-2 text-sm outline-none"
            />
            <div className="mb-4 max-h-56 overflow-y-auto rounded bg-rail/50">
              {dmContacts.length === 0 ? (
                <p className="px-3 py-3 text-sm text-neutral-500">
                  Você ainda não tem contatos. Abra uma DM 1-a-1 primeiro (💬 na
                  lista de membros).
                </p>
              ) : (
                dmContacts.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-black/20"
                  >
                    <input
                      type="checkbox"
                      checked={groupPicks.has(u.id)}
                      onChange={() => toggleGroupPick(u.id)}
                    />
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-rail text-[10px] font-bold text-neutral-200">
                      {u.username.slice(0, 2).toUpperCase()}
                    </span>
                    {u.username}
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={submitGroup}
                disabled={groupPicks.size < 2}
                className="flex-1 rounded bg-accent py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Criar grupo
              </button>
              <button
                onClick={() => setGroupModal(false)}
                className="rounded bg-rail px-4 py-2 text-sm text-neutral-300 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* modal de criação de canal */}
      {channelModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60"
          onClick={() => setChannelModal(false)}
        >
          <div
            className="w-[400px] rounded-lg bg-panel p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-bold text-white">Novo canal</h2>
            <input
              autoFocus
              value={chName}
              onChange={(e) => setChName(e.target.value)}
              placeholder="Nome do canal"
              className="mb-3 w-full rounded bg-rail px-3 py-2 text-sm outline-none"
            />
            <div className="mb-3 flex gap-2">
              {(["TEXT", "VOICE"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setChType(t)}
                  className={`flex-1 rounded py-2 text-sm ${
                    chType === t ? "bg-accent text-white" : "bg-rail text-neutral-300"
                  }`}
                >
                  {t === "TEXT" ? "# Texto" : "🔊 Voz"}
                </button>
              ))}
            </div>
            {canModerate && (
              <div className="mb-3 space-y-2 text-sm text-neutral-300">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chPrivate}
                    onChange={(e) => setChPrivate(e.target.checked)}
                  />
                  🔒 Privado (só a allowlist e moderadores)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chReadOnly}
                    onChange={(e) => setChReadOnly(e.target.checked)}
                  />
                  📢 Somente leitura (só moderadores postam)
                </label>
              </div>
            )}
            {chPrivate && (
              <div className="mb-4 max-h-40 overflow-y-auto rounded bg-rail/50">
                {members.filter((m) => m.role === "MEMBER").length === 0 ? (
                  <p className="px-3 py-2 text-xs text-neutral-500">
                    Sem membros comuns para liberar. Moderadores já têm acesso.
                  </p>
                ) : (
                  members
                    .filter((m) => m.role === "MEMBER")
                    .map((m) => (
                      <label
                        key={m.user.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-black/20"
                      >
                        <input
                          type="checkbox"
                          checked={chPicks.has(m.user.id)}
                          onChange={() =>
                            setChPicks((prev) => {
                              const next = new Set(prev);
                              next.has(m.user.id)
                                ? next.delete(m.user.id)
                                : next.add(m.user.id);
                              return next;
                            })
                          }
                        />
                        {m.user.username}
                      </label>
                    ))
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={submitChannel}
                disabled={!chName.trim()}
                className="flex-1 rounded bg-accent py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Criar canal
              </button>
              <button
                onClick={() => setChannelModal(false)}
                className="rounded bg-rail px-4 py-2 text-sm text-neutral-300 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* modal de gerenciar acesso de canal privado */}
      {accessModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60"
          onClick={() => setAccessModal(null)}
        >
          <div
            className="w-[380px] rounded-lg bg-panel p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-bold text-white">
              Acesso · 🔒 {accessModal.name}
            </h2>
            <p className="mb-3 text-sm text-neutral-400">
              Moderadores sempre têm acesso. Marque os membros liberados.
            </p>
            <div className="mb-4 max-h-56 overflow-y-auto rounded bg-rail/50">
              {members.filter((m) => m.role === "MEMBER").length === 0 ? (
                <p className="px-3 py-3 text-sm text-neutral-500">
                  Nenhum membro comum neste servidor.
                </p>
              ) : (
                members
                  .filter((m) => m.role === "MEMBER")
                  .map((m) => (
                    <label
                      key={m.user.id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-black/20"
                    >
                      <input
                        type="checkbox"
                        checked={accessAllowed.has(m.user.id)}
                        onChange={() => toggleAccess(m.user.id)}
                      />
                      {m.user.username}
                    </label>
                  ))
              )}
            </div>
            <button
              onClick={() => setAccessModal(null)}
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
