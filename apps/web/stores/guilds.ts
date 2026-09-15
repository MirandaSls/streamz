import { create } from "zustand";
import { Permission, hasPermission } from "@streamz/shared";
import type { Guild, GuildMemberView, MemberRole } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { useChannels } from "@/stores/channels";
import { useComandosDeApp } from "@/stores/comandos-de-app";
import { useMessages } from "@/stores/messages";
import { useModeration } from "@/stores/moderation";
import { usePermissions } from "@/stores/permissions";
import { usePresence } from "@/stores/presence";
import { comServidorNovo } from "@/stores/guilds-entrada";

/**
 * Servidores do usuário, servidor ativo e seus membros.
 *
 * Ao trocar de servidor esta store cuida da lista de membros e delega os canais
 * para `useChannels` — cada store faz o seu próprio fetch. O "não lido" e as
 * menções por servidor vêm da API na carga e são mantidos ao vivo por
 * `bumpUnread` (mensagem nova), `syncFromChannels` (recontagem a partir dos
 * canais carregados) e `clearUnread` (servidor lido).
 */

interface GuildsState {
  guilds: Guild[];
  activeGuildId: string | null;
  members: GuildMemberView[];
  loading: boolean;
  membersLoading: boolean;
  /** `loadMembers` engoliu uma falha: a aba Membros mostra "Tentar de novo" em vez da lista. */
  membersError: boolean;

  load: () => Promise<void>;
  /** `manterVisao` pré-carrega o servidor sem tirar o usuário da tela atual. */
  select: (guild: Pick<Guild, "id" | "name">, opcoes?: { manterVisao?: boolean }) => void;
  /** Refaz a carga de membros do servidor ativo (botão "Tentar de novo"). */
  recarregarMembros: (guildId: string) => Promise<void>;
  /** Resgata um convite pelo código e abre o servidor (cartão de convite e menu). */
  entrarPorConvite: (code: string) => Promise<void>;
  createInvite: () => Promise<void>;
  leave: (guildId: string) => Promise<void>;
  remove: (guildId: string) => Promise<void>;
  setRole: (userId: string, role: "ADMIN" | "MEMBER") => Promise<void>;
  // h-moderacao: expulsar/banir/castigar abrem o modal com motivo; quem executa
  // é o modal, que sabe o motivo e (no banimento) a janela de limpeza
  kick: (userId: string) => void;
  ban: (userId: string) => void;
  timeout: (userId: string) => void;
  /** Castigo com duração já escolhida (submenu do menu de membro). */
  applyTimeout: (userId: string, minutes: number) => Promise<void>;
  removeTimeout: (userId: string) => Promise<void>;
  /** Atribui ou remove um cargo ao membro (c-cargos). */
  toggleRole: (userId: string, roleId: string, atribuir: boolean) => Promise<void>;
  /** Transfere a posse do servidor ativo (confirmação digitando o nome). */
  transfer: (userId: string) => Promise<void>;

  /** Chegou mensagem num canal deste servidor que não está na tela. */
  bumpUnread: (guildId: string, mention: boolean) => void;
  /** Recalcula o resumo do servidor a partir dos canais carregados. */
  syncFromChannels: (guildId: string) => void;
  /**
   * O servidor inteiro foi lido (em qualquer conexão da conta): o rail apaga o
   * ponto e o badge. Vale mesmo com os canais dele fora da memória — é o caso
   * de "marcar como lido" num servidor que não está aberto.
   */
  clearUnread: (guildId: string) => void;
  handleMemberUpdated: (
    guildId: string,
    userId: string,
    role: MemberRole,
    roleIds?: string[],
    /** h-moderacao: ausente = o evento não falava de castigo. */
    timeoutUntil?: string | null,
  ) => void;
  /** Nome, ícone ou descrição do servidor mudaram (`guild.updated`). */
  handleGuildUpdated: (guild: Guild) => void;
  /** A posse passou para outra pessoa (`guild.ownerChanged`). */
  handleOwnerChanged: (guildId: string, ownerId: string) => void;
  handleMemberJoined: (guildId: string, member: GuildMemberView) => void;
  handleMemberLeft: (guildId: string, userId: string) => void;
  /** Fui expulso/banido, saí ou o servidor foi apagado: some da lista, a tela se limpa. */
  handleRemoved: (guildId: string) => void;
  /**
   * Entrei num servidor de **outro lugar** (`guild.joined`): outra aba, o site
   * enquanto o desktop está aberto, ou esta mesma sessão recebendo o próprio
   * evento de volta. Só põe no rail — não troca a tela de quem está lendo
   * outra coisa.
   */
  handleJoined: (guild: Guild) => void;
}

