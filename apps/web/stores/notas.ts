import { create } from "zustand";
import type { NotaDeUsuario, NotasDeUsuario } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * Minhas notas privadas sobre outros usuários (`docs/CONTRATO-MENUS.md` §2):
 * texto que só eu vejo, nunca a pessoa anotada.
 *
 * Carrega tudo de uma vez no boot (`GET /users/me/notes`, ao lado de
 * `useFriends.load`, em `hooks/useRealtime.ts`) porque o item "Nota" precisa
 * saber, na hora de abrir o menu, se já existe alguma para trocar o rótulo por
 * "Editar nota" — sem isso cada abertura de menu pediria a rede antes de
 * desenhar o item.
 */
interface NotasState {
  /** por id do alvo; só as não vazias (mesmo formato do `GET /users/me/notes`). */
  minhasNotas: NotasDeUsuario;
  loading: boolean;
  loaded: boolean;

  load: (force?: boolean) => Promise<void>;
  /** a minha nota sobre alguém, ou string vazia — para preencher o campo do modal. */
  nota: (userId: string) => string;
  /** grava a nota; texto vazio (depois do trim) apaga. Devolve se deu certo. */
  salvar: (userId: string, texto: string) => Promise<boolean>;

  /** `user.noteUpdated`: eu salvei/apaguei em outra conexão da conta. */
  handleUpdated: (evento: NotaDeUsuario) => void;
  clear: () => void;
}

export const useNotas = create<NotasState>((set, get) => ({
  minhasNotas: {},
  loading: false,
  loaded: false,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    set({ loading: true });
    try {
      const minhasNotas = await api.minhasNotas();
      set({ minhasNotas, loading: false, loaded: true });
    } catch (e) {
      set({ loading: false });
      ui.toast(errorMessage(e, "Não foi possível carregar suas notas"), "error");
    }
  },

  nota: (userId) => get().minhasNotas[userId] ?? "",

  salvar: async (userId, texto) => {
    try {
      const evento = await api.salvarNotaDeUsuario(userId, texto);
      get().handleUpdated(evento);
      return true;
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível salvar a nota"), "error");
      return false;
    }
  },

  handleUpdated: ({ userId, nota }) =>
    set((s) => {
      const minhasNotas = { ...s.minhasNotas };
      if (nota) minhasNotas[userId] = nota;
      else delete minhasNotas[userId];
      return { minhasNotas };
    }),

  clear: () => set({ minhasNotas: {}, loading: false, loaded: false }),
}));
