import { create } from "zustand";

/**
 * Janelas soltas da chamada: "Usuário em Nova Janela" e "Transmissão em Nova
 * Janela" do menu de contexto (paridade com o Discord).
 *
 * O store guarda só **referências** às janelas abertas; quem abre é
 * `lib/janela-solta.ts` (precisa rodar dentro do gesto do usuário) e quem
 * desenha é `components/voice/JanelasDeVoz.tsx`, que faz um `createPortal` para
 * o `document.body` de cada janela. Assim o vídeo continua sendo renderizado
 * pela mesma árvore React da chamada — mesmo store, mesma sala do LiveKit —, e
 * a janela nova é só uma "tela" a mais, sem boot de app nem segunda conexão.
 *
 * Sem `persist` de propósito: um `Window` não serializa, e uma janela solta não
 * sobrevive a um recarregamento da aba principal (ela morre junto).
 */

export type TipoDeJanelaDeVoz = "usuario" | "tela";

export type JanelaDeVoz = {
  win: Window;
  tipo: TipoDeJanelaDeVoz;
  userId: string;
  /** "pip" = Document Picture-in-Picture (fica por cima de tudo); "popup" = `window.open`. */
  modo: "pip" | "popup";
};

/** A chave é a do tile: `${userId}` para a pessoa, `${userId}:tela` para a transmissão. */
export function chaveDaJanela(tipo: TipoDeJanelaDeVoz, userId: string): string {
  return tipo === "tela" ? `${userId}:tela` : userId;
}

type JanelasDeVozState = {
  janelas: Record<string, JanelaDeVoz>;
  /**
   * Registra a janela sob a chave. Se já existe uma **viva** com essa chave, a
   * existente ganha foco e a nova é fechada (não dá para "desabrir" uma janela,
   * e duas janelas do mesmo tile seriam dois portais disputando o mesmo vídeo).
   * Devolve `true` quando registrou, `false` quando reaproveitou a existente.
   */
  abrir: (chave: string, janela: JanelaDeVoz) => boolean;
  /** Fecha a janela (se ainda estiver aberta) e tira do registro. Idempotente. */
  fechar: (chave: string) => void;
  fecharTodas: () => void;
  /**
   * `true` se a chave tem janela viva. Uma entrada cuja janela já fechou (o
   * `pagehide` pode não ter chegado, p.ex. janela fechada durante um
   * congelamento da aba) conta como ausente e é limpa aqui mesmo.
   */
  jaAberta: (chave: string) => boolean;
  /** Foca a janela da chave, se houver. Devolve se focou. */
  focar: (chave: string) => boolean;
};

function fecharSemLancar(win: Window): void {
  try {
    if (!win.closed) win.close();
  } catch {
    // janela de outra origem ou já em teardown: não há o que fazer, e fechar
    // é best-effort — o registro sai do store de qualquer jeito
  }
}

function semChave(janelas: Record<string, JanelaDeVoz>, chave: string): Record<string, JanelaDeVoz> {
  const resto = { ...janelas };
  delete resto[chave];
  return resto;
}

export const useJanelasDeVoz = create<JanelasDeVozState>((set, get) => ({
  janelas: {},

  abrir: (chave, janela) => {
    if (get().jaAberta(chave)) {
      if (get().janelas[chave]?.win !== janela.win) fecharSemLancar(janela.win);
      get().focar(chave);
      return false;
    }
    set((s) => ({ janelas: { ...s.janelas, [chave]: janela } }));
    return true;
  },

  fechar: (chave) => {
    const atual = get().janelas[chave];
    if (!atual) return;
    // sai do store **antes** de fechar: o `close()` dispara `pagehide`, que
    // chama `fechar` de novo — com a entrada já removida, a reentrada é no-op
    // e o portal desmonta antes de o documento sumir debaixo dele
    set((s) => ({ janelas: semChave(s.janelas, chave) }));
    fecharSemLancar(atual.win);
  },

  fecharTodas: () => {
    const todas = Object.values(get().janelas);
    if (todas.length === 0) return;
    set({ janelas: {} });
    for (const j of todas) fecharSemLancar(j.win);
  },

  jaAberta: (chave) => {
    const atual = get().janelas[chave];
    if (!atual) return false;
    if (!atual.win.closed) return true;
    set((s) => ({ janelas: semChave(s.janelas, chave) }));
    return false;
  },

  focar: (chave) => {
    const atual = get().janelas[chave];
    if (!atual || atual.win.closed) return false;
    try {
      atual.win.focus();
    } catch {
      // alguns navegadores recusam focar popup sem gesto; a janela segue aberta
    }
    return true;
  },
}));
