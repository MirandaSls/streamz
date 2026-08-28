import { Track } from "livekit-client";
import type { AudioProcessorOptions, TrackProcessor } from "livekit-client";

/**
 * Supressão de ruído por rede neural (RNNoise), no microfone e antes de publicar.
 *
 * Por que não o do Discord: o do Discord é o Krisp, licenciado, e o filtro
 * pronto do LiveKit só funciona no LiveKit Cloud — que a ADR-0005 abandonou de
 * propósito. O RNNoise é o equivalente aberto (o mesmo que o Jitsi usa): tira
 * ventilador, ar-condicionado, teclado e chiado; perde para o Krisp quando o
 * ruído é *outra voz* ou um cachorro.
 *
 * Ele não substitui a supressão nativa do navegador por capricho: rodar as duas
 * em série soa metálico, porque a nativa volta a comprimir o que a rede já
 * limpou. Por isso quem escolhe "Avançada" desliga a nativa (ver
 * `restricoesDeCaptura`).
 *
 * O modelo assume **48 kHz**. A `AudioContext` que o LiveKit entrega quase
 * sempre já está nessa taxa; quando não estiver, abrimos a nossa — em 44,1 kHz
 * o RNNoise devolveria a voz com a altura errada.
 */

/** Servidos de `public/supressor/` pelo `predev`/`prebuild`. */
const BASE = "/supressor";
const TAXA_EXIGIDA = 48_000;

/** O wasm é o mesmo para todo mundo: baixa uma vez por aba. */
let wasm: Promise<ArrayBuffer> | null = null;
function binarioDoModelo(): Promise<ArrayBuffer> {
  wasm ??= import("@sapphi-red/web-noise-suppressor").then((m) =>
    m.loadRnnoise({ url: `${BASE}/rnnoise.wasm`, simdUrl: `${BASE}/rnnoise_simd.wasm` }),
  );
  return wasm;
}

/** `addModule` duas vezes no mesmo contexto explode: registrar processador repetido é erro. */
const contextosComWorklet = new WeakSet<BaseAudioContext>();
async function garantirWorklet(ctx: AudioContext) {
  if (contextosComWorklet.has(ctx)) return;
  await ctx.audioWorklet.addModule(`${BASE}/rnnoise-worklet.js`);
  contextosComWorklet.add(ctx);
}

/**
 * Processador de faixa no formato do LiveKit: entra em
 * `setMicrophoneEnabled(…, { processor })` e o SDK publica a saída dele no
 * lugar do microfone cru.
 */
export function supressorDeRuido(): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  let ctx: AudioContext | null = null;
  /** true quando a `AudioContext` é nossa — só nesse caso podemos fechá-la. */
  let ctxProprio = false;
  let fonte: MediaStreamAudioSourceNode | null = null;
  let no: (AudioWorkletNode & { destroy(): void }) | null = null;
  let destino: MediaStreamAudioDestinationNode | null = null;

  const processador: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
    name: "supressor-rnnoise",

    async init({ track, audioContext }: AudioProcessorOptions) {
      ctxProprio = audioContext.sampleRate !== TAXA_EXIGIDA;
      ctx = ctxProprio ? new AudioContext({ sampleRate: TAXA_EXIGIDA }) : audioContext;

      const [{ RnnoiseWorkletNode }, wasmBinary] = await Promise.all([
        import("@sapphi-red/web-noise-suppressor"),
        binarioDoModelo(),
        garantirWorklet(ctx),
      ]);

      fonte = ctx.createMediaStreamSource(new MediaStream([track]));
      // mono: o microfone é uma fonte só, e cada canal a mais é uma inferência
      // a mais por quadro
      no = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary }) as typeof no;
      destino = ctx.createMediaStreamDestination();
      fonte.connect(no!).connect(destino);

      processador.processedTrack = destino.stream.getAudioTracks()[0];
    },

    async restart(opts: AudioProcessorOptions) {
      await processador.destroy();
      await processador.init(opts);
    },

    async destroy() {
      fonte?.disconnect();
      no?.disconnect();
      no?.destroy();
      destino?.disconnect();
      // fechar uma `AudioContext` que não é nossa derrubaria o áudio do resto
      // da chamada junto
      if (ctxProprio) await ctx?.close().catch(() => {});
      fonte = null;
      no = null;
      destino = null;
      ctx = null;
      processador.processedTrack = undefined;
    },
  };

  return processador;
}
