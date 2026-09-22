import { create } from "zustand";
import type { GuildChannelType, PublicUser } from "@streamz/shared";
// ── h-moderacao ──
import type { ServerSettingsTab } from "@/components/settings/server/tabs";
import { cliqueNosMembros } from "@/components/voice/paineis-da-call";
import {
  alternarChatDoCanal,
  chatDoCanalAberto,
  definirChatDoCanal,
  esquecerChatDoCanal,
  type ChatPorCanal,
} from "@/components/voice/vista-do-canal-de-voz";
import { useChannels } from "@/stores/channels";
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
  /** `channelId` pré-seleciona o destino (menu de contexto de um canal, F/G). */
  | { kind: "invite"; guildId: string; code?: string; channelId?: string }
  /**
   * "Criar servidor" / "Entrar em um servidor" — o mesmo modal do "+" da rail
   * (cartão 7a-criar-servidor), com as duas portas do Discord.
   * `tela` escolhe onde ele abre: sem ela, começa em "Crie seu servidor"; o
   * "Entrar com um convite" do menu do "+" já abre direto no campo de código.
   */
  | { kind: "criarServidor"; tela?: "criar" | "entrar" }
  | { kind: "createGroupDM" }
  | { kind: "settings"; tab?: string }
  | { kind: "image"; url: string; alt: string }
  // ── g-emojis-midia ──
  /**
   * galeria de imagens do canal, navegável com ← →.
   *
   * `messageId` é a mensagem dona das imagens, quando há uma: é o que deixa o
   * visualizador reagir (a reação é da mensagem, não do arquivo) e mostrar as
   * reações existentes embaixo da foto. A galeria do canal e a prévia de link
   * solta abrem sem ele.
   */
  | {
      kind: "galeria";
      urls: string[];
      alts: string[];
      /**
       * ids dos anexos, na mesma ordem de `urls`. Quem abre a galeria a partir
       * de `Attachment` manda a lista; é o que deixa copiar/salvar caírem no
       * proxy da API quando a URL assinada do R2 vence (ver o cabeçalho de
       * `lib/imagem-arquivo.ts`). Prévia de link e embed sem anexo não têm id.
       */
      anexoIds?: (string | undefined)[];
      indice: number;
      messageId?: string;
    }
  /** gerência de emojis e figurinhas de um servidor. */
  | { kind: "guildEmojis"; guildId: string }
  /** "+ Adicionar som" do painel de efeitos sonoros. */
  | { kind: "adicionarSom"; guildId: string }
  | {
      kind: "confirm";
      title: string;
      message?: string;
      /** id da mensagem a mostrar como prévia dentro da caixa (apagar mensagem). */
      preview?: string;
      confirmLabel: string;
      danger: boolean;
      /**
       * Com ela, o rodapé ganha o "Não perguntar de novo" do Discord (124114) e
       * a escolha fica guardada sob esta chave (`lib/confirmacao-lembrada.ts`).
       * Quem chama é quem consulta `confirmacaoLembrada(chave)` antes de abrir.
       */
      chaveDeLembrar?: string;
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
  /** ── c-cargos: a categoria ganhou tela própria (nome + permissões). */
  | { kind: "categorySettings"; categoryId: string; tab?: "geral" | "permissoes" }
  | { kind: "channelTopic"; channelId: string }
  // ── e-configuracoes ──
  | { kind: "quickSwitcher" }
  /** a grade de atalhos do Ctrl+/ (`components/chat/AtalhosDoTeclado.tsx`). */
  | { kind: "atalhosDoTeclado" }
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
  | { kind: "adicionarConta"; voltar?: boolean }
  // ── menus de clique direito (stubs; conteúdo vem numa leva seguinte) ──
  /** "Encaminhar" de uma mensagem (p1/p3, sem seta de submenu). */
  | { kind: "encaminhar"; messageId: string; channelId: string }
  /** "Adicionar nota" do cartão de uma DM (p2 — "Visível apenas para você"). */
  | { kind: "notaDeUsuario"; userId: string }
  /** "Adicionar apelido de amigo" do cartão de uma DM (p2). */
  | { kind: "apelidoDeAmigo"; userId: string }
  /** "Config. de privacidade" do menu do ícone do servidor (p5). */
  | { kind: "privacidadeDoServidor"; guildId: string }
  /** "Editar perfil por servidor" do menu do ícone do servidor (p5). */
  | { kind: "perfilPorServidor"; guildId: string }
  /**
   * "Abrir na visualização de moderador" do menu de membro (ESPEC2 §J1/§J2):
   * cabeçalho + selos de data + cargos + permissões-chave + últimas entradas
   * do registro de auditoria que têm `userId` como alvo, com os botões de
   * castigo/expulsão/banimento do rodapé conforme a permissão de quem olha.
   */
  | { kind: "visaoDeModerador"; guildId: string; userId: string };

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
      checked?: boolean;
      /**
       * `radio` desenha bolinha; `checkbox`, quadrado; `selo`, o círculo cheio
       * com ✓ colado ao rótulo, só quando marcado — a conta ativa do submenu
       * "Mudar de conta" (print `p7` de 2026-09-16).
       */
      control?: "radio" | "checkbox" | "selo";
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
      /**
       * Segunda linha do item-pai, igual à do item comum acima — o "Config. de
       * notificação" do menu do servidor mostra o nível atual embaixo do rótulo
       * (print p5: "Nada"). Mesmo estilo (12/16, `--text-muted`); a seta de
       * submenu continua centralizada à direita, sem disputar espaço com ela.
       */
      description?: string;
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
        /**
         * Some com o valor ao lado do rótulo — "Volume do usuário" do menu de
         * participante de voz (ESPEC2 item N) é só rótulo em cima e barra
         * embaixo, sem o "100%" que o volume "meu" (`Volume` deste arquivo)
         * mostra. Sem esta opção o item ganharia um `format: () => ""`
         * espalhado pelos chamadores só para esconder um span.
         */
        semValor?: boolean;
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
  /**
   * Quem abriu o menu (`mensagem:<id>` no `MessageItem`). Serve para o dono
   * saber que o menu aberto é o dele — a mensagem fica acesa enquanto o menu
   * dela está na tela, como no Discord — sem comparar a lista de itens.
   */
  dono?: string;
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
  /** ver `chaveDeLembrar` no modal `confirm`. */
  chaveDeLembrar?: string;
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
   * Chat do canal de VOZ à mostra, **canal a canal**.
   *
   * Era um booleano só, fechado por padrão, de quando a conversa do canal de
   * voz ainda interrompia um palco cheio. A print
   * `2026-09-04 102429` mostra o Discord abrindo o canal de voz já com a coluna
   * da direita na tela — e mostra também por que a memória é por canal: dois
   * canais de voz têm dois usos, e quem fecha a conversa de um não pediu nada
   * sobre o outro. Canal ausente do mapa = ninguém mexeu = `CHAT_ABERTO_POR_PADRAO`
   * (ver `components/voice/vista-do-canal-de-voz.ts`).
   */
  chatDaCallPorCanal: ChatPorCanal;
  /**
   * O palco da chamada está **expandido dentro da janela**.
   *
   * Não confundir com `telaCheia` (`stores/voice`, ver `components/voice/
   * fullscreen.ts`): aquela é a tela cheia de verdade — do elemento ou da
   * janela do app —, e some com o sistema inteiro. Esta é um modo **nosso**: o
   * palco toma a região de conteúdo (cabeçalho da conversa, chat e coluna da
   * direita ficam atrás dele) e a barra lateral da esquerda continua na tela,
   * que foi o pedido.
   *
   * Mora aqui, e não num `useState` do palco, por dois motivos concretos:
   * quem desenha o palco (`CallStage`) e quem divide a coluna (`CallSplit`)
   * são irmãos — o estado teria de subir até o `DMView`/`page.tsx` para os
   * dois lerem —, e o `CallStage` **remonta** quando a conversa abre ou fecha
   * (o `DMView` o troca de lugar na árvore), o que apagaria um estado local.
   */
  palcoExpandido: boolean;
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
  /**
   * Canal (de servidor ou DM) cujo painel de fixadas está aberto; `null` =
   * fechado. Mora aqui, e não no estado local do `PinsPopover`, para o Ctrl+P
   * (`hooks/useKeyboardShortcuts.ts`) conseguir abrir o mesmo painel que o
   * alfinete do cabeçalho abre.
   */
  fixadasAbertasEm: string | null;
  /**
   * Contador de pedidos de foco na busca do cabeçalho (Ctrl+F). É número, não
   * booleano: dois Ctrl+F seguidos têm de ser dois pedidos, e um booleano que
   * já está `true` não muda — o `HeaderBar` observa a troca do valor.
   */
  focoNaBusca: number;

  setView: (view: "guild" | "dm") => void;
  toggleMembers: () => void;
  /**
   * O ícone de pessoas do cabeçalho do **canal de voz**.
   *
   * Não é o `toggleMembers`: ali a coluna da direita é disputada com a conversa
   * da call, e só cabe um painel (ver `components/voice/paineis-da-call.ts`).
   * Com a conversa aberta, este clique mostra a lista **fechando a conversa** —
   * um `toggleMembers` cru ligaria `membersOpen` sem tirar a conversa da frente
   * e nada mudaria na tela. Sem `channelId` vale para o canal de voz aberto agora.
   */
  alternarMembrosNaCall: (channelId?: string | null) => void;
  /**
   * Abre a conversa da call sem alternar (o balão do canal na barra lateral).
   * Sem `channelId` vale para o canal de voz aberto agora.
   */
  abrirVoiceChat: (channelId?: string | null) => void;
  toggleVoiceChat: (channelId?: string | null) => void;
  /** Canal apagado: some com a preferência dele em vez de guardar um fantasma. */
  esquecerChatDaCall: (channelId: string) => void;
  /**
   * Liga/desliga o palco expandido. Quem liga é o botão do palco; quem desliga
   * é ele, o Esc, o fim da chamada e o desmonte do palco — um modo global que
   * sobrevivesse à call deixaria a próxima conversa com a interface presa.
   */
  definirPalcoExpandido: (valor: boolean) => void;
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
    /** quem abriu (ver `ContextMenuState.dono`). */
    dono?: string,
  ) => void;
  closeContextMenu: () => void;
  openPins: (channelId: string) => void;
  closePins: () => void;
  pedirFocoNaBusca: () => void;
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

