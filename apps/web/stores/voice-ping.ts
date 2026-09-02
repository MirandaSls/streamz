import { create } from "zustand";
import { ConnectionQuality, RoomEvent, Track, type Participant, type Room } from "livekit-client";

/**
 * Ping da call: o "Ping: 34 ms" que o Discord mostra ao passar o mouse no
 * ícone de sinal da barra "Voz conectada", e a qualidade que colore o ícone.
 *
 * Mora numa store própria, separada de `useVoice`, de propósito: a medição
 * roda a cada 2 s, e se ela tocasse o `tick` de lá a grade da call inteira
 * re-renderizaria a cada leitura. Aqui só quem lê o ping (a barra) acorda.
 *
 * A medida vem do `currentRoundTripTime` do par de candidatos ICE selecionado
 * (o `candidate-pair` do `RTCStatsReport` da faixa de áudio local — ou, sem
 * microfone publicado, de qualquer faixa remota, que passa pela mesma
 * conexão). A qualidade prefere o `ConnectionQuality` do LiveKit, que também
 * pesa perda de pacote; sem ele, cai nas faixas de ping abaixo.
 */

export type QualidadeDeVoz = "excelente" | "boa" | "ruim";

export interface PingDeVoz {
  /** ida e volta até o servidor de mídia, em ms; null = nada medido ainda. */
  pingMs: number | null;
  /** null enquanto não há medida nem sinal do LiveKit. */
  qualidade: QualidadeDeVoz | null;
}

export const INTERVALO_DE_MEDICAO_MS = 2000;

/** Faixas de ping para a qualidade, quando o LiveKit ainda não opinou. */
export const PING_BOM_MS = 100;
export const PING_RUIM_MS = 250;

const SEM_MEDIDA: PingDeVoz = { pingMs: null, qualidade: null };

export const useVoicePing = create<PingDeVoz>(() => SEM_MEDIDA);

/** O subconjunto de `RTCStats` que a extração lê (o resto é ignorado). */
export interface EstatisticaDeConexao {
  type: string;
  id: string;
  /** em `transport`: o par de candidatos em uso. */
  selectedCandidatePairId?: string;
  /** em `candidate-pair`: segundos (é assim que o WebRTC entrega). */
  currentRoundTripTime?: number;
  nominated?: boolean;
  state?: string;
}

/**
 * RTT em ms do par de candidatos selecionado, ou null quando o relatório ainda
 * não tem a medida (a conexão acabou de subir, ou o navegador não expõe o
 * `transport`). Sem `transport`, vale o par nomeado e em `succeeded` — é o
 * que o Firefox entrega.
 */
export function rttDoRelatorio(relatorio: Iterable<EstatisticaDeConexao>): number | null {
  const pares = new Map<string, EstatisticaDeConexao>();
  const selecionados: string[] = [];
  for (const s of relatorio) {
    if (s.type === "candidate-pair") pares.set(s.id, s);
    else if (s.type === "transport" && s.selectedCandidatePairId) {
      selecionados.push(s.selectedCandidatePairId);
    }
  }
  for (const id of selecionados) {
    const ms = emMs(pares.get(id));
    if (ms !== null) return ms;
  }
  for (const par of pares.values()) {
    if (par.nominated && par.state === "succeeded") {
      const ms = emMs(par);
      if (ms !== null) return ms;
    }
  }
  return null;
}

function emMs(par: EstatisticaDeConexao | undefined): number | null {
  const rtt = par?.currentRoundTripTime;
  if (typeof rtt !== "number" || !Number.isFinite(rtt) || rtt < 0) return null;
  return Math.round(rtt * 1000);
}

/** Qualidade pelas faixas de ping. */
export function qualidadePeloPing(pingMs: number): QualidadeDeVoz {
  if (pingMs <= PING_BOM_MS) return "excelente";
  if (pingMs <= PING_RUIM_MS) return "boa";
  return "ruim";
}

/** Qualidade pelo sinal do LiveKit; null quando ele ainda não sabe. */
export function qualidadeDoLiveKit(q: ConnectionQuality): QualidadeDeVoz | null {
  switch (q) {
    case ConnectionQuality.Excellent:
      return "excelente";
    case ConnectionQuality.Good:
      return "boa";
    case ConnectionQuality.Poor:
    case ConnectionQuality.Lost:
      return "ruim";
    default:
      return null;
  }
}

/** Combina as duas fontes: o LiveKit manda; sem ele, o ping decide. */
export function qualidadeDaCall(pingMs: number | null, liveKit: QualidadeDeVoz | null): QualidadeDeVoz | null {
  if (liveKit) return liveKit;
  return pingMs === null ? null : qualidadePeloPing(pingMs);
}

/** Texto do tooltip do ícone de sinal. */
export function rotuloDoPing(pingMs: number | null): string {
  return pingMs === null ? "Medindo…" : `Ping: ${pingMs} ms`;
}

// ── Medição ────────────────────────────────────────────────────────────────

let temporizador: ReturnType<typeof setInterval> | null = null;
let salaMedida: Room | null = null;
let qualidadeDoServidor: QualidadeDeVoz | null = null;

/** Uma faixa (local ou remota) com o relatório de estatísticas do WebRTC. */
interface FaixaComRelatorio {
  getRTCStatsReport(): Promise<RTCStatsReport | undefined>;
}

/** Faixa por onde medir: o microfone local; sem ele, qualquer faixa remota. */
function faixaParaMedir(room: Room): FaixaComRelatorio | null {
  const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  if (mic) return mic;
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.track) return pub.track;
    }
  }
  return null;
}

async function medir(room: Room) {
  let pingMs: number | null = null;
  try {
    const relatorio = await faixaParaMedir(room)?.getRTCStatsReport();
    if (relatorio) pingMs = rttDoRelatorio(relatorio.values() as Iterable<EstatisticaDeConexao>);
  } catch {
    // o relatório pode falhar no meio de uma republicação; a próxima leitura vale
  }
  // a sala pode ter fechado enquanto o relatório vinha
  if (salaMedida !== room) return;
  const anterior = useVoicePing.getState();
  const ping = pingMs ?? anterior.pingMs;
  useVoicePing.setState({ pingMs: ping, qualidade: qualidadeDaCall(ping, qualidadeDoServidor) });
}

/** Começa a medir a cada `INTERVALO_DE_MEDICAO_MS`; substitui uma medição anterior. */
export function iniciarMedicaoDePing(room: Room): void {
  pararMedicaoDePing();
  salaMedida = room;
  room.on(RoomEvent.ConnectionQualityChanged, aoMudarQualidade);
  temporizador = setInterval(() => void medir(room), INTERVALO_DE_MEDICAO_MS);
  void medir(room);
}

/** Para de medir e volta ao "nada medido". */
export function pararMedicaoDePing(): void {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
  salaMedida?.off(RoomEvent.ConnectionQualityChanged, aoMudarQualidade);
  salaMedida = null;
  qualidadeDoServidor = null;
  useVoicePing.setState(SEM_MEDIDA);
}

function aoMudarQualidade(q: ConnectionQuality, participante: Participant) {
  if (!salaMedida || participante !== salaMedida.localParticipant) return;
  qualidadeDoServidor = qualidadeDoLiveKit(q);
  const { pingMs } = useVoicePing.getState();
  useVoicePing.setState({ pingMs, qualidade: qualidadeDaCall(pingMs, qualidadeDoServidor) });
}
