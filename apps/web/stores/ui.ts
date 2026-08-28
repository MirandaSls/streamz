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
      /** id da mensagem a mostrar como prévia dentro da caixa (apagar mensagem). */
      preview?: string;
      confirmLabel: string;
      danger: boolean;
      resolve: (ok: boolean) => void;
    }
  | {
      kind: "prompt";
      title: string;
      message?: string;
      placeholder?: string;
      /** rótulo em caixa-alta acima do campo. */
      label?: string;
      danger: boolean;
      initial: string;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    }
  // ── f-voz ──
  /** chamada recebida numa conversa direta; os dados vêm de `stores/voice`. */
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
  | { kind: "welcome"; guildId: string };

/**
 * Um item de menu de contexto; `separator` desenha a linha entre grupos.
 *
 * `submenu` é o que permite reproduzir os menus do Discord sem achatá-los:
 * Notificações, Silenciar, Cargos e Castigo são submenus lá, e antes viravam
 * um segundo menu que substituía o primeiro. Item com `submenu` não tem
 * `onSelect` — quem abre o filho é o host.
 *
 * `checked` marca estado (nível de notificação, cargo do membro) e faz o host
 * usar `menuitemradio`/`menuitemcheckbox` com o controle desenhado à direita,
 * em vez de trocar o ícone do item por um ✓.
 */
export type MenuItem =
  | { separator: true }
  | {
      label: string;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
      /** destaque de ação principal ("Convidar pessoas" no menu do servidor). */
      highlight?: boolean;
      checked?: boolean;
      /** `radio` desenha bolinha; `checkbox`, quadrado. */
      control?: "radio" | "checkbox";
      /** ponto colorido antes do rótulo (cor do cargo). */
      dot?: string;
      /** nome do ícone lucide já resolvido pelo chamador (ReactNode evita
       *  acoplar a store ao React; o host renderiza o que vier). */
      icon?: unknown;
    }
  | {
      label: string;
      submenu: MenuItem[];
      danger?: boolean;
      disabled?: boolean;
      icon?: unknown;
    }
  /**
   * Controle contínuo dentro do menu — é assim que o Discord ajusta o volume de
   * um participante: uma barra que se arrasta ali mesmo, com o valor ao lado.
   * Degraus fixos obrigavam a escolher entre 100% e 150% sem nada no meio.
   */
  | {
      label: string;
      slider: {
        value: number;
        min: number;
        max: number;
        step?: number;
        onChange: (valor: number) => void;
        format?: (valor: number) => string;
      };
      icon?: unknown;
    };

/** `true` quando o item abre um submenu em vez de executar uma ação. */
export function isSubmenu(
  item: MenuItem,
): item is Extract<MenuItem, { submenu: MenuItem[] }> {
  return "submenu" in item;
}

/** `true` quando o item é uma barra arrastável, não uma ação. */
export function isSlider(
  item: MenuItem,
): item is Extract<MenuItem, { slider: object }> {
  return "slider" in item;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
  /** largura da caixa; o Discord varia entre ~188px e ~220px por tipo de menu. */
  width?: number;
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
  /** id da mensagem a renderizar como prévia (confirmação de apagar). */
  preview?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  /** rótulo em caixa-alta acima do campo ("DIGITE O NOME DO SERVIDOR"). */
  label?: string;
  initial?: string;
  confirmLabel?: string;
  /** botão primário em vermelho quando o prompt confirma algo destrutivo. */
  danger?: boolean;
}

interface UIState {
  /** coluna 2/3: servidores ou mensagens diretas. */
  view: "guild" | "dm";
  /** coluna 4 (lista de membros) visível — o botão de membros do cabeçalho alterna. */
  membersOpen: boolean;
  /**
   * Chat do canal de VOZ à mostra. Fica fechado por padrão: no canal de voz o
   * palco ocupa a área inteira, e o texto só aparece por clique — ao contrário
   * da chamada em conversa, onde os dois convivem empilhados o tempo todo.
   */
  voiceChatOpen: boolean;
  /**
   * Pilha de modais. É pilha, e não um só, porque confirmar algo de dentro das
   * configurações (apagar um cargo, um emoji, o servidor) precisa abrir a caixa
   * **por cima** — antes o confirm fechava a tela de configurações inteira e,
   * ao cancelar, não havia para onde voltar.
   */
  modals: Modal[];
  contextMenu: ContextMenuState | null;
  popover: Popover | null;
  toasts: Toast[];

