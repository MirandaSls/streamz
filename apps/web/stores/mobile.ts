"use client";

import { create } from "zustand";

/**
 * Navegação do leiaute de celular: qual aba está aberta e o que está empilhado
 * em cima dela.
 *
 * O Discord do celular não tem colunas: tem **quatro abas** no rodapé e, dentro
 * de cada uma, uma pilha de telas cheias que entram deslizando da direita. Esta
 * store é essa pilha — e só ela. O que está *dentro* de cada tela continua
 * vindo das stores de domínio de sempre (`channels`, `dms`, `messages`…): o
 * canal aberto é o `activeChannelId`, a conversa é o `activeId` das DMs. Aqui só
 * mora "estou olhando a lista ou a conversa".
 *
 * Cada aba tem a **própria pilha**, como no Discord: sair de uma conversa para
 * ver as notificações e voltar devolve a conversa onde estava.
 */

/**
 * As **três** abas do app do Discord no celular, medidas em
 * `docs/Reference/mobile/discord-mobile-servidor-2024.png`: `Home`,
 * `Notifications` e `You`.
 *
 * Não há aba de mensagens. As conversas diretas entram pela **bolha no topo da
 * rail** — tocá-la troca a coluna da direita pela lista "Mensagens", com a rail
 * ainda à vista (ver `discord-mobile-dms-2024.png`). Servidores e conversas são
 * a mesma seção "Início"; o que muda é o que a coluna mostra.
 */
export type AbaMobile = "inicio" | "notificacoes" | "voce";

export const ABAS_MOBILE: readonly AbaMobile[] = ["inicio", "notificacoes", "voce"];

/** Uma tela cheia empilhada sobre a base da aba. */
export type TelaMobile =
  /** conversa de um canal de texto (ou o chat do canal de voz). */
  | "canal"
  /** palco da chamada em tela cheia. */
  | "voz"
  /** conversa direta ou grupo. */
  | "conversa"
  /** página de amigos. */
  | "amigos"
  /**
   * "Descobrir aplicativos" (── j-bots · F4 ──).
   *
   * No desktop o diretório abre **por cima da coluna 3**, com o rail e a coluna
   * de canais intactos. Num telefone não existe coluna ao lado de nada, então
   * ele entra como mais uma tela da pilha — o mesmo caminho da página de
   * amigos, que no desktop também é um pedaço da coluna 3. Quem empilha é o
   * `ShellMobile`, ouvindo o `data-apps-button` da rail por delegação de
   * clique.
   *
   * **O App Directory nativo no celular não existe no Discord** — eles o
   * oferecem no desktop, no navegador e no site deles. Não há captura a copiar,
   * e por isso esta tela é desenhada no vocabulário do nosso próprio leiaute
   * móvel (`CabecalhoMobile` de 56, `TelaEmpilhada`), e não numa referência
   * inventada. Registrado no PR.
   */
  | "aplicativos";

/** Folha inferior aberta (o equivalente móvel de um popover ancorado). */
export type FolhaMobile =
  /** menu de uma mensagem, aberto por toque longo. */
  | { tipo: "mensagem"; messageId: string; channelId: string }
  /** menu do servidor aberto pelo cabeçalho. */
  | { tipo: "servidor"; guildId: string };

interface EstadoMobile {
  aba: AbaMobile;
  pilhas: Record<AbaMobile, TelaMobile[]>;
  /** painel deslizante de membros/perfil, por cima da conversa. */
  membrosAbertos: boolean;
  folha: FolhaMobile | null;

  irParaAba: (aba: AbaMobile) => void;
  empilhar: (tela: TelaMobile) => void;
  /** troca a tela do topo sem mudar a profundidade (canal → voz, por exemplo). */
  trocarTopo: (tela: TelaMobile) => void;
  abrirMembros: () => void;
  abrirFolha: (folha: FolhaMobile) => void;
  /** desfaz a camada mais alta: folha → membros → pilha. `false` = nada a fazer. */
  voltar: () => boolean;
  /** volta ao pé da aba atual (usado ao tocar de novo na aba já ativa). */
  irParaARaiz: () => void;
}

