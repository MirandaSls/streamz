import { create } from "zustand";
import { resolveGuildLayout, type GuildLayout } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Pastas e ordem da barra de servidores — o `GuildLayout` da conta.
 *
 * O layout vive no servidor (segue a conta entre aparelhos); só o "pasta
 * aberta/fechada" é preferência de tela e fica no `localStorage`, como o
 * colapso de categorias em `stores/categories.ts`.
 *
 * `aplicar` é otimista: a barra reage ao arrastar sem esperar a rede. Os PUTs
 * são serializados (um em voo, o último pedido vence) porque duas gravações
 * concorrentes podem chegar fora de ordem e deixar no servidor um layout velho.
 */

const CHAVE_ABERTAS = "streamz:pastas-abertas";

function lerAbertas(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE_ABERTAS);
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return []; // storage indisponível ou lixo salvo: começa tudo fechado
  }
}

// A gravação é adiada: localStorage é síncrono e, rodando antes do `set`,
// atrasava o primeiro render de abrir/fechar a pasta. Cada chamada grava o
// estado já visto por ela, na ordem, então a última continua vencendo.
function gravarAbertas(ids: string[]) {
  if (typeof window === "undefined") return;
  const gravar = () => {
    try {
      window.localStorage.setItem(CHAVE_ABERTAS, JSON.stringify(ids));
    } catch {
      // modo privado / cota cheia: a pasta simplesmente volta fechada no reload
    }
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(gravar);
  else setTimeout(gravar, 0);
}

interface GuildLayoutState {
  layout: GuildLayout | null;
  /** ids das pastas abertas (persistido). */
  abertas: string[];

  carregar: () => Promise<void>;
  aplicar: (novo: GuildLayout) => void;
  /** evento WS: o layout mudou noutra aba/aparelho. Não repete o PUT. */
  receber: (layout: GuildLayout) => void;
  alternarPasta: (id: string) => void;
  fecharTodas: () => void;
  limpar: () => void;
}

// Estado da fila de PUTs: fora da store porque não é render.
let emVoo = false;
let pendente: GuildLayout | null = null;
/** layout que o servidor confirmou por último — para onde reverter se falhar. */
let confirmado: GuildLayout | null = null;

export const useGuildLayout = create<GuildLayoutState>((set, get) => {
  async function drenar() {
    if (emVoo) return;
    emVoo = true;
    try {
      while (pendente) {
        const enviar = pendente;
        pendente = null;
        try {
          const salvo = await api.guildLayout.put(enviar);
          confirmado = salvo;
          // só adota a resposta se nada mais novo foi pedido enquanto voava
          if (!pendente) set({ layout: salvo });
        } catch (e) {
          // reverte para o último estado confirmado, a menos que haja um
          // pedido mais novo na fila (ele decide o estado final)
          if (!pendente) set({ layout: confirmado });
          ui.toast(errorMessage(e, "Não foi possível salvar as pastas de servidores"), "error");
        }
      }
    } finally {
      emVoo = false;
    }
  }

  return {
    layout: null,
    abertas: lerAbertas(),

    carregar: async () => {
      try {
        const layout = await api.guildLayout.get();
        // não atropela uma edição otimista ainda não confirmada
        if (emVoo || pendente) return;
        confirmado = layout;
        set({ layout });
      } catch {
        // silencioso: segue com o layout anterior (ou solto, se não há nenhum)
      }
    },

    aplicar: (novo) => {
      const atual = get().layout;
      if (novo === atual) return;
      if (!emVoo && !pendente) confirmado = atual;
      set({ layout: novo });
      pendente = novo;
      void drenar();
    },

    receber: (layout) => {
      confirmado = layout;
      // um PUT meu em andamento é mais novo que o evento: deixa ele vencer
      if (emVoo || pendente) return;
      set({ layout });
    },

    alternarPasta: (id) => {
      const abertas = get().abertas;
      const proximas = abertas.includes(id) ? abertas.filter((x) => x !== id) : [...abertas, id];
      set({ abertas: proximas });
      gravarAbertas(proximas);
    },

    fecharTodas: () => {
      set({ abertas: [] });
      gravarAbertas([]);
    },

    limpar: () => {
      pendente = null;
      confirmado = null;
      set({ layout: null });
    },
  };
});

/** O layout casado com os servidores de hoje (id alheio some, esquecido volta solto). */
export function layoutResolvido(layout: GuildLayout | null, guildIds: string[]): GuildLayout {
  return resolveGuildLayout(layout, guildIds);
}
