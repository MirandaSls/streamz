import { create } from "zustand";
import type { GuildChannelType, PublicUser } from "@streamz/shared";
// ── h-moderacao ──
import type { ServerSettingsTab } from "@/components/settings/server/tabs";
// ── recorte de imagem ──
import type { FormatoDeRecorte } from "@/lib/recorte";
import { AVISO_DO_GIF, ehGif, erroDeTamanho } from "@/lib/imagem-de-perfil";

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
  | { kind: "createChannel"; categoryId?: string | null; tipo?: GuildChannelType }
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
  // ── recorte de imagem ──
  | {
      /**
       * Ajuste de enquadramento antes de subir foto/banner. Como o `prompt`,
       * devolve pela Promise: quem escolheu o arquivo continua linear e recebe
       * de volta o recorte (ou `null`, se desistiu).
       */
      kind: "recortarImagem";
      formato: FormatoDeRecorte;
      arquivo: File;
      resolve: (arquivo: File | null) => void;
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
  | { kind: "welcome"; guildId: string }
  // ── multiconta ── ver `lib/contas.ts`
  | { kind: "gerenciarContas" }
  /** `voltar` = reabrir "Gerenciar contas" ao sair daqui, como no Discord. */
  | { kind: "adicionarConta"; voltar?: boolean };

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
  /**
   * Fileira horizontal de reações rápidas, no topo do menu da mensagem.
   *
   * É a primeira coisa do menu no Discord, e horizontal por um motivo: são
   * quatro alvos do mesmo peso entre os quais se escolhe pela **cara** do
   * emoji, não pelo nome. Empilhados como itens comuns, viravam quatro linhas
   * de texto onde o desenho é o que identifica.
   */
  | {
      reacoes: {
        chave: string;
        rotulo: string;
        /** o emoji já desenhado pelo chamador (mesmo motivo de `icon`). */
        nodo: unknown;
        onSelect: () => void;
      }[];
    }
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
      /**
       * Segunda linha, menor e apagada, embaixo do rótulo — os itens de duas
       * linhas do seletor de status ("Você não receberá notificação na área de
       * trabalho"). Medido no print `2026-09-03 180020`: rótulo de 14 com
       * entrelinha 20, descrição de 12 com entrelinha 16, item de 52 com uma
       * linha de descrição e 68 com duas.
       */
      description?: string;
      /**
       * Chevron **só visual** à direita. O Discord desenha a setinha nos itens
       * de status que teriam um submenu de duração; aqui o clique já aplica o
       * status, então o item não é `submenu` — mas a seta continua na mesma
       * posição, como no original.
       */
      chevron?: boolean;
      /**
       * Item de escolha, não de comando: rótulo em negrito e no branco do
       * título, e ícone **sem** o véu de 80% do quadro padrão — no seletor de
       * status a cor do ícone (verde/amarelo/vermelho/cinza) é a informação, e
       * esmaecê-la aproxima os quatro estados.
       */
      forte?: boolean;
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

/** `true` quando o item é a fileira de reações rápidas. */
export function isReacoes(
  item: MenuItem,
): item is Extract<MenuItem, { reacoes: unknown[] }> {
  return "reacoes" in item;
}

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

export type Popover = {
  kind: "profile";
  user: PublicUser;
  anchor: Anchor;
  /**
   * Cartão **em cima** da âncora e alinhado pela borda esquerda dela, em vez de
   * ao lado. É como o Discord abre o cartão do rodapé: mesma margem esquerda do
   * painel do usuário, encostado na borda da janela. Medido no print
   * `2026-09-03 180020`: cartão em x=10 (a mesma folga de 10 do rodapé) e base
   * 6px acima do topo do rodapé.
   */
  acima?: boolean;
};

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
  /** Abre a conversa da call sem alternar (o balão do canal na barra lateral). */
  abrirVoiceChat: () => void;
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
   * o "+" de cargo, o seletor de status): fechá-lo ali deixaria o menu órfão.
   */
  openContextMenu: (
    x: number,
    y: number,
    items: MenuItem[],
    width?: number,
    manterPopover?: boolean,
  ) => void;
  closeContextMenu: () => void;
  openProfile: (user: PublicUser, anchor: Anchor, acima?: boolean) => void;
  closePopover: () => void;

  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  /**
   * Prepara a imagem escolhida para subir: abre o ajuste de enquadramento e
   * devolve o recorte, `null` se a pessoa cancelou (ou se o arquivo é grande
   * demais) — e o **arquivo original** quando é GIF, que não passa pelo
   * recorte para não perder a animação (ver `lib/imagem-de-perfil.ts`).
   */
  recortarImagem: (arquivo: File, formato: FormatoDeRecorte) => Promise<File | null>;

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
  // o balão da linha do canal **abre**, não alterna: quem clica nele estando
  // noutro canal quer ver a conversa daquela call, e um alternador fecharia o
  // painel que ainda nem estava na tela
  abrirVoiceChat: () => set({ voiceChatOpen: true }),

  openModal: (modal) =>
    set((s) => ({ modals: [...s.modals, modal], contextMenu: null, popover: null })),

  closeModal: () => {
    const pilha = get().modals;
    const topo = pilha[pilha.length - 1];
    // Promise pendurada é vazamento: cancelar explicitamente ao desempilhar
    if (topo?.kind === "confirm") topo.resolve(false);
    if (topo?.kind === "prompt") topo.resolve(null);
    if (topo?.kind === "recortarImagem") topo.resolve(null);
    set({ modals: pilha.slice(0, -1) });
  },

  closeAllModals: () => {
    for (const m of get().modals) {
      if (m.kind === "confirm") m.resolve(false);
      if (m.kind === "prompt") m.resolve(null);
      if (m.kind === "recortarImagem") m.resolve(null);
    }
    set({ modals: [] });
  },

  openContextMenu: (x, y, items, width, manterPopover) =>
    set((s) => ({
      contextMenu: { x, y, items, width },
      popover: manterPopover ? s.popover : null,
    })),
  closeContextMenu: () => set({ contextMenu: null }),
  openProfile: (user, anchor, acima) =>
    set({ popover: { kind: "profile", user, anchor, acima }, contextMenu: null }),
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

  recortarImagem: (arquivo, formato) => {
    // grande demais: o servidor recusaria com 413 depois de subir tudo
    const erro = erroDeTamanho(arquivo, formato);
    if (erro) {
      get().toast(erro, "error");
      return Promise.resolve(null);
    }
    // GIF não abre o enquadramento: o canvas do recorte devolveria um quadro
    // parado. Sobe como veio, com o aviso de que quem enquadra é a tela.
    if (ehGif(arquivo)) {
      get().toast(AVISO_DO_GIF);
      return Promise.resolve(arquivo);
    }
    return new Promise<File | null>((resolve) => {
      const modal: Modal = {
        kind: "recortarImagem",
        formato,
        arquivo,
        resolve: (recortado) => {
          set((s) => ({ modals: s.modals.filter((m) => m !== modal) }));
          resolve(recortado);
        },
      };
      set((s) => ({ modals: [...s.modals, modal] }));
    });
  },

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
  recortarImagem: (arquivo: File, formato: FormatoDeRecorte) =>
    useUI.getState().recortarImagem(arquivo, formato),
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
  openProfile: (user: PublicUser, anchor: Anchor, acima?: boolean) =>
    useUI.getState().openProfile(user, anchor, acima),
  setView: (view: "guild" | "dm") => useUI.getState().setView(view),
  view: () => useUI.getState().view,
};

/** Retângulo de um elemento como `Anchor` (para popovers). */
export function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