let membersSeq = 0;

export const useGuilds = create<GuildsState>((set, get) => {
  async function loadMembers(guildId: string) {
    const seq = ++membersSeq;
    set({ members: [], membersLoading: true, membersError: false });
    try {
      const members = await api.members(guildId);
      if (seq !== membersSeq) return; // trocaram de servidor no meio do fetch
      set({ members, membersLoading: false, membersError: false });
      usePresence.getState().seed(members.map((m) => m.user));
    } catch {
      if (seq !== membersSeq) return;
      // marca o erro em vez de deixar `members: []` se passar por "sem gente"
      // — é o que dá ao `MembrosTab` o que mostrar em vez do vazio
      set({ members: [], membersLoading: false, membersError: true });
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
    membersError: false,

    load: async () => {
      set({ loading: true });
      try {
        const guilds = await api.listGuilds();
        set({ guilds, loading: false });
        // pré-carrega o primeiro servidor SEM trocar a visão: o app abre na
        // página Amigos, e `select` levaria para o modo servidor
        if (!get().activeGuildId && guilds[0]) get().select(guilds[0], { manterVisao: true });
      } catch (e) {
        set({ loading: false });
        ui.toast(errorMessage(e, "Não foi possível carregar seus servidores"), "error");
      }
    },

    select: (guild, opcoes) => {
      if (!opcoes?.manterVisao) ui.setView("guild");
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
      // cargos e regras de canal: é deles que sai o que a tela deixa fazer
      void usePermissions.getState().load(guild.id);
      // h-moderacao: castigo, regras e boas-vindas são por servidor
      void useModeration.getState().loadMembership(guild.id);
      // j-bots: os comandos de barra dos bots também são por servidor
      void useComandosDeApp.getState().loadForGuild(guild.id);
    },

    recarregarMembros: async (guildId) => {
      await loadMembers(guildId);
    },

    entrarPorConvite: async (code) => {
      try {
        const guild = await api.redeemInvite(code);
        // a lista completa traz não-lido e menções; entrar é raro, vale refazer.
        // O `guild.joined` que a API manda para todas as minhas conexões chega
        // aqui também e é idempotente — quem chegar primeiro resolve.
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
      // digitar o nome é a trava do Discord para uma ação sem volta
      const nome = await ui.prompt({
        title: `Apagar ${guild?.name ?? "servidor"}`,
        message: "Isso apaga todos os canais e mensagens, e não dá para desfazer.",
        label: "DIGITE O NOME DO SERVIDOR",
        placeholder: guild?.name,
        confirmLabel: "Apagar servidor",
        danger: true,
      });
      const ok = !!nome && nome.trim() === guild?.name;
      if (nome !== null && !ok) ui.toast("O nome não confere — nada foi apagado.", "error");
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

    // o submenu de castigo do menu de membro aplica a duração direto, sem
    // passar pelo modal — é o caminho do Discord para as durações prontas
    applyTimeout: async (userId, minutes) => {
      const guildId = get().activeGuildId;
      if (!guildId) return;
      try {
        await api.timeoutMember(guildId, userId, { minutes });
        ui.toast("Membro colocado em modo de espera.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível aplicar o castigo"), "error");
      }
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

    toggleRole: async (userId, roleId, atribuir) => {
      const guildId = get().activeGuildId;
      if (!guildId) return;
      try {
        const r = atribuir
          ? await api.assignRole(guildId, userId, roleId)
          : await api.unassignRole(guildId, userId, roleId);
        set((s) => ({
          members: s.members.map((m) =>
            m.user.id === userId ? { ...m, roleIds: r.roleIds } : m,
          ),
        }));
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível mudar os cargos"), "error");
      }
    },

    transfer: async (userId) => {
      const guildId = get().activeGuildId;
      const guild = get().guilds.find((g) => g.id === guildId);
      if (!guildId || !guild) return;
      const alvo = get().members.find((m) => m.user.id === userId);
      const quem = alvo ? alvo.user.displayName || alvo.user.username : "Este membro";
      // como no Discord: passar a posse não tem volta, então pede o nome
      const nome = await ui.prompt({
        title: "Transferir a posse do servidor",
        message: `${quem} passa a ser o dono de ${guild.name} e você vira administrador. Digite ${guild.name} para confirmar.`,
        placeholder: guild.name,
        confirmLabel: "Transferir posse",
      });
      if (nome === null) return;
      if (nome.trim() !== guild.name) {
        ui.toast("O nome não confere — a posse não mudou.", "error");
        return;
      }
      try {
        await api.transferGuild(guildId, userId);
        ui.toast("Posse transferida.");
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível transferir a posse"), "error");
      }
    },

    bumpUnread: (guildId, mention) =>
      patchGuild(guildId, (g) => ({
        ...g,
        unread: true,
        mentionCount: g.mentionCount + (mention ? 1 : 0),
      })),

    clearUnread: (guildId) =>
      patchGuild(guildId, (g) =>
        !g.unread && g.mentionCount === 0 ? g : { ...g, unread: false, mentionCount: 0 },
      ),

    syncFromChannels: (guildId) => {
      const channels = useChannels.getState().channels;
      if (useChannels.getState().guildId !== guildId) return;
      const unread = channels.some(
        (c) => c.lastMessageAt && (!c.lastReadAt || c.lastMessageAt > c.lastReadAt),
      );
      const mentionCount = channels.reduce((n, c) => n + c.mentionCount, 0);
      patchGuild(guildId, (g) => ({ ...g, unread, mentionCount }));
    },

    handleMemberUpdated: (guildId, userId, role, roleIds, timeoutUntil) => {
      if (get().activeGuildId !== guildId) return;
      set((s) => ({
        members: s.members.map((m) =>
          m.user.id === userId
            ? {
                ...m,
                role,
                roleIds: roleIds ?? m.roleIds,
                ...(timeoutUntil !== undefined ? { timeoutUntil } : {}),
              }
            : m,
        ),
      }));
    },

    handleGuildUpdated: (guild) => {
      // o evento não carrega não-lido/menções (são por espectador): preserva
      patchGuild(guild.id, (g) => ({
        ...g,
        name: guild.name,
        iconUrl: guild.iconUrl,
        description: guild.description,
      }));
    },

    handleOwnerChanged: (guildId, ownerId) => {
      patchGuild(guildId, (g) => ({ ...g, ownerId }));
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

    handleJoined: (guild) => {
      set((s) => ({ guilds: comServidorNovo(s.guilds, guild) }));
    },

    handleRemoved: (guildId) => {
      set((s) => ({ guilds: s.guilds.filter((g) => g.id !== guildId) }));
      if (get().activeGuildId !== guildId) return;
      ++membersSeq;
      set({ activeGuildId: null, members: [], membersLoading: false, membersError: false });
      useChannels.getState().clear();
      usePermissions.getState().clear();
      const next = get().guilds[0];
      if (next) get().select(next);
    },
  };
});

/**
 * Tenho alguma permissão de gestão no servidor ativo?
 *
 * Continua existindo para as telas que ainda raciocinam em bloco (mostrar ou
 * não o menu de gestão). Para esconder **uma** ação, prefira
 * `useCan(Permission.X)` de `stores/permissions`: é a mesma conta da API.
 */
export function useCanModerate(userId?: string): boolean {
  const roles = usePermissions((s) => s.roles);
  return useGuilds((s) => {
    const guild = s.guilds.find((g) => g.id === s.activeGuildId);
    if (!userId || !guild) return false;
    if (guild.ownerId === userId) return true;
    const roleIds = s.members.find((m) => m.user.id === userId)?.roleIds ?? [];
    const bits = roles
      .filter((r) => r.isDefault || roleIds.includes(r.id))
      .reduce((acc, r) => acc | r.permissions, 0);
    return GESTAO.some((p) => hasPermission(bits, p));
  });
}

/** As permissões que fazem aparecer o menu de gestão do servidor. */
const GESTAO = [
  Permission.ADMINISTRATOR,
  Permission.MANAGE_GUILD,
  Permission.MANAGE_CHANNELS,
  Permission.MANAGE_ROLES,
  Permission.KICK_MEMBERS,
  Permission.BAN_MEMBERS,
];

/** Sou o dono do servidor ativo? */
export function useIsOwner(userId?: string): boolean {
  return useGuilds((s) => {
    const g = s.guilds.find((x) => x.id === s.activeGuildId);
    return !!g && g.ownerId === userId;
  });
}
