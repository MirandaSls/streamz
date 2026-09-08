import { create } from "zustand";
import type { ComandoDeApp } from "@streamz/shared";
import { api } from "@/lib/api";

/**
 * Comandos de barra dos bots do servidor aberto — o que o `/` do composer
 * mostra depois dos comandos nativos.
 *
 * Store própria, e não um campo de `guilds`, pelo mesmo motivo de `categories`:
 * o ciclo de vida é o do servidor (troca junto), a carga é uma só e a lista
 * muda por um evento próprio (`application.commandsUpdated`), disparado quando
 * um bot roda o `deploy-commands.js`.
 *
 * **Falha em silêncio.** Servidor sem bot nenhum, API antiga ou rota fora do ar
 * não podem soltar um toast a cada troca de servidor: sem comandos de bot o
 * composer continua inteiro, com os nativos. É a mesma escolha de
 * `moderation.loadMembership`.
 */

interface ComandosDeAppState {
  /** servidor a que a lista pertence — o composer nunca mostra a do anterior. */
  guildId: string | null;
  comandos: ComandoDeApp[];
  carregando: boolean;

  loadForGuild: (guildId: string) => Promise<void>;
  /** `application.commandsUpdated`: recarrega só se for o servidor aberto. */
  aplicarAtualizacao: (guildId: string) => void;
  clear: () => void;
}

/** Guarda de corrida: só a última carga escreve no estado. */
let loadSeq = 0;

export const useComandosDeApp = create<ComandosDeAppState>((set, get) => ({
  guildId: null,
  comandos: [],
  carregando: false,

  loadForGuild: async (guildId) => {
    const seq = ++loadSeq;
    // zera junto com o `guildId`: entre o clique e a resposta, o popup do `/`
    // mostraria os comandos do servidor anterior
    set({ guildId, comandos: [], carregando: true });
    try {
      const comandos = await api.comandosDeApp(guildId);
      if (seq !== loadSeq) return; // trocaram de servidor no meio do fetch
      set({ comandos, carregando: false });
    } catch {
      if (seq !== loadSeq) return;
      set({ comandos: [], carregando: false });
    }
  },

  aplicarAtualizacao: (guildId) => {
    if (get().guildId !== guildId) return;
    void get().loadForGuild(guildId);
  },

  clear: () => {
    ++loadSeq;
    set({ guildId: null, comandos: [], carregando: false });
  },
}));
