import { io, type Socket } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3333";

let socket: Socket | null = null;

/** Conexão única, autenticada pelo token no handshake. */
export function getSocket(): Socket {
  if (socket) return socket;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  socket = io(WS_URL, {
    auth: { token },
    autoConnect: true,
    transports: ["websocket"],
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
