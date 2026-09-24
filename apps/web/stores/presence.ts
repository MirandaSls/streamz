import { useEffect, useRef } from "react";
import { create } from "zustand";
import { IDLE_APOS_MS } from "@streamz/shared";
import type { PublicUser, UserStatus } from "@streamz/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

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

// ── d-social ── presença rica: ausente automático

/** Chave por usuário da marca "fui eu, o auto-idle, que pus IDLE". */
function chaveAutoIdle(userId: string): string {
  return `streamz:auto-idle:${userId}`;
}

// localStorage (não sessionStorage: o app desktop Tauri reabre com sessão
// nova, e a sessão web comum sobrevive a F5/reload) — tudo em try/catch com
// fallback ao comportamento em memória, porque o storage pode estar
// indisponível (aba privada, quota, etc).

function lerPostoArmazenado(userId: string): boolean {
  try {
    return localStorage.getItem(chaveAutoIdle(userId)) === "1";
  } catch {
    return false;
  }
}

function gravarPostoArmazenado(userId: string): void {
  try {
    localStorage.setItem(chaveAutoIdle(userId), "1");
  } catch {
    // sem storage disponível: a marca fica só em memória (posto.current)
  }
}

function limparPostoArmazenado(userId: string): void {
  try {
    localStorage.removeItem(chaveAutoIdle(userId));
  } catch {
    // idem
  }
}

/**
 * Marca o usuário como **Ausente** depois de `IDLE_APOS_MS` sem interação na
 * aba, e o traz de volta ao primeiro sinal de vida — é o "ausente automático"
 * do Discord.
 *
 * Quem detecta é o cliente (o servidor só vê o socket aberto, que continua
 * aberto com a aba esquecida). Só mexemos em quem *não* escolheu um status: um
 * "Não perturbe" ou "Invisível" explícito não pode ser sobrescrito por
 * inatividade. E ao voltar só desfazemos o ausente que nós mesmos pusemos.
 */
export function useAutoIdle(enabled: boolean): void {
  const posto = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const userId = useAuth.getState().user?.id;

    // A marca `posto.current` vivia só em memória: se o componente remonta
    // enquanto o status está IDLE (F5, reabrir o app desktop, aba
    // descartada), ela voltava a `false` e ninguém restaurava o ONLINE nem
    // reagendava um novo auto-idle — o usuário ficava preso em ausente. Por
    // isso ela é lida do localStorage no início, mas só é confiável se o
    // status atual ainda for IDLE; senão a chave é lixo de uma sessão
    // anterior (ex.: alguém escolheu outro status manual enquanto o app
    // estava fechado) e é descartada.
    if (userId) {
      const armazenado = lerPostoArmazenado(userId);
      const me = useAuth.getState().user;
      posto.current = armazenado && me?.status === "IDLE";
      if (armazenado && !posto.current) limparPostoArmazenado(userId);
    } else {
      posto.current = false;
    }

    let timer: number | undefined;

    async function aplicar(status: UserStatus | null) {
      try {
        const atualizado = await api.updateStatus(status);
        useAuth.getState().setUser(atualizado);
      } catch {
        // presença é informação de conforto: falhar aqui não merece um aviso
      }
    }

    function ficarAusente() {
      const me = useAuth.getState().user;
      // manualStatus não vem no PublicUser; o proxy é o status efetivo: só
      // promovemos a ausente quem está simplesmente online
      if (!me || me.status !== "ONLINE" || posto.current) return;
      posto.current = true;
      if (userId) gravarPostoArmazenado(userId);
      void aplicar("IDLE");
    }

    function voltar() {
      if (posto.current) {
        posto.current = false;
        if (userId) limparPostoArmazenado(userId);
        void aplicar(null);
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(ficarAusente, IDLE_APOS_MS);
    }

    const eventos = ["mousemove", "keydown", "mousedown", "wheel", "touchstart", "focus"] as const;
    for (const e of eventos) window.addEventListener(e, voltar, { passive: true });
    document.addEventListener("visibilitychange", voltar);
    timer = window.setTimeout(ficarAusente, IDLE_APOS_MS);

    // Se o usuário escolher um status manual por outro caminho (ex.: menu de
    // status) enquanto ainda estamos "donos" do IDLE, a marca fica obsoleta
    // e precisa sumir — senão uma futura interação chamaria `aplicar(null)`
    // e apagaria a escolha manual dele. Comparamos com o status ANTERIOR
    // (só dispara quando ele estava IDLE e deixou de estar): `ficarAusente`
    // marca `posto.current = true` antes do `await` de `aplicar("IDLE")`, e
    // nessa janela o status ainda é ONLINE — qualquer outra atualização do
    // useAuth nesse meio-tempo (refresh de token, perfil) não pode ser lida
    // como "saiu do IDLE" e apagar a marca que acabamos de gravar.
    const desinscrever = userId
      ? useAuth.subscribe((state, prev) => {
          if (
            posto.current &&
            prev.user?.status === "IDLE" &&
            state.user &&
            state.user.status !== "IDLE"
          ) {
            posto.current = false;
            limparPostoArmazenado(userId);
          }
        })
      : undefined;

    return () => {
      window.clearTimeout(timer);
      for (const e of eventos) window.removeEventListener(e, voltar);
      document.removeEventListener("visibilitychange", voltar);
      desinscrever?.();
    };
  }, [enabled]);
}
