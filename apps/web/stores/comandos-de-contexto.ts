import { create } from "zustand";
import { TIPO_DE_COMANDO_DE_APP, type ComandoDeApp, type TipoDeComandoDeApp } from "@streamz/shared";
import { api } from "@/lib/api";

/**
 * Comandos de contexto (tipos 2 "usuário" e 3 "mensagem") dos apps de cada
 * servidor — o submenu "Apps >" do menu de clique direito (mensagem hoje;
 * usuário/membro fica para quem mexer nesses menus). `docs/CONTRATO-MENUS.md`
 * §7.
 *
 * **Por que cache por servidor, e não "só o ativo" como `comandos-de-app.ts`.**
 * O menu de contexto é **síncrono**: o clique direito monta os itens na hora,
 * sem esperar rede. Não dá para segurar o menu por um `await`, então o
 * submenu nasce com o que já estiver em `porGuild` (mesmo que vazio, caindo
 * para "Nenhum app disponível") e `garantir` dispara a carga por baixo — o
 * próximo clique naquele servidor já vê a lista pronta. Guardar por
 * `guildId`, em vez de substituir a cada troca de servidor, evita pedir de
 * novo um servidor já visitado nesta sessão.
 *
 * **Falha em silêncio**, como `comandos-de-app.ts`: servidor sem bot, API
 * antiga ou rota fora do ar não podem quebrar o menu de mensagem — o submenu
 * some para "Nenhum app disponível" em vez de travar ou estourar um toast a
 * cada hover.
 */

interface ComandosDeContextoState {
  porGuild: Record<string, ComandoDeApp[]>;
  /** servidores com um carregamento em voo — `garantir` não dispara dois. */
  carregando: Record<string, boolean>;

  /** os comandos de contexto do servidor já em cache (`[]` enquanto não carregou). */
  doGuild: (guildId: string) => ComandoDeApp[];
  /** só os de um tipo (2 = usuário, 3 = mensagem). */
  doTipo: (guildId: string, tipo: TipoDeComandoDeApp) => ComandoDeApp[];
  /** Dispara a carga se ainda não houver cache nem pedido em voo. Idempotente. */
  garantir: (guildId: string) => void;
  /** `application.commandsUpdated`: só relista se o servidor já estava em cache. */
  aplicarAtualizacao: (guildId: string) => void;
  clear: () => void;
}

export const useComandosDeContexto = create<ComandosDeContextoState>((set, get) => ({
  porGuild: {},
  carregando: {},

  doGuild: (guildId) => get().porGuild[guildId] ?? [],
  doTipo: (guildId, tipo) => (get().porGuild[guildId] ?? []).filter((c) => c.tipo === tipo),

  garantir: (guildId) => {
    const s = get();
    if (s.porGuild[guildId] || s.carregando[guildId]) return;
    set({ carregando: { ...s.carregando, [guildId]: true } });
    void api
      .comandosDeContexto(guildId)
      .then((comandos) => {
        set((st) => ({
          porGuild: { ...st.porGuild, [guildId]: comandos },
          carregando: { ...st.carregando, [guildId]: false },
        }));
      })
      .catch(() => {
        // sem cache nenhum: o próximo hover/clique tenta de novo sozinho
        set((st) => {
          const carregando = { ...st.carregando };
          delete carregando[guildId];
          return { carregando };
        });
      });
  },

  aplicarAtualizacao: (guildId) => {
    if (!get().porGuild[guildId]) return; // nunca foi pedido: nada para atualizar
    set((s) => {
      const porGuild = { ...s.porGuild };
      delete porGuild[guildId];
      return { porGuild };
    });
    get().garantir(guildId);
  },

  clear: () => set({ porGuild: {}, carregando: {} }),
}));

/** Os comandos tipo 3 (MESSAGE) do servidor — o que o submenu da mensagem lista. */
export function useComandosDeMensagem(guildId: string | null): ComandoDeApp[] {
  return useComandosDeContexto((s) =>
    guildId ? s.doTipo(guildId, TIPO_DE_COMANDO_DE_APP.MESSAGE) : [],
  );
}
