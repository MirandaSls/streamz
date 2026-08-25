import { create } from "zustand";
import { WS_EVENTS, type PublicUser } from "@newdisc/shared";
import { emit } from "@/stores/socket-adapter";

/**
 * "Fulano está digitando…" por canal.
 *
 * O gateway repassa `typing` para quem está na sala; cada aviso vale por
 * alguns segundos e é renovado enquanto a pessoa digita. Quem digita emite no
 * máximo um aviso a cada `THROTTLE_MS` — o Discord usa o mesmo desenho.
 */

/** Por quanto tempo um aviso conta como "ainda digitando". */
export const TYPING_TTL_MS = 6_000;
/** Intervalo mínimo entre dois avisos do próprio usuário. */
export const THROTTLE_MS = 3_000;

interface Typer {
  user: Pick<PublicUser, "id" | "username">;
  until: number;
}

interface TypingState {
  byChannel: Record<string, Record<string, Typer>>;
  apply: (channelId: string, user: Pick<PublicUser, "id" | "username">, now?: number) => void;
  /** Remove avisos vencidos; devolve true se algo mudou. */
  prune: (now?: number) => boolean;
  clear: () => void;
}

export const useTyping = create<TypingState>((set, get) => ({
  byChannel: {},

  apply: (channelId, user, now = Date.now()) =>
    set((s) => ({
      byChannel: {
        ...s.byChannel,
        [channelId]: { ...(s.byChannel[channelId] ?? {}), [user.id]: { user, until: now + TYPING_TTL_MS } },
      },
    })),

  prune: (now = Date.now()) => {
    const current = get().byChannel;
    let changed = false;
    const next: TypingState["byChannel"] = {};
    for (const [channelId, typers] of Object.entries(current)) {
      const kept: Record<string, Typer> = {};
      for (const [id, t] of Object.entries(typers)) {
        if (t.until > now) kept[id] = t;
        else changed = true;
      }
      if (Object.keys(kept).length) next[channelId] = kept;
    }
    if (changed) set({ byChannel: next });
    return changed;
  },

  clear: () => set({ byChannel: {} }),
}));

const lastEmit = new Map<string, number>();

/** Avisa o canal que estou digitando (no máximo um aviso a cada 3s). */
export function emitTyping(channelId: string, now = Date.now()): void {
  const last = lastEmit.get(channelId) ?? 0;
  if (now - last < THROTTLE_MS) return;
  lastEmit.set(channelId, now);
  emit(WS_EVENTS.TYPING, { channelId });
}

/** Nomes de quem está digitando no canal, exceto o próprio usuário. */
export function typersOf(
  byChannel: TypingState["byChannel"],
  channelId: string,
  meId?: string,
): string[] {
  const typers = byChannel[channelId];
  if (!typers) return [];
  return Object.values(typers)
    .filter((t) => t.user.id !== meId)
    .map((t) => t.user.username);
}
