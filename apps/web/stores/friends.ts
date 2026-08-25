import { create } from "zustand";
import type {
  FriendLists,
  FriendRequest,
  PublicUser,
  RelationshipKind,
} from "@newdisc/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Amigos, pedidos e bloqueados — e qual aba da página Amigos está aberta.
 *
 * As quatro listas vêm de uma chamada só (`GET /friends`) e são mantidas ao
 * vivo pelos eventos `friend.*`. A store guarda o *conjunto* de relações porque
 * meia dúzia de telas (popover, perfil, lista de membros, timeline) precisam
 * responder "qual é a minha relação com este id?" sem ir ao servidor.
 *
 * `open` mora aqui, e não em `ui.ts`, para que a página Amigos seja uma decisão
 * do modo DM: a coluna 3 mostra a página quando ela está ligada e a conversa
 * quando não.
 */

export type FriendsTab = "online" | "todos" | "pendentes" | "bloqueados" | "adicionar";

interface FriendsState extends FriendLists {
  loading: boolean;
  loaded: boolean;
  /** página Amigos aberta na coluna 3 (a "home" do modo DM). */
  open: boolean;
  tab: FriendsTab;

  load: (force?: boolean) => Promise<void>;
  setOpen: (open: boolean) => void;
  setTab: (tab: FriendsTab) => void;

  send: (username: string) => Promise<boolean>;
  accept: (requestId: string) => Promise<void>;
  dismiss: (requestId: string) => Promise<void>;
  remove: (user: PublicUser) => Promise<void>;
  block: (user: PublicUser) => Promise<void>;
  unblock: (userId: string) => Promise<void>;

  // ── eventos do gateway ──
  handleRequest: (request: FriendRequest) => void;
  handleAccepted: (user: PublicUser) => void;
  handleRemoved: (userId: string) => void;
  clear: () => void;
}

const VAZIO: FriendLists = { friends: [], incoming: [], outgoing: [], blocked: [] };

/** Guarda de corrida do carregamento das listas. */
let seq = 0;