const PILHAS_VAZIAS: Record<AbaMobile, TelaMobile[]> = {
  inicio: [],
  notificacoes: [],
  voce: [],
};

export const useMobile = create<EstadoMobile>((set, get) => ({
  aba: "inicio",
  pilhas: PILHAS_VAZIAS,
  membrosAbertos: false,
  folha: null,

  irParaAba: (aba) => {
    // tocar na aba que já está aberta volta para o pé dela, como no Discord
    if (get().aba === aba) {
      set((s) => ({
        membrosAbertos: false,
        folha: null,
        pilhas: { ...s.pilhas, [aba]: [] },
      }));
      return;
    }
    set({ aba, membrosAbertos: false, folha: null });
  },

  empilhar: (tela) =>
    set((s) => {
      const atual = s.pilhas[s.aba];
      // repetir a mesma tela não empilha: tocar duas vezes no canal aberto não
      // pode exigir dois "voltar"
      if (atual[atual.length - 1] === tela) return {};
      return {
        membrosAbertos: false,
        folha: null,
        pilhas: { ...s.pilhas, [s.aba]: [...atual, tela] },
      };
    }),

  trocarTopo: (tela) =>
    set((s) => {
      const atual = s.pilhas[s.aba];
      if (atual.length === 0) return { pilhas: { ...s.pilhas, [s.aba]: [tela] } };
      if (atual[atual.length - 1] === tela) return {};
      return { pilhas: { ...s.pilhas, [s.aba]: [...atual.slice(0, -1), tela] } };
    }),

  abrirMembros: () => set({ membrosAbertos: true }),
  abrirFolha: (folha) => set({ folha }),

  voltar: () => {
    const s = get();
    if (s.folha) {
      set({ folha: null });
      return true;
    }
    if (s.membrosAbertos) {
      set({ membrosAbertos: false });
      return true;
    }
    const atual = s.pilhas[s.aba];
    if (atual.length > 0) {
      set({ pilhas: { ...s.pilhas, [s.aba]: atual.slice(0, -1) } });
      return true;
    }
    return false;
  },

  irParaARaiz: () =>
    set((s) => ({
      membrosAbertos: false,
      folha: null,
      pilhas: { ...s.pilhas, [s.aba]: [] },
    })),
}));

/** A tela no topo da aba atual, ou `null` quando estamos na base dela. */
export function telaDoTopo(estado: {
  aba: AbaMobile;
  pilhas: Record<AbaMobile, TelaMobile[]>;
}): TelaMobile | null {
  const pilha = estado.pilhas[estado.aba];
  return pilha[pilha.length - 1] ?? null;
}

/**
 * Quantas camadas existem sobre a base da aba. É o que o botão "voltar" do
 * Android desfaz, uma por vez (ver `useVoltarDoAndroid`).
 */
export function profundidade(estado: {
  aba: AbaMobile;
  pilhas: Record<AbaMobile, TelaMobile[]>;
  membrosAbertos: boolean;
  folha: FolhaMobile | null;
}): number {
  return (
    estado.pilhas[estado.aba].length +
    (estado.membrosAbertos ? 1 : 0) +
    (estado.folha ? 1 : 0)
  );
}

/** Atalho fora do React, no estilo do `ui` de `stores/ui.ts`. */
export const mobile = {
  empilhar: (tela: TelaMobile) => useMobile.getState().empilhar(tela),
  trocarTopo: (tela: TelaMobile) => useMobile.getState().trocarTopo(tela),
  irParaAba: (aba: AbaMobile) => useMobile.getState().irParaAba(aba),
  abrirFolha: (folha: FolhaMobile) => useMobile.getState().abrirFolha(folha),
  voltar: () => useMobile.getState().voltar(),
};
