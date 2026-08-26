import { create } from "zustand";
import type { AuthTokens, PublicUser } from "@streamz/shared";
import { api } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import { aoExpirarSessao, lerRefreshToken, limparTokens, salvarTokens } from "@/lib/session";

const CHAVE_USUARIO = "user";

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
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(user));
    set({ user });
  },

  setUser: (user) => {
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(user));
    set({ user });
  },

  loadFromStorage: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(CHAVE_USUARIO);
    if (raw) set({ user: JSON.parse(raw) as PublicUser });
  },

  logout: () => {
    // revoga o refresh token no servidor (best-effort) antes de limpar a sessão
    const refreshToken = lerRefreshToken();
    if (refreshToken) api.logout(refreshToken).catch(() => {});
    disconnectSocket();
    limparTokens();
    localStorage.removeItem(CHAVE_USUARIO);
    set({ user: null });
  },
}));

// Sessão encerrada pelo lado da rede (refresh recusado): os tokens já foram
// apagados por session.ts — resta derrubar o socket e zerar o usuário em memória
// para a UI não seguir renderizando uma sessão que não existe mais.
aoExpirarSessao(() => {
  disconnectSocket();
  if (typeof window !== "undefined") localStorage.removeItem(CHAVE_USUARIO);
  useAuth.setState({ user: null });
});