export const useFriends = create<FriendsState>((set, get) => {
  async function fetchLists() {
    const meu = ++seq;
    set({ loading: true });
    try {
      const lists = await api.friends();
      if (meu !== seq) return;
      set({ ...lists, loading: false, loaded: true });
    } catch (e) {
      if (meu !== seq) return;
      set({ loading: false });
      ui.toast(errorMessage(e, "Não foi possível carregar seus amigos"), "error");
    }
  }

  return {
    ...VAZIO,
    loading: false,
    loaded: false,
    open: false,
    tab: "online",

    load: async (force = false) => {
      if (get().loaded && !force) return;
      await fetchLists();
    },

    setOpen: (open) => {
      set({ open });
      // as listas envelhecem; abrir a página é o momento natural de revalidar
      if (open) void fetchLists();
    },
    setTab: (tab) => set({ tab }),

    send: async (username) => {
      const nome = username.trim().replace(/^@/, "");
      if (!nome) return false;
      try {
        const request = await api.requestFriend(nome);
        // pedido cruzado vira amizade na hora: o servidor devolve ACCEPTED e o
        // evento `friend.accepted` chega junto — recarregar evita divergência
        await fetchLists();
        ui.toast(`Pedido de amizade enviado para @${request.user.username}.`);
        return true;
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível enviar o pedido"), "error");
        return false;
      }
    },

    accept: async (requestId) => {
      const pedido = get().incoming.find((r) => r.id === requestId);
      if (!pedido) return;
      // otimista: o evento `friend.accepted` confirma logo em seguida
      set((s) => ({
        incoming: s.incoming.filter((r) => r.id !== requestId),
        friends: [...s.friends, pedido.user],
      }));
      try {
        await api.acceptFriend(requestId);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível aceitar o pedido"), "error");
        await fetchLists();
      }
    },

    dismiss: async (requestId) => {
      set((s) => ({
        incoming: s.incoming.filter((r) => r.id !== requestId),
        outgoing: s.outgoing.filter((r) => r.id !== requestId),
      }));
      try {
        await api.removeFriendRequest(requestId);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível recusar o pedido"), "error");
        await fetchLists();
      }
    },

    remove: async (user) => {
      const ok = await ui.confirm({
        title: `Remover ${user.username}`,
        message: `Tem certeza de que quer remover @${user.username} dos seus amigos?`,
        confirmLabel: "Remover amigo",
        danger: true,
      });
      if (!ok) return;
      set((s) => ({ friends: s.friends.filter((f) => f.id !== user.id) }));
      try {
        await api.removeFriend(user.id);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível remover o amigo"), "error");
        await fetchLists();
      }
    },

    block: async (user) => {
      const ok = await ui.confirm({
        title: `Bloquear ${user.username}`,
        message:
          "Vocês deixam de ser amigos e ele não poderá abrir conversa com você. As mensagens dele aparecem colapsadas.",
        confirmLabel: "Bloquear",
        danger: true,
      });
      if (!ok) return;
      try {
        const bloqueado = await api.blockUser(user.id);
        set((s) => ({
          friends: s.friends.filter((f) => f.id !== user.id),
          incoming: s.incoming.filter((r) => r.user.id !== user.id),
          outgoing: s.outgoing.filter((r) => r.user.id !== user.id),
          blocked: s.blocked.some((b) => b.id === user.id) ? s.blocked : [...s.blocked, bloqueado],
        }));
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível bloquear"), "error");
      }
    },

    unblock: async (userId) => {
      set((s) => ({ blocked: s.blocked.filter((b) => b.id !== userId) }));
      try {
        await api.unblockUser(userId);
      } catch (e) {
        ui.toast(errorMessage(e, "Não foi possível desbloquear"), "error");
        await fetchLists();
      }
    },

    handleRequest: (request) =>
      set((s) =>
        s.incoming.some((r) => r.id === request.id)
          ? s
          : { incoming: [request, ...s.incoming] },
      ),

    handleAccepted: (user) =>
      set((s) => ({
        friends: s.friends.some((f) => f.id === user.id) ? s.friends : [...s.friends, user],
        incoming: s.incoming.filter((r) => r.user.id !== user.id),
        outgoing: s.outgoing.filter((r) => r.user.id !== user.id),
      })),

    handleRemoved: (userId) =>
      set((s) => ({
        friends: s.friends.filter((f) => f.id !== userId),
        incoming: s.incoming.filter((r) => r.user.id !== userId),
        outgoing: s.outgoing.filter((r) => r.user.id !== userId),
      })),

    clear: () => {
      ++seq;
      set({ ...VAZIO, loading: false, loaded: false, open: false, tab: "online" });
    },
  };
});

/** Quantos pedidos recebidos estão à espera — o badge do item "Amigos". */
export function usePendingCount(): number {
  return useFriends((s) => s.incoming.length);
}

/**
 * Minha relação com alguém, deduzida das listas que já estão em memória. É a
 * mesma resposta do `GET /users/:id/profile`, sem ida ao servidor — o popover
 * e o menu de contexto precisam dela em cada abertura.
 */
export function useRelationship(userId: string | undefined, meId?: string): RelationshipKind {
  return useFriends((s) => relationshipFrom(s, userId, meId));
}

/**
 * Deduz a relação a partir das listas. Separada do hook por ser a única parte
 * testável — e porque a ordem importa: bloqueio vence amizade, e "eu mesmo"
 * vence tudo.
 */
export function relationshipFrom(
  lists: FriendLists,
  userId: string | undefined,
  meId?: string,
): RelationshipKind {
  if (!userId) return "none";
  if (userId === meId) return "self";
  if (lists.blocked.some((b) => b.id === userId)) return "blocked";
  if (lists.friends.some((f) => f.id === userId)) return "friend";
  if (lists.incoming.some((r) => r.user.id === userId)) return "incoming";
  if (lists.outgoing.some((r) => r.user.id === userId)) return "outgoing";
  return "none";
}

/** true se eu bloqueei este usuário (é o que colapsa as mensagens dele). */
export function useIsBlocked(userId: string | undefined): boolean {
  return useFriends((s) => !!userId && s.blocked.some((b) => b.id === userId));
}

/** Conjunto de ids bloqueados — para quem precisa filtrar uma lista inteira. */
export function useBlockedIds(): Set<string> {
  const blocked = useFriends((s) => s.blocked);
  return new Set(blocked.map((b) => b.id));
}
