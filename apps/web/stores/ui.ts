import { create } from "zustand";

/**
 * Estado de interface que não pertence a nenhum domínio: qual coluna está em
 * foco, qual modal está aberto e os avisos temporários.
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
  | { kind: "createChannel" }
  | { kind: "channelAccess"; channelId: string }
  | { kind: "invite"; code: string }
  | { kind: "createGroupDM" }
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
    };

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
  modal: Modal | null;
  toasts: Toast[];

  setView: (view: "guild" | "dm") => void;
  openModal: (modal: Modal) => void;
  /** Fecha o modal atual; confirm/prompt pendentes resolvem como cancelados. */
  closeModal: () => void;

  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;

  toast: (text: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
}

let toastSeq = 0;
const TOAST_MS = 5000;

export const useUI = create<UIState>((set, get) => ({
  view: "guild",
  modal: null,
  toasts: [],

  setView: (view) => set({ view }),

  openModal: (modal) => {
    // trocar de modal cancela o anterior, para não deixar Promise pendurada
    get().closeModal();
    set({ modal });
  },

  closeModal: () => {
    const current = get().modal;
    if (current?.kind === "confirm") current.resolve(false);
    if (current?.kind === "prompt") current.resolve(null);
    set({ modal: null });
  },

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
  setView: (view: "guild" | "dm") => useUI.getState().setView(view),
  view: () => useUI.getState().view,
};
