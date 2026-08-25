import { create } from "zustand";
import type { PublicUser, UserStatus } from "@newdisc/shared";

/**
 * Presença ao vivo, separada da lista de membros.
 *
 * O evento `presence.update` chega para qualquer usuário conhecido — inclusive
 * de outro servidor. Guardar um mapa `userId → status` evita ter que varrer e
 * reescrever `members` a cada piscada de alguém, e mantém o status correto
 * mesmo se a lista de membros for recarregada depois.
 */
interface PresenceState {
  statuses: Record<string, UserStatus>;
  apply: (userId: string, status: UserStatus) => void;
  /** Semeia o mapa com o status que veio junto do fetch (REST). */
  seed: (users: Pick<PublicUser, "id" | "status">[]) => void;
}

export const usePresence = create<PresenceState>((set) => ({
  statuses: {},

  apply: (userId, status) =>
    set((s) => (s.statuses[userId] === status
      ? s
      : { statuses: { ...s.statuses, [userId]: status } })),

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
