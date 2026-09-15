import {
  CAMERA_ALIVIO,
  CAMERA_CAMADA_BAIXA,
  CAMERA_FPS_OPCOES,
  CAMERA_FPS_PADRAO,
  CAMERA_QUALITY,
  SCREEN_QUALITY,
  SCREEN_QUALITY_PADRAO,
  type CameraFps,
  type CameraQualityPreset,
  type ScreenQuality,
} from "@streamz/shared";

/**
 * A parte pura da qualidade da câmera — o que dá para testar sem navegador:
 * a leitura das preferências guardadas, o que se pede ao `getUserMedia` e ao
 * `publishTrack` para cada fps, e as codificações que o sender recebe com e sem
 * o alívio (tela compartilhada ao mesmo tempo, ou CPU no limite).
 *
 * Quem aplica tudo isso na faixa é `stores/voice.ts`; aqui não há SDK.
 */

// ── preferências guardadas ─────────────────────────────────────────────────

export const CAMERA_FPS_KEY = "voiceCameraFps";
export const SCREEN_QUALITY_KEY = "voiceScreenQuality";

export function ehCameraFps(valor: unknown): valor is CameraFps {
  return (CAMERA_FPS_OPCOES as readonly unknown[]).includes(valor);
}

/** O fps guardado; qualquer coisa fora das opções cai no padrão. */
export function lerCameraFps(raw: string | null): CameraFps {
  if (raw === null) return CAMERA_FPS_PADRAO;
  const numero = Number(raw);
  return ehCameraFps(numero) ? numero : CAMERA_FPS_PADRAO;
}

/** O preset de tela guardado; chave que o contrato não tem cai no padrão. */
export function lerScreenQuality(raw: string | null): ScreenQuality {
  return raw !== null && Object.prototype.hasOwnProperty.call(SCREEN_QUALITY, raw)
    ? (raw as ScreenQuality)
    : SCREEN_QUALITY_PADRAO;
}

// ── captura e publicação ───────────────────────────────────────────────────

/** O que vai em `resolution` do `getUserMedia` (e do `restartTrack`). */
export function capturaDaCamera(fps: CameraFps): { width: number; height: number; frameRate: number } {
  const { width, height, frameRate } = CAMERA_QUALITY[fps];
  return { width, height, frameRate };
}

/** A camada de miniatura, com o fps nunca acima do escolhido. */
export function camadaBaixaDaCamera(fps: CameraFps): CameraQualityPreset {
  return {
    ...CAMERA_CAMADA_BAIXA,
    frameRate: Math.min(CAMERA_CAMADA_BAIXA.frameRate, CAMERA_QUALITY[fps].frameRate),
  };
}

/**
 * As opções de publicação da câmera para um fps: o teto da camada cheia e as
 * camadas **extras** do simulcast — só a de 360p. Com uma camada declarada o
 * SDK publica duas codificações (ela + a cheia) em vez das três padrão.
 */
export function publicacaoDaCamera(fps: CameraFps): {
  videoEncoding: { maxBitrate: number; maxFramerate: number };
  camadas: CameraQualityPreset[];
} {
  const preset = CAMERA_QUALITY[fps];
  return {
    videoEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.frameRate },
    camadas: [camadaBaixaDaCamera(fps)],
  };
}

// ── sender ─────────────────────────────────────────────────────────────────

/** Os três campos de uma codificação que a câmera controla ao vivo. */
export interface AjusteDeCamada {
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
}

export interface PedidoDeEncodings {
  fps: CameraFps;
  /**
   * O lado menor do quadro que a câmera está entregando **de fato** (a webcam
   * pode devolver menos do que se pediu). É dele que sai a escala de cada
   * camada, igual o SDK calcula na publicação.
   */
  ladoMenor: number;
  /** quantas codificações o sender tem (1 sem simulcast, 2 com). */
  quantidade: number;
  /** tela no ar ou CPU no limite: a camada cheia desce a ≤720p e ≤15 fps. */
  aliviar: boolean;
}

/**
 * As codificações do sender da câmera, **da menor para a maior** — a mesma
 * ordem em que o SDK as publica (`q`, `h`, `f`). A última é sempre a cheia.
 *
 * Nenhuma camada passa do fps da cheia: com o alívio a 15 fps, a de 360p
 * também desce a 15, senão a miniatura sairia mais fluida que a imagem grande.
 */
export function encodingsDaCamera({ fps, ladoMenor, quantidade, aliviar }: PedidoDeEncodings): AjusteDeCamada[] {
  if (quantidade < 1) return [];
  const preset = CAMERA_QUALITY[fps];
  const lado = ladoMenor > 0 ? ladoMenor : Math.min(preset.width, preset.height);

  const cheia: AjusteDeCamada = aliviar
    ? {
        maxBitrate: Math.min(preset.maxBitrate, CAMERA_ALIVIO.maxBitrate),
        maxFramerate: Math.min(preset.frameRate, CAMERA_ALIVIO.frameRate),
        scaleResolutionDownBy: Math.max(1, lado / CAMERA_ALIVIO.alturaMaxima),
      }
    : { maxBitrate: preset.maxBitrate, maxFramerate: preset.frameRate, scaleResolutionDownBy: 1 };

  const baixa = CAMERA_CAMADA_BAIXA;
  const camadas: AjusteDeCamada[] = [];
  for (let i = 0; i < quantidade - 1; i += 1) {
    // de cima para baixo: a logo abaixo da cheia é a de 360p, e se houver uma
    // terceira (publicação de antes das duas camadas) ela fica na metade disso
    const degrau = quantidade - 2 - i;
    const altura = baixa.height / 2 ** degrau;
    camadas.push({
      maxBitrate: Math.round(baixa.maxBitrate / 2 ** degrau),
      maxFramerate: Math.min(baixa.frameRate, cheia.maxFramerate),
      scaleResolutionDownBy: Math.max(cheia.scaleResolutionDownBy, lado / altura),
    });
  }
  camadas.push(cheia);
  return camadas;
}

/**
 * Aplica os ajustes nas codificações que o sender devolveu em `getParameters`,
 * sem mexer no resto (`rid`, `active`, prioridade). `null` quando o número de
 * camadas não bate — o sender mudou por baixo e não há o que casar.
 *
 * A camada que o Firefox "desligou" pelo dynacast fica como está: ele não
 * aceita `active: false`, e o SDK a marca com bitrate 10 e escala 4; escrever
 * por cima faria a camada que ninguém assiste voltar a gastar CPU.
 */
export function mesclarEncodings(
  existentes: readonly RTCRtpEncodingParameters[],
  ajustes: readonly AjusteDeCamada[],
): RTCRtpEncodingParameters[] | null {
  if (existentes.length === 0 || existentes.length !== ajustes.length) return null;
  return existentes.map((atual, i) => {
    if (atual.active === false && atual.maxBitrate !== undefined && atual.maxBitrate <= 10) {
      return { ...atual };
    }
    return { ...atual, ...ajustes[i] };
  });
}
