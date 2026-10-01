import { useEffect, useRef } from "react";
import { create } from "zustand";
import { IDLE_APOS_MS } from "@streamz/shared";
import type { PublicUser, StatusDuration, UserStatus } from "@streamz/shared";
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
 * Quem limpa a marca em memória do `useAutoIdle` montado agora. É um ouvinte
 * de módulo (e não um estado de store) porque só existe um hook ativo por aba
 * e a marca é detalhe interno dele — ninguém mais precisa *ler* esse valor, só
 * pedir que ele seja esquecido quando o usuário escolhe um status à mão.
 */
let esquecerMarcaDoHook: (() => void) | null = null;

/**
 * Caminho dos seletores de status manual (menu do perfil, modal de status,
 * telas do mobile). Escolher um status à mão tira do auto-idle a posse do
 * ausente: sem apagar a marca, a próxima mexida no mouse chamaria
 * `updateStatus(null)` e desfaria a escolha do usuário. Apagamos *antes* do
 * request para que nenhuma volta em voo encadeada ao ausente dispare depois.
 * Erros propagam — quem chama mostra o aviso.
 */
export async function definirStatusManual(
  valor: UserStatus | null,
  duracao?: StatusDuration,
): Promise<PublicUser> {
  const userId = useAuth.getState().user?.id;
  if (userId) limparPostoArmazenado(userId);
  esquecerMarcaDoHook?.();
  const atualizado = duracao ? await api.updateStatus(valor, duracao) : await api.updateStatus(valor);
  useAuth.getState().setUser(atualizado);
  return atualizado;
}

/**
 * Marca o usuário como **Ausente** depois de `IDLE_APOS_MS` sem interação na
 * aba, e o traz de volta ao primeiro sinal de vida — é o "ausente automático"
 * do Discord.
 *
 * Quem detecta é o cliente (o servidor só vê o socket aberto, que continua
 * aberto com a aba esquecida). Só mexemos em quem *não* escolheu um status: um
 * "Não perturbe" ou "Invisível" explícito não pode ser sobrescrito por
 * inatividade. E ao voltar só desfazemos o ausente que nós mesmos pusemos —
 * a "marca", que só some quando desfazemos, quando fica comprovadamente
 * obsoleta ou quando o usuário escolhe um status por `definirStatusManual`.
 */
export function useAutoIdle(enabled: boolean): void {
  const posto = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const userId = useAuth.getState().user?.id;

    // A marca vive também no localStorage para sobreviver a remontagens (F5,
    // reabrir o app desktop, aba descartada) — sem isso ninguém restaurava o
    // ONLINE e o usuário ficava preso em ausente. Ela é aceita sem olhar o
    // status: o `user` aqui pode ter vindo do cache local (`loadFromStorage`)
    // com um status velho, e descartar a marca por ele era outra forma de
    // prender o usuário. Se ela for mesmo obsoleta, `voltar()` descobre pelo
    // status real e a apaga sem chamar a API.
    posto.current = userId ? lerPostoArmazenado(userId) : false;

    let timer: number | undefined;
    // Pedido de IDLE ainda sem resposta: nessa janela o status continua
    // ONLINE, então `voltar()` não consegue distinguir "ausente em voo" de
    // "marca obsoleta" pelo status — precisa saber do pedido.
    let ausenteEmVoo: Promise<void> | null = null;
    // Volta pedida durante o voo; `definirStatusManual` a cancela para não
    // atropelar a escolha manual quando o IDLE terminar.
    let desfazerAposVoo = false;

    function esquecerMarca() {
      posto.current = false;
      desfazerAposVoo = false;
      if (userId) limparPostoArmazenado(userId);
    }
    esquecerMarcaDoHook = esquecerMarca;

    // `aindaVale` deixa o IDLE em voo desistir de gravar no store se, enquanto
    // ele viajava, o usuário escolheu um status à mão: a resposta velha
    // chegaria depois e pintaria "Ausente" por cima da escolha.
    async function aplicar(status: UserStatus | null, aindaVale: () => boolean = () => true) {
      try {
        const atualizado = await api.updateStatus(status);
        if (aindaVale()) useAuth.getState().setUser(atualizado);
      } catch {
        // presença é informação de conforto: falhar aqui não merece um aviso
      }
    }

    function ficarAusente() {
      const me = useAuth.getState().user;
      // manualStatus não vem no PublicUser; o proxy é o status efetivo: só
      // promovemos a ausente quem está simplesmente online. Não olhamos a
      // marca: com status ONLINE e nada em voo ela é obsoleta (IDLE que
      // falhou, cache velho) e remarcar é o certo.
      if (!me || me.status !== "ONLINE" || ausenteEmVoo) return;
      posto.current = true;
      if (userId) gravarPostoArmazenado(userId);
      ausenteEmVoo = aplicar("IDLE", () => posto.current || desfazerAposVoo).then(() => {
        ausenteEmVoo = null;
        if (desfazerAposVoo) {
          desfazerAposVoo = false;
          void aplicar(null);
        }
      });
    }

    function voltar() {
      if (posto.current) {
        if (ausenteEmVoo) {
          // o usuário voltou antes do IDLE chegar ao servidor: encadeia a
          // volta em vez de disparar agora, senão o IDLE poderia ser gravado
          // por último e ficar para sempre
          posto.current = false;
          if (userId) limparPostoArmazenado(userId);
          desfazerAposVoo = true;
        } else {
          const status = useAuth.getState().user?.status;
          if (status === "IDLE") {
            // limpar antes de chamar: numa rajada de mousemove só o primeiro
            // evento desfaz
            esquecerMarca();
            void aplicar(null);
          } else if (status !== "OFFLINE") {
            // ONLINE/DND: alguém escolheu outro status (outro aparelho, outra
            // aba) e a marca não vale mais — não há o que desfazer
            esquecerMarca();
          }
          // OFFLINE: socket caído (suspensão, rede). A marca fica: ao
          // reconectar o servidor reaplica o IDLE gravado como manualStatus,
          // e a próxima interação o desfaz. Apagar aqui era o que prendia o
          // usuário em ausente.
        }
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(ficarAusente, IDLE_APOS_MS);
    }

    // Esconder a aba (alt-tab, minimizar) também dispara `visibilitychange` —
    // mas sair da janela não é atividade, é o oposto. Só contamos como volta
    // quando ela fica `visible` de novo; ao esconder não fazemos nada, e o
    // timer de ausente já agendado continua correndo (pode marcar ausente com
    // a aba escondida, igual ao Discord).
    function aoMudarVisibilidade() {
      if (document.visibilityState === "visible") voltar();
    }

    const eventos = ["mousemove", "keydown", "mousedown", "wheel", "touchstart", "focus"] as const;
    for (const e of eventos) window.addEventListener(e, voltar, { passive: true });
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    timer = window.setTimeout(ficarAusente, IDLE_APOS_MS);

    return () => {
      window.clearTimeout(timer);
      for (const e of eventos) window.removeEventListener(e, voltar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      if (esquecerMarcaDoHook === esquecerMarca) esquecerMarcaDoHook = null;
    };
  }, [enabled]);
}