/**
 * O canal de voz na tela agora — o alvo padrão do balão.
 *
 * `abrirVoiceChat()` é chamado sem argumento pelo balão da linha do canal na
 * barra lateral, logo depois do `select(canal)`: ali o canal certo já está na
 * store de canais, e repetir o id no call site só criaria uma segunda fonte da
 * mesma verdade. A leitura é sempre em tempo de clique (`getState`), então o
 * laço de importação entre as duas stores nunca chega a ser avaliado.
 */
const canalDeVozAtual = () => useChannels.getState().voiceChannelId;

let toastSeq = 0;
const TOAST_MS = 5000;

export const useUI = create<UIState>((set, get) => ({
  // o app abre em "mensagens diretas", que é onde mora a página Amigos
  view: "dm",
  membersOpen: true,
  chatDaCallPorCanal: {},
  palcoExpandido: false,
  modals: [],
  contextMenu: null,
  popover: null,
  toasts: [],
  fixadasAbertasEm: null,
  focoNaBusca: 0,

  setView: (view) => set({ view }),
  toggleMembers: () => set((s) => ({ membersOpen: !s.membersOpen })),
  alternarMembrosNaCall: (channelId) =>
    set((s) => {
      const canal = channelId ?? canalDeVozAtual();
      const acao = cliqueNosMembros(chatDoCanalAberto(s.chatDaCallPorCanal, canal), s.membersOpen);
      return {
        membersOpen: acao.membros,
        // fechar é gravar `false` no canal, não esquecer a preferência: quem
        // voltar a este canal encontra a conversa fechada, como deixou
        chatDaCallPorCanal: acao.fecharChat
          ? definirChatDoCanal(s.chatDaCallPorCanal, canal, false)
          : s.chatDaCallPorCanal,
      };
    }),
  toggleVoiceChat: (channelId) =>
    set((s) => ({
      chatDaCallPorCanal: alternarChatDoCanal(s.chatDaCallPorCanal, channelId ?? canalDeVozAtual()),
    })),
  // o balão da linha do canal **abre**, não alterna: quem clica nele estando
  // noutro canal quer ver a conversa daquela call, e um alternador fecharia o
  // painel que ainda nem estava na tela
  abrirVoiceChat: (channelId) =>
    set((s) => ({
      chatDaCallPorCanal: definirChatDoCanal(
        s.chatDaCallPorCanal,
        channelId ?? canalDeVozAtual(),
        true,
      ),
    })),

  esquecerChatDaCall: (channelId) =>
    set((s) => ({ chatDaCallPorCanal: esquecerChatDoCanal(s.chatDaCallPorCanal, channelId) })),

  definirPalcoExpandido: (valor) => set({ palcoExpandido: valor }),

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

  openContextMenu: (x, y, items, width, manterPopover, dono) =>
    set((s) => ({
      contextMenu: { x, y, items, width, dono },
      popover: manterPopover ? s.popover : null,
    })),
  closeContextMenu: () => set({ contextMenu: null }),
  openPins: (channelId) => set({ fixadasAbertasEm: channelId }),
  closePins: () => set({ fixadasAbertasEm: null }),
  pedirFocoNaBusca: () => set((s) => ({ focoNaBusca: s.focoNaBusca + 1 })),
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
        chaveDeLembrar: options.chaveDeLembrar,
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
    dono?: string,
  ) => useUI.getState().openContextMenu(x, y, items, width, manterPopover, dono),
  openPins: (channelId: string) => useUI.getState().openPins(channelId),
  closePins: () => useUI.getState().closePins(),
  pedirFocoNaBusca: () => useUI.getState().pedirFocoNaBusca(),
  openProfile: (user: PublicUser, anchor: Anchor, acima?: boolean) =>
    useUI.getState().openProfile(user, anchor, acima),
  setView: (view: "guild" | "dm") => useUI.getState().setView(view),
  esquecerChatDaCall: (channelId: string) => useUI.getState().esquecerChatDaCall(channelId),
  view: () => useUI.getState().view,
};

/** Retângulo de um elemento como `Anchor` (para popovers). */
export function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
