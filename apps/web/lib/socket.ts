import { io, type Socket } from "socket.io-client";
import { WS_EVENTS } from "@streamz/shared";
import { WS_URL } from "./config";
import { getAccessToken, renovarTokens } from "./session";
import { ouvirSaidaDoApp } from "@/lib/desktop";

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

/** O ouvinte de visibilidade é global e registrado uma vez só. */
let ouvindoVisibilidade = false;
/** Idem para o de saída da página. */
let ouvindoSaida = false;

/**
 * Aba volta do segundo plano: reconecta na hora se o socket tiver caído.
 *
 * Enquanto a aba está oculta o navegador estrangula os timers, e o backoff do
 * Socket.IO pode estar esperando vários segundos para a próxima tentativa. Quem
 * volta para a janela no meio de uma chamada não pode ficar refém desse relógio
 * — a carência da voz no servidor está correndo, e o que a cancela é reconectar.
 */
function observarVisibilidade() {
  if (ouvindoVisibilidade || typeof document === "undefined") return;
  ouvindoVisibilidade = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && socket && !socket.connected) {
      socket.connect();
    }
  });
}

/**
 * Fechar a aba (ou o app) tira da chamada **agora**, não em 45 segundos.
 *
 * O servidor não tem como adivinhar sozinho: a queda de um socket é igual, no
 * fio, quer a pessoa tenha fechado o programa, quer o Wi-Fi tenha oscilado. Por
 * isso ele espera `VOICE_RECONNECT_GRACE_MS` antes de tirar alguém da voz — e
 * quem fechou de verdade ficava 45 s na sala, para todos os outros, marcado
 * como "reconectando", sem nunca voltar.
 *
 * `socket.disconnect()` resolve porque muda o **motivo** que o servidor lê:
 * vira `client namespace disconnect`, e o gateway trata isso como saída pedida
 * (ver `modules/gateway/saida-de-voz.ts`). Sem esta linha o motivo seria
 * `transport close`, indistinguível de uma queda de rede.
 *
 * `pagehide` e não `beforeunload`: é o evento que o iOS realmente dispara, e o
 * único recomendado para trabalho de encerramento. O `persisted` é a ressalva
 * que importa — quando a página vai para o bfcache ela pode voltar inteira, e
 * aí desconectar de propósito tiraria da chamada quem não saiu.
 *
 * É melhor-esforço, como todo trabalho em `pagehide`: se o navegador matar a
 * aba antes de o pacote sair, o servidor cai na carência, que é o que
 * acontecia sempre antes disto.
 */
function observarSaidaDaPagina() {
  // A checagem é pela **função**, e não pelo objeto: um `window` parcial
  // existe de verdade fora do navegador (shims de SSR, dublês de teste,
  // webviews antigos), e `typeof window !== "undefined"` passa por ele.
  if (ouvindoSaida || typeof window?.addEventListener !== "function") return;
  ouvindoSaida = true;
  window.addEventListener("pagehide", (e) => {
    if ((e as PageTransitionEvent).persisted) return;
    socket?.disconnect();
  });
}

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
  observarVisibilidade();
  observarSaidaDaPagina();
  // No app de desktop não há `pagehide` confiável quando o processo encerra: o
  // Rust avisa antes de morrer e espera meio segundo (ver `ouvirSaidaDoApp`).
  // A despedida é a mesma — desconectar de propósito.
  ouvirSaidaDoApp(() => {
    socket?.disconnect();
  });
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
