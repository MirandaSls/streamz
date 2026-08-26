import { WS_EVENTS } from "@streamz/shared";
import {
  getSocket,
  joinChannel as acompanharCanal,
  leaveChannel as deixarCanal,
  onReconnect as aoReconectar,
} from "@/lib/socket";

/**
 * Camada fina sobre `lib/socket.ts`.
 *
 * `lib/socket` é dono da conexão: lê o token a cada handshake, guarda as salas
 * acompanhadas e reentra nelas sozinho a cada `connect`. Aqui só embrulhamos o
 * que as stores consomem (`emit`, `on`, `joinChannel`, `leaveChannel`,
 * `onReconnect`) para que o restante da web não dependa da forma do cliente
 * Socket.IO — e acrescentamos a regra de "um canal de texto aberto por vez".
 */

/** Guarda contra execução no servidor (o socket só existe no browser). */
function clientSocket() {
  if (typeof window === "undefined") return null;
  return getSocket();
}

export function emit(event: string, payload?: unknown): void {
  clientSocket()?.emit(event, payload);
}

/** Registra um listener e devolve a função de remoção. */
export function on<T>(event: string, handler: (payload: T) => void): () => void {
  const socket = clientSocket();
  if (!socket) return () => {};
  socket.on(event, handler as (...args: unknown[]) => void);
  return () => {
    socket.off(event, handler as (...args: unknown[]) => void);
  };
}

/** Executa `cb` a cada *re*conexão (nunca na primeira). Delegado a `lib/socket`. */
export function onReconnect(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  return aoReconectar(cb);
}

/** Sala do canal atualmente aberto — para sair dela ao trocar. */
let joined: string | null = null;

/**
 * Salas que ficam abertas mesmo quando o canal deixa de ser o ativo. São as
 * conversas diretas: o usuário quer continuar recebendo a DM (e ser avisado)
 * enquanto navega pelo servidor. Canal de servidor, ao contrário, só entrega ao
 * vivo enquanto está na tela.
 */
const sticky = new Set<string>();

export function joinChannel(channelId: string, opts: { sticky?: boolean } = {}): void {
  if (opts.sticky) sticky.add(channelId);
  if (joined === channelId) return;
  if (joined && !sticky.has(joined)) leaveChannel(joined);
  acompanharCanal(channelId);
  joined = channelId;
}

export function leaveChannel(channelId: string): void {
  sticky.delete(channelId);
  deixarCanal(channelId);
  if (joined === channelId) joined = null;
}

/** Canal cuja sala está aberta. */
export function joinedChannel(): string | null {
  return joined;
}

/**
 * Mantido por compatibilidade: `lib/socket` já reentra em todas as salas
 * acompanhadas no `connect`, então não há nada a fazer aqui além de garantir
 * que o canal aberto está registrado lá.
 */
export function rejoinChannel(): void {
  if (joined) acompanharCanal(joined);
}

/** Evento de erro do gateway (`ws.error`), para quem quiser escutar por nome. */
export const WS_ERROR_EVENT = WS_EVENTS.ERROR;

/**
 * Mensagem legível de um erro do cliente HTTP. `ApiError` (lib/api-error)
 * estende `Error`, então a mensagem já vem pronta.
 */
export function errorMessage(e: unknown, fallback = "Algo deu errado"): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}
