import { channelLinkPath } from "@streamz/shared";
import { urlPublica } from "@/lib/links-do-app";

/**
 * "Este ambiente faz chamada?" — e, quando não faz, o que dizer.
 *
 * O caso que motivou: o app de desktop para **Linux** roda sobre o WebKitGTK, e
 * as distribuições o compilam sem `ENABLE_WEB_RTC`. Lá `RTCPeerConnection`
 * simplesmente não existe, e o LiveKit não tem como abrir a sala. Antes desta
 * checagem o clique em "entrar na voz" avisava o gateway (os outros te viam na
 * sala), pedia o token e só então caía numa "falha ao conectar" genérica — a
 * pessoa ia investigar a rede quando o que falta é o motor do webview.
 *
 * A detecção é **por capacidade, não por sistema**: um WebKitGTK que um dia
 * venha com WebRTC passa a fazer chamada sem ninguém mexer aqui, e um navegador
 * antigo em qualquer sistema cai no mesmo aviso. O sistema só entra no *texto*.
 *
 * Tudo aqui é puro sobre os argumentos, menos `suportaChamadas`, que é a
 * fronteira com `window` (e a memória da resposta).
 */

/** O pedaço do escopo global que decide — injetável para o teste. */
export interface EscopoDeWebRTC {
  RTCPeerConnection?: unknown;
}

/**
 * A mesma regra do `isBrowserSupported` do `livekit-client` (2.x, em
 * `room/utils.ts`): existe `RTCPeerConnection` **e** o protótipo tem
 * `addTransceiver` ou `addTrack`. Não importamos a função do SDK porque ela lê
 * o global direto — aqui o escopo vem por parâmetro, e é isso que deixa testar
 * "sem WebRTC" num Node que nunca teve WebRTC.
 *
 * `getUserMedia` fica de fora de propósito: sem microfone ainda dá para entrar
 * e ouvir, e quem avisa da captura recusada é o dono do microfone.
 */
export function temWebRTC(escopo: EscopoDeWebRTC | null | undefined): boolean {
  const construtor = escopo?.RTCPeerConnection;
  if (typeof construtor !== "function") return false;
  const prototipo: unknown = construtor.prototype;
  if (!prototipo || typeof prototipo !== "object") return false;
  return "addTransceiver" in prototipo || "addTrack" in prototipo;
}

let respostaGuardada: boolean | null = null;

/**
 * O ambiente atual faz chamada? Memorizado: o motor do webview não ganha nem
 * perde WebRTC com a página aberta, e a pergunta é feita a cada clique.
 *
 * Sem `window` (SSR/export) responde `true` **sem guardar**: no servidor nada
 * conecta, e memorizar ali congelaria um "não" que o cliente nunca disse.
 */
export function suportaChamadas(): boolean {
  if (typeof window === "undefined") return true;
  respostaGuardada ??= temWebRTC(window as unknown as EscopoDeWebRTC);
  return respostaGuardada;
}

/** Só para teste: esquece a resposta memorizada. */
export function esquecerSuporteAChamadas(): void {
  respostaGuardada = null;
}

/** Onde a chamada ia acontecer — é para lá que o navegador abre. */
export interface AlvoDaChamada {
  /** `null` = conversa direta. */
  guildId: string | null;
  channelId: string;
}

export interface AvisoSemChamadas {
  titulo: string;
  mensagem: string;
  /**
   * Oferecer "Abrir no navegador". Só dentro do app: num navegador sem WebRTC
   * mandar "abrir no navegador" é mandar abrir onde já se está.
   */
  abrirNoNavegador: boolean;
}

/** WebKitGTK diz `X11; Linux`; o Android também diz `Linux`, e não é o caso. */
function ehLinux(userAgent: string): boolean {
  return /Linux/i.test(userAgent) && !/Android/i.test(userAgent);
}

/**
 * O texto do aviso. O título nomeia o Linux quando é ele — é o caso real, e
 * "neste app" sozinho deixaria a pessoa achando que o app inteiro está
 * quebrado —, mas a decisão de avisar nunca sai daqui: sai de `temWebRTC`.
 */
export function avisoSemChamadas(args: {
  noApp: boolean;
  userAgent: string;
  alvo: AlvoDaChamada;
}): AvisoSemChamadas {
  const { noApp, userAgent, alvo } = args;
  if (!noApp) {
    return {
      titulo: "Este navegador não faz chamadas de voz",
      mensagem:
        "Falta suporte a WebRTC nele. Use uma versão recente do Chrome, Edge, Firefox ou Safari.",
      abrirNoNavegador: false,
    };
  }
  const onde = alvo.guildId ? "este canal" : "esta conversa";
  return {
    titulo: ehLinux(userAgent)
      ? "Chamadas de voz ainda não funcionam no app para Linux"
      : "Chamadas de voz não funcionam neste app",
    mensagem:
      "O navegador embutido do sistema veio sem WebRTC, que é o que voz, vídeo e " +
      `compartilhamento de tela usam. Abra ${onde} no navegador para entrar na ` +
      "chamada — as mensagens continuam funcionando aqui.",
    abrirNoNavegador: true,
  };
}

/**
 * A URL pública do mesmo canal ou conversa. `origens` só é passado pelo teste;
 * no app vale `origensDoApp`, que põe o domínio público na frente do
 * `tauri.localhost` — este sim não abriria em navegador nenhum.
 */
export function destinoNoNavegador(alvo: AlvoDaChamada, origens?: string[]): string {
  const caminho = channelLinkPath(alvo.guildId, alvo.channelId);
  return origens ? urlPublica(caminho, origens) : urlPublica(caminho);
}
