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
 *
 * `carregando`/`falhouCarregar` (rodada de correção conta-seguranca-perfil):
 * antes `carregar` só avisava erro por toast e nunca relançava, então
 * `ContaTab` e `SegurancaTab` cada uma reimplementava um `useState` local e
 * deduzia erro pela heurística "a busca terminou e a conta continua `null`"
 * — funcionava, mas duplicada, e cada cópia tinha a sua própria janela de
 * corrida. Agora o status mora aqui, uma vez, e as duas abas só leem.
 * `carregando` começa `true` (não `false`): a store é um singleton para o app
 * inteiro, e a primeira aba a montar ainda não chamou `carregar()`, então o
 * primeiro render tem de mostrar "carregando", não deduzir erro de um par
 * `carregando=false, conta=null` que só existe porque a busca nem começou.
 * `falhouCarregar` só fica `true` dentro do `catch`; um `carregar()` novo
 * (o "Tentar de novo") zera os dois de novo antes de tentar.
 */
interface ContaState {
  conta: MinhaConta | null;
  /** A busca atual (primeira ou "Tentar de novo") ainda não terminou. */
  carregando: boolean;
  /** A última busca terminou em erro — só vale depois que `carregando` volta a `false`. */
  falhouCarregar: boolean;
  /** Busca a conta no servidor (as abas chamam ao montar). */
  carregar: () => Promise<void>;
  /** Guarda a conta que o servidor mandou (resposta de rota ou `account.updated`). */
  aplicar: (conta: MinhaConta) => void;
  clear: () => void;
}

export const useConta = create<ContaState>((set) => ({
  conta: null,
  carregando: true,
  falhouCarregar: false,

  carregar: async () => {
    set({ carregando: true, falhouCarregar: false });
    try {
      set({ conta: await api.account() });
    } catch (e) {
      ui.toast(errorMessage(e, "Não foi possível carregar sua conta"), "error");
      set({ falhouCarregar: true });
    } finally {
      set({ carregando: false });
    }
  },

  aplicar: (conta) => set({ conta }),

  // volta pro estado de antes do primeiro `carregar()` (`carregando: true`,
  // sem erro): sem isto, deslogar depois de uma busca que tinha falhado
  // deixaria `falhouCarregar` preso em `true` até o próximo `carregar()`
  // — um frame de aviso de erro por cima da tela de login de outra pessoa,
  // na mesma aba do navegador.
  clear: () => set({ conta: null, carregando: true, falhouCarregar: false }),
}));
