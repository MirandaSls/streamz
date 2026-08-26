import { create } from "zustand";
import type { PublicUser } from "@streamz/shared";
// ── h-moderacao ──
import type { ServerSettingsTab } from "@/components/settings/server/tabs";

/**
 * Estado de interface que não pertence a nenhum domínio: qual coluna está em
 * foco, qual modal está aberto, menus de contexto, popovers e os avisos.
 *
 * `confirm`/`prompt` devolvem Promise para substituir os equivalentes globais do
 * browser sem virar o código do avesso: o call site continua linear
 * (`if (!(await ui.confirm(...))) return;`), mas quem desenha é um diálogo
 * acessível nosso.
 */

export type ToastKind = "info" | "error";
export interface Toast {
  id: string;
  kind: ToastKind;
  text: string;
}

export type Modal =
  | { kind: "createChannel"; categoryId?: string | null }
  | { kind: "channelAccess"; channelId: string }
  | { kind: "invite"; guildId: string; code?: string }
  | { kind: "createGroupDM" }
  | { kind: "settings"; tab?: string }
  | { kind: "invites"; guildId: string }
  | { kind: "image"; url: string; alt: string }
  // ── g-emojis-midia ──
  /** galeria de imagens do canal, navegável com ← →. */
  | { kind: "galeria"; urls: string[]; alts: string[]; indice: number }
  /** gerência de emojis e figurinhas de um servidor. */
  | { kind: "guildEmojis"; guildId: string }
  | {
      kind: "confirm";
      title: string;
      message?: string;
      confirmLabel: string;
      danger: boolean;
      resolve: (ok: boolean) => void;
    }
  | {
      kind: "prompt";
      title: string;
      message?: string;
      placeholder?: string;
      initial: string;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    }
  // ── f-voz ──
  /** chamada recebida numa conversa direta; os dados vêm de `stores/voice`. */
  | { kind: "incomingCall" }
  // ── b-canais ──
  | { kind: "channelSettings"; channelId: string; tab?: "geral" | "permissoes" }
  | { kind: "channelTopic"; channelId: string }
  // ── e-configuracoes ──
  | { kind: "quickSwitcher" }
  // ── d-social ──
  | { kind: "customStatus" }
  /** perfil completo de alguém; `guildId` é o servidor de onde o cartão abriu. */
  | { kind: "userProfile"; userId: string; guildId?: string }
  | { kind: "groupSettings"; channelId: string }
  | { kind: "addGroupMembers"; channelId: string }
  // ── h-moderacao ──
  | { kind: "timeout"; guildId: string; user: PublicUser }
  | { kind: "kick"; guildId: string; user: PublicUser }
  | { kind: "ban"; guildId: string; user: PublicUser }
  | { kind: "report"; messageId: string; preview: string }
  | { kind: "createPoll"; channelId: string }
  | { kind: "pollVoters"; messageId: string }
  | { kind: "serverSettings"; guildId: string; tab?: ServerSettingsTab }
  | { kind: "discover" }
  | { kind: "welcome"; guildId: string };

/** Um item de menu de contexto; `separator` desenha a linha entre grupos. */
export type MenuItem =
  | { separator: true }
  | {
      label: string;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      /** nome do ícone lucide já resolvido pelo chamador (ReactNode evita
       *  acoplar a store ao React; o host renderiza o que vier). */
      icon?: unknown;
    };

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** Retângulo do elemento que abriu um popover (coordenadas da viewport). */
export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Popover = { kind: "profile"; user: PublicUser; anchor: Anchor };

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
}

interface UIState {
  /** coluna 2/3: servidores ou mensagens diretas. */
  view: "guild" | "dm";
  /** coluna 4 (lista de membros) visível — o botão de membros do cabeçalho alterna. */
  membersOpen: boolean;
  /** coluna 4 mostrando a galeria de mídia do canal (g-emojis-midia). */
  mediaOpen: boolean;
  modal: Modal | null;
  contextMenu: ContextMenuState | null;
  popover: Popover | null;
  toasts: Toast[];

  setView: (view: "guild" | "dm") => void;
  toggleMembers: () => void;
  toggleMedia: () => void;
  openModal: (modal: Modal) => void;
  /** Fecha o modal atual; confirm/prompt pendentes resolvem como cancelados. */
  closeModal: () => void;

  openContextMenu: (x: number, y: number, items: MenuItem[]) => void;
  closeContextMenu: () => void;
  openProfile: (user: PublicUser, anchor: Anchor) => void;
  closePopover: () => void;

  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;

  toast: (text: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
}

let toastSeq = 0;
const TOAST_MS = 5000;

export const useUI = create<UIState>((set, get) => ({
  view: "guild",
  membersOpen: true,
  mediaOpen: false,
  modal: null,
  contextMenu: null,
  popover: null,
  toasts: [],

  setView: (view) => set({ view }),
  // uma coluna 4 só: abrir a mídia recolhe a lista de membros e vice-versa
  toggleMembers: () => set((s) => ({ membersOpen: !s.membersOpen, mediaOpen: false })),
  toggleMedia: () => set((s) => ({ mediaOpen: !s.mediaOpen })),

  openModal: (modal) => {
    // trocar de modal cancela o anterior, para não deixar Promise pendurada
    get().closeModal();
    set({ modal, contextMenu: null, popover: null });
  },

  closeModal: () => {
    const current = get().modal;
    if (current?.kind === "confirm") current.resolve(false);
    if (current?.kind === "prompt") current.resolve(null);
    set({ modal: null });
  },

  openContextMenu: (x, y, items) => set({ contextMenu: { x, y, items }, popover: null }),
  closeContextMenu: () => set({ contextMenu: null }),
  openProfile: (user, anchor) => set({ popover: { kind: "profile", user, anchor }, contextMenu: null }),
  closePopover: () => set({ popover: null }),

  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      get().closeModal();
      set({
        modal: {
          kind: "confirm",
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel ?? "Confirmar",
          danger: options.danger ?? false,
          resolve: (ok) => {
            set({ modal: null });
            resolve(ok);
          },
        },
      });
    }),

  prompt: (options) =>
    new Promise<string | null>((resolve) => {
      get().closeModal();
      set({
        modal: {
          kind: "prompt",
          title: options.title,
          message: options.message,
          placeholder: options.placeholder,
          initial: options.initial ?? "",
          confirmLabel: options.confirmLabel ?? "Confirmar",
          resolve: (value) => {
            set({ modal: null });
            resolve(value);
          },
        },
      });
    }),

  toast: (text, kind = "info") => {
    const id = `t${++toastSeq}`;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    // some sozinho: aviso é informação passageira, não estado de tela
    if (typeof window !== "undefined") {
      window.setTimeout(() => get().dismissToast(id), TOAST_MS);
    }
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Atalho para call sites fora de componentes (stores, handlers de socket). */
export const ui = {
  toast: (text: string, kind: ToastKind = "info") => useUI.getState().toast(text, kind),
  confirm: (options: ConfirmOptions) => useUI.getState().confirm(options),
  prompt: (options: PromptOptions) => useUI.getState().prompt(options),
  openModal: (modal: Modal) => useUI.getState().openModal(modal),
  closeModal: () => useUI.getState().closeModal(),
  openContextMenu: (x: number, y: number, items: MenuItem[]) =>
    useUI.getState().openContextMenu(x, y, items),
  openProfile: (user: PublicUser, anchor: Anchor) => useUI.getState().openProfile(user, anchor),
  setView: (view: "guild" | "dm") => useUI.getState().setView(view),
  view: () => useUI.getState().view,
};

/** Retângulo de um elemento como `Anchor` (para popovers). */
export function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
