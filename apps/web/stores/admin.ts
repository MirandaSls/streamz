import { create } from "zustand";
import { api } from "@/lib/api";

/**
 * Sou administrador da instância?
 *
 * Uma pergunta só, respondida por `GET /admin/me`, que decide se as abas de
 * administração aparecem nas configurações. Mora num store — e não num
 * `useState` da tela de configurações — para a resposta sobreviver a fechar e
 * reabrir a tela: é um fato da sessão, não do modal.
 *
 * `null` é "ainda não perguntei", e é diferente de `false`: enquanto for null a
 * tela não desenha as abas **nem** afirma que elas não existem. Erro de rede
 * cai em `false` de propósito — na dúvida, o painel não aparece; a autorização
 * de verdade está no servidor, aqui é só o que se desenha.
 */
interface AdminState {
  admin: boolean | null;
  carregar: () => Promise<void>;
  limpar: () => void;
}

let emVoo: Promise<void> | null = null;

export const useAdmin = create<AdminState>((set, get) => ({
  admin: null,

  carregar: async () => {
    if (get().admin !== null) return;
    // duas abas de configuração montando ao mesmo tempo não fazem duas viagens
    emVoo ??= api
      .adminMe()
      .then(({ admin }) => set({ admin }))
      .catch(() => set({ admin: false }))
      .finally(() => {
        emVoo = null;
      });
    return emVoo;
  },

  limpar: () => set({ admin: null }),
}));
