import { create } from "zustand";
import type { AuthTokens, PublicUser } from "@newdisc/shared";
import { api } from "@/lib/api";

interface AuthState {
  user: PublicUser | null;
  setSession: (user: PublicUser, tokens: AuthTokens) => void;
  loadFromStorage: () => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,

  setSession: (user, tokens) => {
    localStorage.setItem("accessToken", tokens.accessToken);
    localStorage.setItem("refreshToken", tokens.refreshToken);
    localStorage.setItem("user", JSON.stringify(user));
    set({ user });
  },

  loadFromStorage: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("user");
    if (raw) set({ user: JSON.parse(raw) as PublicUser });
  },

  logout: () => {
    // revoga o refresh token no servidor (best-effort) antes de limpar a sessão
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) api.logout(refreshToken).catch(() => {});
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    set({ user: null });
  },
}));
