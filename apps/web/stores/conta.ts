import { create } from "zustand";
import type { MinhaConta } from "@streamz/shared";
import { api } from "@/lib/api";
import { errorMessage } from "@/stores/socket-adapter";
import { ui } from "@/stores/ui";

/**
 * `MinhaConta` — e-mail, verificação, 2FA e códigos de recuperação.
 *
 * Existe como store (e não como `useState` das abas de configurações) porque a
 * conta é da **pessoa**, não da aba: o evento `account.updated` chega a todas
 * as conexões da conta, e sem um lugar comum para guardá-la o desktop
 * continuaria mostrando "e-mail não verificado" depois de o site verificar.
 *
 * `aplicar` é idempotente: o servidor manda a conta inteira, então aplicar o
 * mesmo evento duas vezes dá o mesmo estado — inclusive na conexão que fez a
 * mudança e já tinha a resposta HTTP em mãos.
 */
interface ContaState {
  conta: MinhaConta | null;
  /** Busca a conta no servidor (as abas chamam ao montar). */
  carregar: () => Promise<void>;
  /** Guarda a conta que o servidor mandou (resposta de rota ou `account.updated`). */
  aplicar: (conta: MinhaConta) => void;
  clear: () => void;
}

export const useConta = create<ContaState>((set) => ({
  conta: null,

  carregar: async () => {
    try {
      set({ conta: await api.account() });
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível carregar sua conta"), "error");
    }
  },

  aplicar: (conta) => set({ conta }),

  clear: () => set({ conta: null }),
}));
