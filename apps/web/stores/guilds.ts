import { create } from "zustand";
import type { Guild, GuildMemberView, MemberRole } from "@newdisc/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { useChannels } from "@/stores/channels";
import { useMessages } from "@/stores/messages";
import { useModeration } from "@/stores/moderation";
import { usePresence } from "@/stores/presence";

/**
 * Servidores do usuário, servidor ativo e seus membros.
 *
 * Ao trocar de servidor esta store cuida da lista de membros e delega os canais
 * para `useChannels` — cada store faz o seu próprio fetch. O "não lido" e as
 * menções por servidor vêm da API na carga e são mantidos ao vivo por
 * `bumpUnread` (mensagem nova) e `clearUnread` (canal lido).
 */

interface GuildsState {
  guilds: Guild[];
  activeGuildId: string | null;
  members: GuildMemberView[];
  loading: boolean;
  membersLoading: boolean;

  load: () => Promise<void>;
  select: (guild: Pick<Guild, "id" | "name">) => void;
  create: () => Promise<void>;
  joinByCode: () => Promise<void>;
  createInvite: () => Promise<void>;
  leave: (guildId: string) => Promise<void>;
  remove: (guildId: string) => Promise<void>;
  setRole: (userId: string, role: "ADMIN" | "MEMBER") => Promise<void>;
  // h-moderacao: expulsar/banir/castigar abrem o modal com motivo; quem executa
  // é o modal, que sabe o motivo e (no banimento) a janela de limpeza
  kick: (userId: string) => void;
  ban: (userId: string) => void;
  timeout: (userId: string) => void;
  removeTimeout: (userId: string) => Promise<void>;

  /** Chegou mensagem num canal deste servidor que não está na tela. */
  bumpUnread: (guildId: string, mention: boolean) => void;
  /** Recalcula o resumo do servidor a partir dos canais carregados. */
  syncFromChannels: (guildId: string) => void;
  handleMemberUpdated: (
    guildId: string,
    userId: string,
    role: MemberRole,
    /** h-moderacao: ausente = o evento não falava de castigo. */
    timeoutUntil?: string | null,
  ) => void;
  handleMemberJoined: (guildId: string, member: GuildMemberView) => void;
  handleMemberLeft: (guildId: string, userId: string) => void;
  /** Fui expulso/banido, saí ou o servidor foi apagado: some da lista, a tela se limpa. */
  handleRemoved: (guildId: string) => void;
}

let membersSeq = 0;

