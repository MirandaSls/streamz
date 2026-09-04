import { Track, type Room } from "livekit-client";
import {
  FALA_INICIAL,
  passoDeFala,
  rmsDeAmostras,
  type EstadoDeFala,
} from "@/stores/voice-falantes";

/**
 * "Estou falando?" medido aqui, no meu próprio microfone.
 *
 * A pergunta parece já respondida pelo LiveKit (`ActiveSpeakersChanged`), e é —
 * para os **outros**. Para mim ela chega tarde e mal: o SFU decide quem fala a
 * cada meio segundo, com um limiar próprio, e manda o aviso pelo canal de dados
 * *lossy*, que perde pacote de propósito. O resultado é o anel que "às vezes
 * não acende": frase curta não passa do limiar, microfone de notebook com ganho
 * baixo nunca passa, e o aviso que passou pode ter se perdido no caminho.
 *
 * O Discord acende o seu anel na hora porque mede local. Aqui é o mesmo: um
 * `AnalyserNode` na faixa que está sendo publicada, 20 vezes por segundo, com
 * ataque imediato e soltura de 250 ms (`passoDeFala`). Os outros continuam
 * vindo do SFU — deles não temos o áudio antes de a rede entregar.
 *
 * O detector é **rearmado** sempre que a faixa muda de identidade: desmutar,
 * trocar de microfone nas configurações e a reconexão da sala republicam o
 * microfone, e um analisador preso à faixa antiga mede silêncio para sempre.
 * Quem chama cuida disso (ver os eventos ligados em `stores/voice.ts`).
 */

/** Quantas leituras por segundo. `setInterval`, e não `requestAnimationFrame`: */
/* o rAF congela com a janela em segundo plano, e a barra lateral continua na
   tela de quem está com o app numa metade do monitor. */
const INTERVALO_MS = 50;

interface Detector {
  faixa: MediaStreamTrack;
  ctx: AudioContext;
  fonte: MediaStreamAudioSourceNode;
  timer: ReturnType<typeof setInterval>;
}

let detector: Detector | null = null;
let estado: EstadoDeFala = FALA_INICIAL;

/** A faixa de microfone que está publicada agora (ou null). */
function faixaDoMicrofone(room: Room): MediaStreamTrack | null {
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  if (!pub || pub.isMuted) return null;
  return pub.track?.mediaStreamTrack ?? null;
}

/**
 * Liga (ou religa) o detector à faixa publicada agora. Chamar de novo é barato:
 * se a faixa é a mesma, não faz nada.
 *
 * `aoMudar` só é chamado quando a resposta **muda** — quem escuta é a store, e
 * um aviso por leitura seria um re-render a cada 50 ms.
 */
export function armarDetectorLocal(room: Room, aoMudar: (falando: boolean) => void) {
  const faixa = faixaDoMicrofone(room);
  if (!faixa) {
    desarmarDetectorLocal(aoMudar);
    return;
  }
  if (detector?.faixa === faixa) return;
  desarmarDetectorLocal(aoMudar);

  const Ctor =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return;

  try {
    const ctx = new Ctor();
    const fonte = ctx.createMediaStreamSource(new MediaStream([faixa]));
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 1024;
    fonte.connect(analisador);
    // sem `connect(ctx.destination)`: o analisador não precisa de saída, e
    // ligá-lo à saída devolveria o meu microfone para os meus próprios ouvidos
    const amostras = new Uint8Array(analisador.fftSize);
    const timer = setInterval(() => {
      analisador.getByteTimeDomainData(amostras);
      const antes = estado.falando;
      estado = passoDeFala(estado, rmsDeAmostras(amostras), Date.now());
      if (estado.falando !== antes) aoMudar(estado.falando);
    }, INTERVALO_MS);
    detector = { faixa, ctx, fonte, timer };
    void ctx.resume().catch(() => {});
  } catch {
    // sem Web Audio o anel local volta a depender do SFU, que é o que era antes
  }
}

/** Desliga o detector e apaga o anel, se ele estava aceso. */
export function desarmarDetectorLocal(aoMudar: (falando: boolean) => void) {
  if (detector) {
    clearInterval(detector.timer);
    detector.fonte.disconnect();
    void detector.ctx.close().catch(() => {});
    detector = null;
  }
  if (estado.falando) aoMudar(false);
  estado = FALA_INICIAL;
}
