import { CALL_RING_TIMEOUT_MS, type CallEndedEvent, type PublicUser } from "@streamz/shared";

/**
 * Máquina de estados de uma chamada em conversa direta — a parte pura.
 *
 * A chamada tem uma vida curta e cheia de corrida: o outro pode aceitar
 * enquanto você desiste, o toque pode expirar depois de a pessoa entrar, dois
 * eventos podem chegar fora de ordem. Concentrar as transições num redutor
 * puro é o que impede a UI de ficar "tocando" para sempre — e o que permite
 * testar cada corrida dessas sem browser.
 *
 * Regra que rege as transições: **evento de outro canal é ignorado**. Só o
 * canal da chamada corrente move a máquina.
 */

export type CallPhase =
  /** nenhuma chamada. */
  | "idle"
  /** eu liguei e estou esperando alguém atender. */
  | "outgoing"
  /** está tocando para mim. */
  | "incoming"
  /** conectado (há mídia ou pelo menos gente na sala). */
  | "active"
  /** acabou: guarda o motivo até a UI mostrar e voltar a `idle`. */
  | "ended";

export interface CallState {
  phase: CallPhase;
  channelId: string | null;
  /** quem ligou — só faz sentido em `incoming`. */
  from: PublicUser | null;
  /** quando a fase atual começou (para o cronômetro e para o timeout do toque). */
  since: number | null;
  reason: CallEndedEvent["reason"] | null;
}

export const CHAMADA_INICIAL: CallState = {
  phase: "idle",
  channelId: null,
  from: null,
  since: null,
  reason: null,
};

export type CallAction =
  /** eu comecei uma chamada neste canal. */
  | { type: "start"; channelId: string }
  /** chegou um toque de alguém. */
  | { type: "ring"; channelId: string; from: PublicUser }
  /** atendi o toque. */
  | { type: "accept" }
  /** recusei o toque. */
  | { type: "decline" }
  /** há gente na sala: a chamada está de pé. */
  | { type: "connected"; channelId: string }
  /** a chamada terminou (recusada, desligada ou expirada). */
  | { type: "ended"; channelId: string; reason: CallEndedEvent["reason"] }
  /** ninguém atendeu no tempo do toque. */
  | { type: "timeout" }
  /** a UI já mostrou o desfecho; volta ao repouso. */
  | { type: "reset" };

export function callReducer(state: CallState, action: CallAction, now: number): CallState {
  switch (action.type) {
    case "start":
      return { phase: "outgoing", channelId: action.channelId, from: null, since: now, reason: null };

    case "ring":
      // já estou em chamada: um toque de outra conversa não interrompe
      if (state.phase === "active" || state.phase === "outgoing") return state;
      return {
        phase: "incoming",
        channelId: action.channelId,
        from: action.from,
        since: now,
        reason: null,
      };

    case "accept":
      if (state.phase !== "incoming") return state;
      return { ...state, phase: "active", since: now, reason: null };

    case "decline":
      if (state.phase !== "incoming") return state;
      return { ...state, phase: "ended", since: now, reason: "declined" };

    case "connected":
      // "alguém entrou na sala" só confirma a chamada que já é a minha
      if (state.channelId !== action.channelId) return state;
      if (state.phase !== "outgoing" && state.phase !== "incoming" && state.phase !== "active") {
        return state;
      }
      return { ...state, phase: "active", since: state.phase === "active" ? state.since : now };

    case "ended":
      if (state.channelId !== action.channelId || state.phase === "idle") return state;
      return { ...state, phase: "ended", since: now, reason: action.reason };

    case "timeout":
      // só o toque expira; uma chamada já ativa não morre de tempo
      if (state.phase !== "outgoing" && state.phase !== "incoming") return state;
      return { ...state, phase: "ended", since: now, reason: "timeout" };

    case "reset":
      return CHAMADA_INICIAL;
  }
}

/** O toque estourou o tempo? (Vale para quem liga e para quem recebe.) */
export function toqueExpirou(
  state: CallState,
  now: number,
  timeoutMs: number = CALL_RING_TIMEOUT_MS,
): boolean {
  if (state.phase !== "outgoing" && state.phase !== "incoming") return false;
  return state.since !== null && now - state.since >= timeoutMs;
}

/** Frase do desfecho, para o aviso que a UI mostra quando a chamada acaba. */
export function motivoDoFim(state: CallState): string | null {
  switch (state.reason) {
    case "declined":
      return "Chamada recusada";
    case "timeout":
      return "Ninguém atendeu";
    case "ended":
      return "Chamada encerrada";
    default:
      return null;
  }
}
