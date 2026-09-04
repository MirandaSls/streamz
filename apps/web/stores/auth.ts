import { create } from "zustand";
import type { AuthTokens, PublicUser } from "@streamz/shared";
import { api } from "@/lib/api";
import { useAdmin } from "@/stores/admin";
import { useConta } from "@/stores/conta";
import { disconnectSocket } from "@/lib/socket";
import { aoExpirarSessao, lerRefreshToken, limparTokens, salvarTokens } from "@/lib/session";
import { atualizarPerfil, guardarConta, mudarCofre, removerConta } from "@/lib/contas";
import {
  lerUsuarioGuardado,
  limparUsuarioGuardado,
  salvarUsuarioGuardado,
} from "@/lib/usuario-guardado";

interface AuthState {
  user: PublicUser | null;
  setSession: (user: PublicUser, tokens: AuthTokens) => void;
  /** Atualiza o próprio perfil (nome, avatar, status) sem mexer nos tokens. */
  setUser: (user: PublicUser) => void;
  loadFromStorage: () => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,

  setSession: (user, tokens) => {
    // o socket é um singleton autenticado no handshake: sobrevivendo ao login,
    // a nova sessão herdaria a conexão do usuário anterior na mesma aba
    disconnectSocket();
    salvarTokens(tokens);
    // todo login entra no cofre e vira a conta ativa — inclusive o da tela de
    // entrada. É o que faz "Gerenciar contas" já ter a conta certa na lista sem
    // ninguém precisar "adicionar" a que acabou de entrar.
    mudarCofre((cofre) => guardarConta(cofre, user, tokens.refreshToken));
    salvarUsuarioGuardado(user);
    set({ user });
  },

  setUser: (user) => {
    salvarUsuarioGuardado(user);
    // o cofre desenha o avatar e o nome de cada conta: sem isto, trocar a foto
    // deixaria a antiga no cartão de "Gerenciar contas" até o próximo login
    mudarCofre((cofre) => atualizarPerfil(cofre, user));
    set({ user });
  },

  loadFromStorage: () => {
    if (typeof window === "undefined") return;
    const guardado = lerUsuarioGuardado();
    if (guardado) set({ user: guardado });
  },

  logout: () => {
    // revoga o refresh token no servidor (best-effort) antes de limpar a sessão
    const refreshToken = lerRefreshToken();
    if (refreshToken) api.logout(refreshToken).catch(() => {});
    disconnectSocket();
    limparTokens();
    // sair é sair do aparelho também: a conta some do cofre, senão "Gerenciar
    // contas" ofereceria uma volta com um refresh que acabamos de revogar
    const atual = useAuth.getState().user;
    if (atual) mudarCofre((cofre) => removerConta(cofre, atual.id));
    limparUsuarioGuardado();
    // entrar com outra conta na mesma aba não pode herdar o "sou admin" da
    // anterior — a API recusaria, mas a tela ofereceria abas que não abrem
    useAdmin.getState().limpar();
    // a conta (e-mail, 2FA) é da sessão que acabou: entrar com outra na mesma
    // aba não pode herdar a anterior
    useConta.getState().clear();
    set({ user: null });
  },
}));

// Sessão encerrada pelo lado da rede (refresh recusado): os tokens já foram
// apagados por session.ts — resta derrubar o socket e zerar o usuário em memória
// para a UI não seguir renderizando uma sessão que não existe mais.
aoExpirarSessao(() => {
  disconnectSocket();
  limparUsuarioGuardado();
  useAdmin.getState().limpar();
  useConta.getState().clear();
  useAuth.setState({ user: null });
});
