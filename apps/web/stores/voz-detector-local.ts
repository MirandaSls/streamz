import { Track, type Room } from "livekit-client";
import { liberarContextoDeCaptura, usarContextoDeCaptura } from "@/lib/supressor-ruido";
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
 * trocar de microfone nas configurações, mudar a supressão de ruído e a
 * reconexão da sala trocam a faixa, e um analisador preso à antiga mede
 * silêncio para sempre. Quem chama cuida disso (ver os eventos ligados em
 * `stores/voice.ts`).
 *
 * O que ele ouve é a faixa **já processada**: `LocalTrack.mediaStreamTrack`
 * devolve `processor?.processedTrack ?? _mediaStreamTrack`, ou seja, a saída da
 * cadeia de captura (`lib/supressor-ruido.ts`) quando ela existe. É o certo por
 * dois motivos: o anel acende pelo que os outros ouvem, e não pelo que o
 * microfone captou antes do supressor (senão o ventilador acenderia o anel); e
 * o volume de entrada, que é um `GainNode` dentro da cadeia, passa a valer
 * também para o anel.
 *
 * A `AudioContext` é a compartilhada da aba (`usarContextoDeCaptura`): abrir uma
 * por detector era mais um caminho para o teto de contextos do Chromium. E é a
 * da **taxa do aparelho**, não a de 48 kHz do RNNoise: medir nível não depende
 * de taxa nenhuma, e este detector é armado em toda chamada, com qualquer
 * preferência de supressão — era ele, e não o supressor, quem mantinha um
 * contexto com `sampleRate` forçado aberto do começo ao fim de qualquer call
 * (ver o cabeçalho de `lib/supressor-ruido.ts`). Quando a cadeia avançada está
 * no ar, `usarContextoDeCaptura` devolve a dela e nada é aberto a mais.
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

  if (typeof window === "undefined" || typeof AudioContext === "undefined") return;

  // tomar o contexto fica fora do `try` de baixo: se ele falhar, não há nada a
  // devolver, e um `liberar` sem `usar` roubaria o contexto de quem o tem
  let ctx: AudioContext;
  try {
    ctx = usarContextoDeCaptura();
  } catch {
    // sem Web Audio o anel local volta a depender do SFU, que é o que era antes
    return;
  }

  try {
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
  } catch {
    // montar o grafo e falhar deixaria um dono a mais para sempre
    liberarContextoDeCaptura(ctx);
  }
}

/** Desliga o detector e apaga o anel, se ele estava aceso. */
export function desarmarDetectorLocal(aoMudar: (falando: boolean) => void) {
  if (detector) {
    clearInterval(detector.timer);
    detector.fonte.disconnect();
    // devolve o MESMO contexto que tomou (são dois na aba), e não o fecha
    liberarContextoDeCaptura(detector.ctx);
    detector = null;
  }
  if (estado.falando) aoMudar(false);
  estado = FALA_INICIAL;
}