  setView: (view: "guild" | "dm") => void;
  toggleMembers: () => void;
  toggleVoiceChat: () => void;
  /** Empilha um modal sobre o que já estiver aberto. */
  openModal: (modal: Modal) => void;
  /** Desempilha o modal do topo; confirm/prompt pendente resolve cancelado. */
  closeModal: () => void;
  /** Fecha a pilha inteira (Esc no topo do app, navegação). */
  closeAllModals: () => void;

  /**
   * Abrir um menu fecha o popover — em geral o menu *substitui* o cartão.
   * `manterPopover` é para os menus que PERTENCEM ao cartão (o kebab do perfil,
   * o "+" de cargo, a duração do status): fechá-lo ali deixaria o menu órfão.
   */
  openContextMenu: (
    x: number,
    y: number,
    items: MenuItem[],
    width?: number,
    manterPopover?: boolean,
  ) => void;
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
  // o app abre em "mensagens diretas", que é onde mora a página Amigos
  view: "dm",
  membersOpen: true,
  voiceChatOpen: false,
  modals: [],
  contextMenu: null,
  popover: null,
  toasts: [],

  setView: (view) => set({ view }),
  toggleMembers: () => set((s) => ({ membersOpen: !s.membersOpen })),
  toggleVoiceChat: () => set((s) => ({ voiceChatOpen: !s.voiceChatOpen })),

  openModal: (modal) =>
    set((s) => ({ modals: [...s.modals, modal], contextMenu: null, popover: null })),

  closeModal: () => {
    const pilha = get().modals;
    const topo = pilha[pilha.length - 1];
    // Promise pendurada é vazamento: cancelar explicitamente ao desempilhar
    if (topo?.kind === "confirm") topo.resolve(false);
    if (topo?.kind === "prompt") topo.resolve(null);
    set({ modals: pilha.slice(0, -1) });
  },

  closeAllModals: () => {
    for (const m of get().modals) {
      if (m.kind === "confirm") m.resolve(false);
      if (m.kind === "prompt") m.resolve(null);
    }
    set({ modals: [] });
  },

  openContextMenu: (x, y, items, width, manterPopover) =>
    set((s) => ({
      contextMenu: { x, y, items, width },
      popover: manterPopover ? s.popover : null,
    })),
  closeContextMenu: () => set({ contextMenu: null }),
  openProfile: (user, anchor) => set({ popover: { kind: "profile", user, anchor }, contextMenu: null }),
  closePopover: () => set({ popover: null }),

  // confirm/prompt empilham: quem chamou pode estar dentro de outro modal
  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      const modal: Modal = {
        kind: "confirm",
        title: options.title,
        message: options.message,
        preview: options.preview,
        confirmLabel: options.confirmLabel ?? "Confirmar",
        danger: options.danger ?? false,
        resolve: (ok) => {
          set((s) => ({ modals: s.modals.filter((m) => m !== modal) }));
          resolve(ok);
        },
      };
      set((s) => ({ modals: [...s.modals, modal] }));
    }),

  prompt: (options) =>
    new Promise<string | null>((resolve) => {
      const modal: Modal = {
        kind: "prompt",
        title: options.title,
        message: options.message,
        placeholder: options.placeholder,
        label: options.label,
        danger: options.danger ?? false,
        initial: options.initial ?? "",
        confirmLabel: options.confirmLabel ?? "Confirmar",
        resolve: (value) => {
          set((s) => ({ modals: s.modals.filter((m) => m !== modal) }));
          resolve(value);
        },
      };
      set((s) => ({ modals: [...s.modals, modal] }));
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
  closeAllModals: () => useUI.getState().closeAllModals(),
  openContextMenu: (
    x: number,
    y: number,
    items: MenuItem[],
    width?: number,
    manterPopover?: boolean,
  ) => useUI.getState().openContextMenu(x, y, items, width, manterPopover),
  openProfile: (user: PublicUser, anchor: Anchor) => useUI.getState().openProfile(user, anchor),
  setView: (view: "guild" | "dm") => useUI.getState().setView(view),
  view: () => useUI.getState().view,
};

/** Retângulo de um elemento como `Anchor` (para popovers). */
export function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
