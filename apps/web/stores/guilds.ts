import { create } from "zustand";
import type { GuildMemberView } from "@newdisc/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { useChannels } from "@/stores/channels";
import { usePresence } from "@/stores/presence";

/**
 * Servidores do usuário, servidor ativo e seus membros.
 *
 * Ao trocar de servidor esta store cuida da lista de membros e delega os canais
 * para `useChannels` — cada store faz o seu próprio fetch.
 */

/** O que o rail precisa saber de um servidor. */
export interface GuildSummary {
  id: string;
  name: string;
}

interface GuildsState {
  guilds: GuildSummary[];
  activeGuildId: string | null;
  members: GuildMemberView[];
  loading: boolean;
  membersLoading: boolean;

  load: () => Promise<void>;
  select: (guild: GuildSummary) => void;
  create: () => Promise<void>;
  joinByCode: () => Promise<void>;
  createInvite: () => Promise<void>;
  kick: (userId: string) => Promise<void>;
  ban: (userId: string) => Promise<void>;
  /** Fui expulso/banido: o servidor some da lista e a tela se limpa. */
  handleRemoved: (guildId: string) => void;
}

let membersSeq = 0;

export const useGuilds = create<GuildsState>((set, get) => {
  async function loadMembers(guildId: string) {
    const seq = ++membersSeq;
    set({ members: [], membersLoading: true });
    try {
      const members = (await api.members(guildId)) as GuildMemberView[];
      if (seq !== membersSeq) return; // trocaram de servidor no meio do fetch
      set({ members, membersLoading: false });
      usePresence.getState().seed(members.map((m) => m.user));
    } catch {
      if (seq !== membersSeq) return;
      set({ members: [], membersLoading: false });
    }
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
        const guilds = (await api.listGuilds()) as GuildSummary[];
        set({ guilds, loading: false });
        if (!get().activeGuildId && guilds[0]) get().select(guilds[0]);
      } catch (e) {
        set({ loading: false });
        ui.toast(errorMessage(e, "Não foi possível carregar seus servidores"), "error");
      }
    },

    select: (guild) => {
      ui.setView("guild");
      // voltar do modo DM para o servidor que já estava aberto não refaz fetch
      if (get().activeGuildId === guild.id) return;
      set({ activeGuildId: guild.id });
      void loadMembers(guild.id);
      void useChannels.getState().loadForGuild(guild.id);
    },

    create: async () => {
      const name = await ui.prompt({
        title: "Novo servidor",
        message: "Como o servidor vai se chamar?",
        placeholder: "Ex.: Time de produto",
        confirmLabel: "Criar",
      });
      if (!name?.trim()) return;
      try {
        const guild = (await api.createGuild(name.trim())) as GuildSummary;
        set((s) => ({ guilds: [...s.guilds, guild] }));
        get().select(guild);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível criar o servidor"), "error");
      }
    },

    joinByCode: async () => {
      const code = await ui.prompt({
        title: "Entrar com convite",
        message: "Cole o código que você recebeu.",
        placeholder: "Ex.: a1b2c3d4",
        confirmLabel: "Entrar",
      });
      if (!code?.trim()) return;
      try {
        const guild = await api.redeemInvite(code.trim());
        set((s) => ({
          guilds: s.guilds.some((g) => g.id === guild.id) ? s.guilds : [...s.guilds, guild],
        }));
        get().select(guild);
      } catch (e) {
        ui.toast(errorMessage(e, "Convite inválido"), "error");
      }
    },

    createInvite: async () => {
      const guildId = get().activeGuildId;
      if (!guildId) return;
      try {
        const invite = await api.createInvite(guildId);
        ui.openModal({ kind: "invite", code: invite.code });
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível criar o convite"), "error");
      }
    },

    kick: async (userId) => {
      const guildId = get().activeGuildId;
      if (!guildId) return;
      const ok = await ui.confirm({
        title: "Expulsar este membro?",
        message: "Ele pode voltar com um novo convite.",
        confirmLabel: "Expulsar",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.kickMember(guildId, userId);
        set((s) => ({ members: s.members.filter((m) => m.user.id !== userId) }));
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível expulsar"), "error");
      }
    },

    ban: async (userId) => {
      const guildId = get().activeGuildId;
      if (!guildId) return;
      const ok = await ui.confirm({
        title: "Banir este membro?",
        message: "Ele não poderá voltar, nem com convite.",
        confirmLabel: "Banir",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.banMember(guildId, userId);
        set((s) => ({ members: s.members.filter((m) => m.user.id !== userId) }));
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível banir"), "error");
      }
    },

    handleRemoved: (guildId) => {
      set((s) => ({ guilds: s.guilds.filter((g) => g.id !== guildId) }));
      if (get().activeGuildId !== guildId) return;
      ++membersSeq;
      set({ activeGuildId: null, members: [], membersLoading: false });
      useChannels.getState().clear();
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