export const useGuilds = create<GuildsState>((set, get) => {
  async function loadMembers(guildId: string) {
    const seq = ++membersSeq;
    set({ members: [], membersLoading: true });
    try {
      const members = await api.members(guildId);
      if (seq !== membersSeq) return; // trocaram de servidor no meio do fetch
      set({ members, membersLoading: false });
      usePresence.getState().seed(members.map((m) => m.user));
    } catch {
      if (seq !== membersSeq) return;
      set({ members: [], membersLoading: false });
    }
  }

  function patchGuild(guildId: string, fn: (g: Guild) => Guild) {
    set((s) => ({ guilds: s.guilds.map((g) => (g.id === guildId ? fn(g) : g)) }));
  }

  return {
    guilds: [],
    activeGuildId: null,
    members: [],
    loading: false,
    membersLoading: false,

    load: async () => {
      set({ loading: true });
      try {
        const guilds = await api.listGuilds();
        set({ guilds, loading: false });
        if (!get().activeGuildId && guilds[0]) get().select(guilds[0]);
      } catch (e) {
        set({ loading: false });
        ui.toast(errorMessage(e, "Não foi possível carregar seus servidores"), "error");
      }
    },

    select: (guild) => {
      ui.setView("guild");
      // voltar do modo DM para o servidor que já estava aberto não refaz fetch —
      // só devolve a timeline ao canal que estava na tela (a DM ocupava o lugar)
      if (get().activeGuildId === guild.id) {
        const channelId = useChannels.getState().activeChannelId;
        if (channelId) void useMessages.getState().open(channelId);
        return;
      }
      set({ activeGuildId: guild.id });
      void loadMembers(guild.id);
      void useChannels.getState().loadForGuild(guild.id);
      // h-moderacao: castigo, regras e boas-vindas são por servidor
      void useModeration.getState().loadMembership(guild.id);
    },

    create: async () => {
      const name = await ui.prompt({
        title: "Criar um servidor",
        message: "Dê um nome ao seu servidor. Você pode mudar depois.",
        placeholder: "Ex.: Time de produto",
        confirmLabel: "Criar",
      });
      if (!name?.trim()) return;
      try {
        const guild = await api.createGuild(name.trim());
        set((s) => ({ guilds: [...s.guilds, guild] }));
        get().select(guild);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível criar o servidor"), "error");
      }
    },

    joinByCode: async () => {
      const code = await ui.prompt({
        title: "Entrar em um servidor",
        message: "Cole o código do convite que você recebeu.",
        placeholder: "Ex.: a1b2c3d4",
        confirmLabel: "Entrar",
      });
      if (!code?.trim()) return;
      try {
        const guild = await api.redeemInvite(code.trim());
        // a lista completa traz não-lido e menções; entrar é raro, vale refazer
        const guilds = await api.listGuilds();
        set({ guilds });
        get().select(guild);
      } catch (e) {
        ui.toast(errorMessage(e, "Convite inválido"), "error");
      }
    },

    // h-moderacao: o modal "Convidar amigos" cria o convite e mostra as opções
    createInvite: async () => {
      const guildId = get().activeGuildId;
      if (!guildId) return;
      ui.openModal({ kind: "invite", guildId });
    },

    leave: async (guildId) => {
      const guild = get().guilds.find((g) => g.id === guildId);
      const ok = await ui.confirm({
        title: `Sair de ${guild?.name ?? "servidor"}`,
        message: "Tem certeza? Você não vai conseguir voltar sem um novo convite.",
        confirmLabel: "Sair do servidor",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.leaveGuild(guildId);
        get().handleRemoved(guildId);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível sair"), "error");
      }
    },

    remove: async (guildId) => {
      const guild = get().guilds.find((g) => g.id === guildId);
      const ok = await ui.confirm({
        title: `Apagar ${guild?.name ?? "servidor"}`,
        message: "Isso apaga todos os canais e mensagens. Não dá para desfazer.",
        confirmLabel: "Apagar servidor",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteGuild(guildId);
        get().handleRemoved(guildId);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível apagar"), "error");
      }
    },

    setRole: async (userId, role) => {
      const guildId = get().activeGuildId;
      if (!guildId) return;
      try {
        await api.setRole(guildId, userId, role);
        get().handleMemberUpdated(guildId, userId, role);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível alterar o papel"), "error");
      }
    },

    kick: (userId) => {
      const guildId = get().activeGuildId;
      const user = get().members.find((m) => m.user.id === userId)?.user;
      if (guildId && user) ui.openModal({ kind: "kick", guildId, user });
    },

    ban: (userId) => {
      const guildId = get().activeGuildId;
      const user = get().members.find((m) => m.user.id === userId)?.user;
      if (guildId && user) ui.openModal({ kind: "ban", guildId, user });
    },

    timeout: (userId) => {
      const guildId = get().activeGuildId;
      const user = get().members.find((m) => m.user.id === userId)?.user;
      if (guildId && user) ui.openModal({ kind: "timeout", guildId, user });
    },

    removeTimeout: async (userId) => {
      const guildId = get().activeGuildId;
      if (!guildId) return;
      try {
        await api.removeTimeout(guildId, userId);
        ui.toast("Castigo removido.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível remover o castigo"), "error");
      }
    },

    bumpUnread: (guildId, mention) =>
      patchGuild(guildId, (g) => ({
        ...g,
        unread: true,
        mentionCount: g.mentionCount + (mention ? 1 : 0),
      })),

    syncFromChannels: (guildId) => {
      const channels = useChannels.getState().channels;
      if (useChannels.getState().guildId !== guildId) return;
      const unread = channels.some(
        (c) => c.lastMessageAt && (!c.lastReadAt || c.lastMessageAt > c.lastReadAt),
      );
      const mentionCount = channels.reduce((n, c) => n + c.mentionCount, 0);
      patchGuild(guildId, (g) => ({ ...g, unread, mentionCount }));
    },

    handleMemberUpdated: (guildId, userId, role, timeoutUntil) => {
      if (get().activeGuildId !== guildId) return;
      set((s) => ({
        members: s.members.map((m) =>
          m.user.id === userId
            ? { ...m, role, ...(timeoutUntil !== undefined ? { timeoutUntil } : {}) }
            : m,
        ),
      }));
    },

    handleMemberJoined: (guildId, member) => {
      if (get().activeGuildId !== guildId) return;
      set((s) =>
        s.members.some((m) => m.user.id === member.user.id)
          ? s
          : { members: [...s.members, member] },
      );
      usePresence.getState().seed([member.user]);
    },

    handleMemberLeft: (guildId, userId) => {
      if (get().activeGuildId !== guildId) return;
      set((s) => ({ members: s.members.filter((m) => m.user.id !== userId) }));
    },

    handleRemoved: (guildId) => {
      set((s) => ({ guilds: s.guilds.filter((g) => g.id !== guildId) }));
      if (get().activeGuildId !== guildId) return;
      ++membersSeq;
      set({ activeGuildId: null, members: [], membersLoading: false });
      useChannels.getState().clear();
      const next = get().guilds[0];
      if (next) get().select(next);
    },
  };
});

/** Sou OWNER/ADMIN no servidor ativo? Decide o que a UI de moderação mostra. */
export function useCanModerate(userId?: string): boolean {
  return useGuilds((s) =>
    s.members.some(
      (m) => m.user.id === userId && (m.role === "OWNER" || m.role === "ADMIN"),
    ),
  );
}

/** Sou o dono do servidor ativo? */
export function useIsOwner(userId?: string): boolean {
  return useGuilds((s) => {
    const g = s.guilds.find((x) => x.id === s.activeGuildId);
    return !!g && g.ownerId === userId;
  });
}
