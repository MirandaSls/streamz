import { io, type Socket } from "socket.io-client";
import { WS_EVENTS } from "@newdisc/shared";
import { WS_URL } from "./config";
import { getAccessToken, renovarTokens } from "./session";

/**
 * Conexão única com o gateway, resiliente a queda de rede e a token expirado.
 *
 * Duas armadilhas motivam o desenho:
 *  - o token do handshake precisa ser lido *a cada* conexão (`auth` como função);
 *    lido uma vez só, a reconexão tentaria autenticar com um token já vencido;
 *  - salas do Socket.IO não sobrevivem à reconexão, então o cliente guarda quais
 *    canais quer acompanhar e re-emite `CHANNEL_JOIN` em todo `connect` — sem
 *    isso o usuário volta "conectado" e simplesmente para de receber mensagens.
 */

let socket: Socket | null = null;

/** Canais que o cliente quer acompanhar — fonte de verdade para o rejoin. */
const salas = new Set<string>();

const ouvintesReconexao = new Set<() => void>();

/** Diferencia a primeira conexão das reconexões (só estas re-sincronizam). */
let jaConectou = false;

/** Uma tentativa de refresh por ciclo de conexão, para não entrar em laço. */
let tentouRenovar = false;

export function getSocket(): Socket {
  if (socket) return socket;

  const s = io(WS_URL, {
    // função, não objeto: o Socket.IO chama a cada (re)conexão
    auth: (cb: (dados: Record<string, unknown>) => void) => {
      getAccessToken()
        .then((token) => cb({ token: token ?? "" }))
        .catch(() => cb({ token: "" }));
    },
    autoConnect: true,
    transports: ["websocket"],
  });

  s.on("connect", () => {
    tentouRenovar = false;
    for (const channelId of salas) s.emit(WS_EVENTS.CHANNEL_JOIN, channelId);
    if (jaConectou) {
      for (const ouvinte of ouvintesReconexao) {
        try {
          ouvinte();
        } catch {
          // um ouvinte quebrado não pode impedir os demais
        }
      }
    }
    jaConectou = true;
  });

  // handshake recusado (token expirado, entre outros): renova e tenta de novo
  s.on("connect_error", () => void renovarEReconectar(s));

  s.on("disconnect", (motivo) => {
    // o gateway derruba a conexão quando o token não valida; nesse caso o
    // Socket.IO não reconecta sozinho — quem fechou foi o servidor
    if (motivo === "io server disconnect") void renovarEReconectar(s);
  });

  socket = s;
  return s;
}

async function renovarEReconectar(s: Socket): Promise<void> {
  if (tentouRenovar) return;
  tentouRenovar = true;
  try {
    await renovarTokens();
  } catch {
    // sem renovação não adianta reconectar: ou a rede caiu (o Socket.IO segue
    // tentando sozinho) ou a sessão acabou (session.ts já mandou pro login)
    return;
  }
  if (socket === s) s.connect();
}

/** Passa a acompanhar o canal (e a reentrar nele a cada reconexão). */
export function joinChannel(channelId: string): void {
  salas.add(channelId);
  const s = getSocket();
  // desconectado: o handler de `connect` entra em todas as salas de uma vez
  if (s.connected) s.emit(WS_EVENTS.CHANNEL_JOIN, channelId);
}

/** Deixa de acompanhar o canal. */
export function leaveChannel(channelId: string): void {
  salas.delete(channelId);
  if (socket?.connected) socket.emit(WS_EVENTS.CHANNEL_LEAVE, channelId);
}

/**
 * Avisa quando o socket volta do ar (não na primeira conexão), para a UI
 * re-sincronizar o histórico perdido durante a queda. Devolve o cancelamento.
 */
export function onReconnect(ouvinte: () => void): () => void {
  ouvintesReconexao.add(ouvinte);
  return () => ouvintesReconexao.delete(ouvinte);
}

/** Destrói o singleton — obrigatório no logout, senão a próxima sessão herda
 *  uma conexão autenticada como o usuário anterior. */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  salas.clear();
  jaConectou = false;
  tentouRenovar = false;
}
