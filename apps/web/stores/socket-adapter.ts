import { WS_EVENTS } from "@newdisc/shared";
import { getSocket } from "@/lib/socket";

/**
 * Camada fina sobre `lib/socket.ts`.
 *
 * O socket é dono do agente B; aqui só embrulhamos o que as stores consomem
 * (`joinChannel`, `leaveChannel`, `onReconnect`, `emit`, `on`) para que o
 * restante da web não dependa da forma do cliente Socket.IO. Quando `lib/socket`
 * expuser essas funções nativamente, estes wrappers passam a delegar e nada
 * mais muda.
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

/**
 * Executa `cb` a cada *re*conexão (nunca na primeira). Usamos o evento do
 * manager (`socket.io`) em vez de `connect` justamente porque `connect` também
 * dispara na conexão inicial, quando não há nada para ressincronizar.
 */
export function onReconnect(cb: () => void): () => void {
  const socket = clientSocket();
  if (!socket) return () => {};
  const handler = () => cb();
  socket.io.on("reconnect", handler);
  return () => {
    socket.io.off("reconnect", handler);
  };
}

/** Sala do canal atualmente escutada — para sair dela ao trocar de canal. */
let joined: string | null = null;

export function joinChannel(channelId: string): void {
  if (joined === channelId) return;
  if (joined) leaveChannel(joined);
  emit(WS_EVENTS.CHANNEL_JOIN, channelId);
  joined = channelId;
}

export function leaveChannel(channelId: string): void {
  emit(WS_EVENTS.CHANNEL_LEAVE, channelId);
  if (joined === channelId) joined = null;
}

/** Canal cuja sala está aberta (usado para reentrar após reconexão). */
export function joinedChannel(): string | null {
  return joined;
}

/** Reentra na sala atual — o servidor esquece as salas a cada reconexão. */
export function rejoinChannel(): void {
  if (joined) emit(WS_EVENTS.CHANNEL_JOIN, joined);
}

/**
 * Mensagem legível de um erro do cliente HTTP. Enquanto `lib/api` não exporta
 * um `ApiError` tipado, extraímos do `Error` que ele lança hoje.
 */
export function errorMessage(e: unknown, fallback = "Algo deu errado"): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}
