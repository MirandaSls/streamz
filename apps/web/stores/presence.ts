import { create } from "zustand";
import type { PublicUser, UserStatus } from "@newdisc/shared";

/**
 * Presença e perfil ao vivo, separados das listas.
 *
 * `presence.update` e `user.updated` chegam para qualquer usuário conhecido —
 * inclusive de outro servidor. Guardar mapas `userId → status` e `userId →
 * perfil` evita ter que varrer e reescrever `members`, `channels`, `messages`
 * a cada mudança, e mantém o valor correto mesmo se as listas forem
 * recarregadas depois.
 */
interface PresenceState {
  statuses: Record<string, UserStatus>;
  /** perfis mais recentes que os das listas (nome de exibição, avatar). */
  profiles: Record<string, PublicUser>;
  apply: (userId: string, status: UserStatus) => void;
  applyProfile: (user: PublicUser) => void;
  /** Semeia o mapa com o status que veio junto do fetch (REST). */
  seed: (users: Pick<PublicUser, "id" | "status">[]) => void;
}

export const usePresence = create<PresenceState>((set) => ({
  statuses: {},
  profiles: {},

  apply: (userId, status) =>
    set((s) => (s.statuses[userId] === status
      ? s
      : { statuses: { ...s.statuses, [userId]: status } })),

  applyProfile: (user) =>
    set((s) => ({
      profiles: { ...s.profiles, [user.id]: user },
      statuses: { ...s.statuses, [user.id]: user.status },
    })),

  seed: (users) =>
    set((s) => {
      const next = { ...s.statuses };
      for (const u of users) {
        // o valor vindo do WS é mais recente que o do REST — não sobrescreve
        if (next[u.id] === undefined) next[u.id] = u.status;
      }
      return { statuses: next };
    }),
}));

/**
 * Status a exibir: o do WS, se já vimos algum; senão o que veio do REST.
 * Recebe o mapa por parâmetro (em vez de ler o estado) para que o componente
 * que chama continue reagindo às mudanças via `usePresence`.
 */
export function resolveStatus(
  statuses: Record<string, UserStatus>,
  user: Pick<PublicUser, "id" | "status">,
): UserStatus {
  return statuses[user.id] ?? user.status;
}

/** Perfil a exibir: o do WS (`user.updated`) se já chegou; senão o da lista. */
export function resolveUser(profiles: Record<string, PublicUser>, user: PublicUser): PublicUser {
  return profiles[user.id] ?? user;
}

/** Hook: o usuário com nome/avatar/status mais recentes. */
export function useLiveUser(user: PublicUser): PublicUser {
  const profile = usePresence((s) => s.profiles[user.id]);
  const status = usePresence((s) => s.statuses[user.id]);
  const base = profile ?? user;
  return status && status !== base.status ? { ...base, status } : base;
}
