import type * as LivekitClient from "livekit-client";
import type { ConnectionQuality, ConnectionState, Track, VideoQuality } from "livekit-client";

/**
 * O carregador único do `livekit-client`.
 *
 * O SDK tem ~510 KB minificados e só serve para quem entra em voz. Importado
 * estaticamente pela store de voz (que o app inteiro importa no boot), ele ia
 * no bundle inicial de `/app` de todo mundo — inclusive de quem nunca clica
 * num canal de voz. Por isso **nenhum módulo carregado no boot importa valor
 * de "livekit-client"**: tipos vêm por `import type` (somem na compilação) e
 * valores (`Room`, `RoomEvent`, `createLocalTracks`…) vêm daqui, pelo
 * `import()` dinâmico, que o bundler separa num chunk próprio.
 *
 * Memoizado: todos os chamadores dividem a mesma promessa, então o chunk é
 * pedido uma vez só, e uma falha de rede (chunk que não baixou) não fica
 * guardada — a próxima tentativa de entrar pede de novo.
 */
export type Livekit = typeof LivekitClient;

let carregado: Livekit | null = null;
let carregando: Promise<Livekit> | null = null;

export function carregarLivekit(): Promise<Livekit> {
  if (carregado) return Promise.resolve(carregado);
  carregando ??= import("livekit-client").then(
    (m) => {
      carregado = m;
      conferirLiterais(m);
      return m;
    },
    (e: unknown) => {
      carregando = null;
      throw e;
    },
  );
  return carregando;
}

/**
 * O módulo, se já carregou; `null` antes disso.
 *
 * Para código síncrono que pode rodar antes de qualquer conexão (ex.: um
 * `instanceof` numa lista que, sem sala, está vazia de qualquer jeito).
 */
export function livekitCarregado(): Livekit | null {
  return carregado;
}

/**
 * O módulo, para código síncrono que só roda **com uma `Room` de pé**.
 *
 * Toda `Room` nasce de `carregarLivekit()` (é de lá que vem a classe), então
 * quem já tem sala, participante ou faixa em mãos tem o módulo carregado. Se
 * isto lançar, é um caminho novo que tocou o SDK sem sala — o erro diz onde.
 */
export function exigirLivekit(): Livekit {
  if (!carregado) {
    throw new Error("livekit-client ainda não carregado: chame carregarLivekit() antes");
  }
  return carregado;
}

// ── Literais dos enums, para comparação síncrona ──────────────────────────
//
// `Track.Source`, `Track.Kind`, `ConnectionState` e `ConnectionQuality` são
// enums de **string** no SDK, e `VideoQuality` é numérico: o valor em runtime é
// o literal, e ele é o que viaja no protocolo — não muda sem quebrar o SFU.
// Comparar por eles dispensa o módulo em funções chamadas no render (`telasDe`,
// `camerasDe`) e nos filtros das stores, que precisam funcionar mesmo antes de
// o chunk chegar (sem sala, devolvendo lista vazia). Os tipos continuam sendo
// os do enum, então quem recebe o valor não vê diferença.
// `conferirLiterais` compara tudo com o SDK de verdade no primeiro carregamento.

export const FONTE = {
  Camera: "camera" as Track.Source.Camera,
  Microphone: "microphone" as Track.Source.Microphone,
  ScreenShare: "screen_share" as Track.Source.ScreenShare,
  ScreenShareAudio: "screen_share_audio" as Track.Source.ScreenShareAudio,
} as const;

export const TIPO_DE_FAIXA = {
  Audio: "audio" as Track.Kind.Audio,
  Video: "video" as Track.Kind.Video,
} as const;

export const ESTADO_DA_CONEXAO = {
  Disconnected: "disconnected" as ConnectionState.Disconnected,
} as const;

export const QUALIDADE_DA_CONEXAO = {
  Excellent: "excellent" as ConnectionQuality.Excellent,
  Good: "good" as ConnectionQuality.Good,
  Poor: "poor" as ConnectionQuality.Poor,
  Lost: "lost" as ConnectionQuality.Lost,
} as const;

export const QUALIDADE_DE_VIDEO = {
  LOW: 0 as VideoQuality.LOW,
  MEDIUM: 1 as VideoQuality.MEDIUM,
  HIGH: 2 as VideoQuality.HIGH,
} as const;

/**
 * Uma atualização do SDK que renomeasse um desses valores faria as comparações
 * falharem em silêncio (tela sem tile, qualidade errada). Em dev, o primeiro
 * carregamento grita no console em vez de deixar isso passar.
 */
function conferirLiterais(lk: Livekit) {
  if (process.env.NODE_ENV === "production") return;
  const grupos: [string, Record<string, unknown>, Record<string, unknown> | undefined][] = [
    ["Track.Source", FONTE, lk.Track?.Source],
    ["Track.Kind", TIPO_DE_FAIXA, lk.Track?.Kind],
    ["ConnectionState", ESTADO_DA_CONEXAO, lk.ConnectionState],
    ["ConnectionQuality", QUALIDADE_DA_CONEXAO, lk.ConnectionQuality],
    ["VideoQuality", QUALIDADE_DE_VIDEO, lk.VideoQuality],
  ];
  for (const [nome, nossos, doSdk] of grupos) {
    // sem o enum (mock de teste parcial) não há o que comparar
    if (!doSdk) continue;
    for (const [chave, nosso] of Object.entries(nossos)) {
      if (doSdk[chave] !== nosso) {
        console.error(`[livekit] ${nome}.${chave} mudou no SDK: esperado ${String(nosso)}, veio ${String(doSdk[chave])}`);
      }
    }
  }
}
