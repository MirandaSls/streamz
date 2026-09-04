import { create } from "zustand";
import {
  displayNameOf,
  isDirectChannel,
  isGroupChannel,
  type DMChannelView,
  type PublicUser,
} from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";
import { useChannels } from "@/stores/channels";
import { useFriends } from "@/stores/friends";
import { useMessages } from "@/stores/messages";
import { aoChegarMensagem } from "@/stores/nao-lidas";
import { comAConversaAberta, noTopo } from "@/stores/dms-lista";
import { conversaLida, listaLida } from "@/stores/leitura";

/**
 * Conversas diretas: a lista e qual está aberta.
 *
 * Desde a ADR-0001 uma conversa é um canal como outro qualquer — histórico,
 * envio, reação, anexo e thread vivem em `useMessages`, e a entrega ao vivo vem
 * pela sala `channel:<id>` (o gateway põe o socket nas salas de todas as
 * conversas no connect). Esta store só sabe *quais* conversas existem, qual
 * está na tela e o "não lido" de cada uma.
 */

interface DMsState {
  channels: DMChannelView[];
  activeId: string | null;
  loadingList: boolean;

  /** Entra no modo DM e (re)carrega a lista. */
  openList: () => Promise<void>;
  /** Recarrega a lista sem mudar de modo (ex.: chegou mensagem de conversa nova). */
  refreshList: () => Promise<void>;
  select: (dm: DMChannelView) => void;
  openWith: (userId: string) => Promise<void>;
  /**
   * Abre a conversa pelo **id do canal** — o rail, um link para a mensagem, a
   * caixa de entrada e uma chamada recebida só sabem o id. Busca no servidor
   * quando ela não está na lista (fechada, ou aberta pelo outro lado). `false`
   * = não participo mais dela.
   */
  abrirPorId: (channelId: string) => Promise<boolean>;
  /**
   * Garante a conversa 1-a-1 com `userId` **na lista**, em primeiro, sem
   * abrir — é o que acontece quando uma amizade nasce, como no Discord.
   */
  garantirNaLista: (userId: string) => Promise<void>;
  /** Põe na lista, em primeiro, uma conversa que o chamador já tem em mãos. */
  registrar: (dm: DMChannelView) => void;
  createGroup: (userIds: string[], name?: string) => Promise<boolean>;
  leaveGroup: (channelId: string) => Promise<void>;
  // ── d-social ──
  /** Fecha a conversa: some da lista até chegar mensagem nova. */
  hide: (channelId: string) => Promise<void>;
  addMember: (channelId: string, userId: string) => Promise<boolean>;
  removeMember: (channelId: string, user: PublicUser) => Promise<void>;
  rename: (channelId: string, name: string | null) => Promise<boolean>;
  updateIcon: (channelId: string, file: File) => Promise<void>;
  /** Aplica a conversa atualizada que chegou por `channel.updated`. */
  handleUpdated: (dm: DMChannelView) => void;
  markRead: (channelId: string) => Promise<void>;
  /**
   * `channel.read`: li estas conversas em **outra** conexão da minha conta —
   * badge e contador zeram aqui sem ida à API. Idempotente (`stores/leitura`).
   */
  aplicarLeitura: (channelIds: readonly string[], lastReadAt: string) => void;
  /**
   * Chegou mensagem na conversa: sobe para o topo e, se é de outro, conta
   * como não lida (e como menção, quando é). `propria` = eu mandei.
   */
  bumpUnread: (channelId: string, at: string, mention: boolean, propria: boolean) => void;
  handleDeleted: (channelId: string) => void;
  clear: () => void;
}

/** Guarda de corrida da lista. */
let listSeq = 0;

export const useDMs = create<DMsState>((set, get) => {
  async function fetchList(): Promise<DMChannelView[] | null> {
    const seq = ++listSeq;
    set({ loadingList: true });
    try {
      const doServidor = await api.listDMs();
      if (seq !== listSeq) return null;
      // a conversa aberta nunca sai da coluna, mesmo que esta resposta tenha
      // sido montada antes de ela existir (ver `comAConversaAberta`)
      const channels = comAConversaAberta(doServidor, get().activeId, get().channels);
      set({ channels, loadingList: false });
      return channels;
    } catch (e) {
      if (seq !== listSeq) return null;
      set({ loadingList: false });
      ui.toast(errorMessage(e, "Não foi possível carregar suas conversas"), "error");
      return null;
    }
  }

  function patchDM(channelId: string, fn: (d: DMChannelView) => DMChannelView) {
    set((s) => ({ channels: s.channels.map((d) => (d.id === channelId ? fn(d) : d)) }));
  }

  /**
   * Mostra a conversa na área principal e abre o canal dela.
   *
   * **Aberta = na lista**, como no Discord: quem chega aqui entra na coluna se
   * ainda não estiver nela, e o servidor desfaz o "fechar conversa"
   * (`POST /dms/:id/show`) — sem isso a conversa aparecia na tela mas o
   * servidor continuava escondendo-a, e o próximo `GET /dms` a tirava da
   * coluna. `jaReaberta` é para quem já veio de uma rota que reabre
   * (`POST /dms`): não vale gastar outra requisição.
   */
  function show(dm: DMChannelView, opcoes: { jaReaberta?: boolean } = {}) {
    ui.setView("dm");
    // a página Amigos e a conversa disputam a coluna 3 — abrir uma fecha a outra
    useFriends.getState().setOpen(false);
    // sai da call de voz: a área principal passa a ser a conversa
    useChannels.getState().leaveVoice();
    const foraDaLista = !get().channels.some((d) => d.id === dm.id);
    set((s) => ({
      channels: foraDaLista ? noTopo(s.channels, dm) : s.channels,
      activeId: dm.id,
    }));
    if (foraDaLista && !opcoes.jaReaberta) {
      // a lista do servidor é a verdade da coluna: reabrir lá é o que faz a
      // conversa continuar aparecendo depois do próximo recarregamento
      void api.showDM(dm.id).catch(() => undefined);
    }
    // sticky: a sala de uma conversa nunca é abandonada ao trocar de canal —
    // é assim que a DM continua chegando enquanto se navega pelo servidor
    void useMessages.getState().open(dm.id, { sticky: true });
    void get().markRead(dm.id);
  }

  return {
    channels: [],
    activeId: null,
    loadingList: false,

    openList: async () => {
      ui.setView("dm");
      useChannels.getState().leaveVoice();
      const active = get().activeId;
      // voltar para a conversa que já estava aberta não refaz o histórico
      if (active) void useMessages.getState().open(active, { sticky: true });
      await fetchList();
      // sem conversa aberta, a home do modo DM é a página Amigos (como o Discord)
      if (!get().activeId) useFriends.getState().setOpen(true);
    },

    refreshList: async () => {
      await fetchList();
    },

    select: (dm) => show(dm),

    openWith: async (userId) => {
      try {
        // `POST /dms` já reabre a conversa do meu lado
        show(await api.openDM(userId), { jaReaberta: true });
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível abrir a conversa"), "error");
      }
    },

    abrirPorId: async (channelId) => {
      const naLista = get().channels.find((d) => d.id === channelId);
      if (naLista) {
        show(naLista);
        return true;
      }
      try {
        // `GET /dms/:id` responde mesmo com a conversa fechada; é `show` quem a
        // devolve para a coluna e para a lista do servidor
        show(await api.getDM(channelId));
        return true;
      } catch {
        return false;
      }
    },

    garantirNaLista: async (userId) => {
      try {
        get().registrar(await api.openDM(userId));
      } catch {
        // a lista recarregada no próximo `openList` traz a conversa
      }
    },

    registrar: (dm) => set((s) => ({ channels: noTopo(s.channels, dm) })),

    createGroup: async (userIds, name) => {
      if (userIds.length < 2) return false;
      try {
        const dm = await api.createGroupDM(userIds, name);
        show(dm, { jaReaberta: true });
        return true;
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível criar o grupo"), "error");
        return false;
      }
    },

    leaveGroup: async (channelId) => {
      const ok = await ui.confirm({
        title: "Sair do grupo?",
        message: "Você deixa de ver as mensagens dele. Se for o último, o grupo é apagado.",
        confirmLabel: "Sair",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.leaveGroupDM(channelId);
        get().handleDeleted(channelId);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível sair do grupo"), "error");
      }
    },

    // ── d-social ──

    hide: async (channelId) => {
      // otimista: some da lista já; o servidor só registra o instante
      get().handleDeleted(channelId);
      try {
        await api.hideDM(channelId);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível fechar a conversa"), "error");
        void get().refreshList();
      }
    },

    addMember: async (channelId, userId) => {
      try {
        get().handleUpdated(await api.addGroupMember(channelId, userId));
        return true;
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível adicionar ao grupo"), "error");
        return false;
      }
    },

    removeMember: async (channelId, user) => {
      const ok = await ui.confirm({
        title: `Remover ${displayNameOf(user)}`,
        message: "A pessoa deixa de ver as mensagens do grupo.",
        confirmLabel: "Remover",
        danger: true,
      });
      if (!ok) return;
      try {
        get().handleUpdated(await api.removeGroupMember(channelId, user.id));
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível remover do grupo"), "error");
      }
    },

    rename: async (channelId, name) => {
      try {
        get().handleUpdated(await api.renameGroupDM(channelId, name));
        return true;
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível renomear o grupo"), "error");
        return false;
      }
    },

    updateIcon: async (channelId, file) => {
      try {
        get().handleUpdated(await api.updateGroupIcon(channelId, file));
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível trocar o ícone"), "error");
      }
    },

    handleUpdated: (dm) =>
      set((s) => ({
        channels: s.channels.some((d) => d.id === dm.id)
          ? s.channels.map((d) =>
              d.id === dm.id
                ? {
                    ...d,
                    ...dm,
                    // a conversa atualizada (evento ou resposta de rename/membro)
                    // vem sem a visão de leitura; a local é a boa
                    lastMessageAt: d.lastMessageAt,
                    lastReadAt: d.lastReadAt,
                    mentionCount: d.mentionCount,
                    unreadCount: d.unreadCount,
                  }
                : d,
            )
          : [dm, ...s.channels],
      })),

    markRead: async (channelId) => {
      const d = get().channels.find((x) => x.id === channelId);
      if (!d) return;
      const jaLido = d.lastReadAt && d.lastMessageAt && d.lastReadAt >= d.lastMessageAt;
      if (jaLido && d.mentionCount === 0 && d.unreadCount === 0) return;
      const now = new Date().toISOString();
      patchDM(channelId, (x) => ({ ...x, lastReadAt: now, mentionCount: 0, unreadCount: 0 }));
      try {
        await api.markRead(channelId);
      } catch {
        // o próximo reload da lista traz o valor do servidor
      }
    },

    aplicarLeitura: (channelIds, lastReadAt) =>
      set((s) => {
        const channels = listaLida(s.channels, channelIds, (d) => conversaLida(d, lastReadAt));
        return channels === s.channels ? s : { channels };
      }),

    bumpUnread: (channelId, at, mention, propria) =>
      set((s) => {
        const d = s.channels.find((x) => x.id === channelId);
        if (!d) return s;
        const next = aoChegarMensagem(d, at, { mention, propria });
        // conversa com mensagem nova sobe para o topo, como no Discord
        return { channels: noTopo(s.channels, next) };
      }),

    handleDeleted: (channelId) => {
      set((s) => ({
        channels: s.channels.filter((d) => d.id !== channelId),
        activeId: s.activeId === channelId ? null : s.activeId,
      }));
      if (useMessages.getState().activeChannelId === channelId) {
        useMessages.getState().closeChannel();
      }
    },

    clear: () => {
      ++listSeq;
      set({ channels: [], activeId: null, loadingList: false });
    },
  };
});

/** Conversa aberta (objeto completo), ou null. */
export function useActiveDM(): DMChannelView | null {
  return useDMs((s) => s.channels.find((d) => d.id === s.activeId) ?? null);
}

/** Nome de exibição de uma conversa (grupo tem nome; 1-a-1 usa o outro). */
export function dmTitle(dm: DMChannelView): string {
  if (isGroupChannel(dm)) {
    return dm.name || dm.others.map(displayNameOf).join(", ") || "Grupo";
  }
  return dm.others[0] ? displayNameOf(dm.others[0]) : "Conversa";
}

/**
 * Contatos já conhecidos (com quem existe DM 1-a-1) — sugestão inicial do
 * grupo; a busca por nome (`api.searchUsers`) completa o resto.
 */
export function contactsFromDMs(channels: DMChannelView[]): PublicUser[] {
  const byId = new Map<string, PublicUser>();
  for (const dm of channels) {
    if (!isDirectChannel(dm) || isGroupChannel(dm)) continue;
    for (const user of dm.others) byId.set(user.id, user);
  }
  return Array.from(byId.values());
}
