"use client";

import { CAMERA_FPS_OPCOES, type CameraFps } from "@streamz/shared";
import { Segmento } from "@/components/voice/qualidade-de-tela";
import { useVoice } from "@/stores/voice";

/**
 * A taxa de quadros da câmera, nos três lugares em que a câmera se escolhe:
 * a seção de câmera da aba Voz (`settings/VozTab`), o painel de dentro da
 * chamada (`VoiceSettingsPanel`) e a setinha do botão de câmera
 * (`ListaDeCameras`, que usa só `rotuloFps`/`CAMERA_FPS_OPCOES`, porque ali o
 * vocabulário é o de item de menu, não o de segmento).
 *
 * O segmento é o mesmo `Segmento` da qualidade da tela: as duas escolhas moram
 * na mesma aba, uma embaixo da outra, e duas formas para "taxa de quadros"
 * seriam lidas como duas coisas diferentes.
 *
 * A escolha vai direto para `useVoice.setCameraFps`, que persiste e, com a
 * câmera ligada, aplica na hora — então aqui não há aviso de "vale na próxima
 * vez", ao contrário da troca de aparelho.
 */

/** "30 fps" — o texto de cada opção, igual nos segmentos, no menu e no seletor da tela. */
export const rotuloFps = (fps: CameraFps) => `${fps} fps`;

/** Frase de ajuda que acompanha o seletor onde há espaço para ela. */
export const AJUDA_FPS_DA_CAMERA =
  "Menos fps alivia o computador, sobretudo se você compartilha a tela ao mesmo tempo. Com 60 fps a câmera sai em 720p.";

/** O valor do segmento (string) de volta para uma taxa válida, ou `null`. */
export function fpsDoValor(valor: string): CameraFps | null {
  return CAMERA_FPS_OPCOES.find((f) => String(f) === valor) ?? null;
}

/**
 * As restrições de vídeo que uma **prévia** local pede, para ela mostrar o que
 * a chamada vai mandar: a taxa escolhida como `ideal` (a câmera que não chega
 * lá entrega o que puder, em vez de falhar) e 1280×720 quando é 60, que é a
 * resolução em que a publicação sai nessa taxa.
 */
export function restricoesDaPrevia(
  deviceId: string | null,
  fps: CameraFps,
): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    frameRate: { ideal: fps },
    ...(fps === 60 ? { width: { ideal: 1280 }, height: { ideal: 720 } } : {}),
  };
}

export function SeletorDeFpsDaCamera({
  rotulo = "Taxa de quadros",
  className,
}: {
  /** O rótulo visível; o nome acessível sempre diz que é da câmera. */
  rotulo?: string;
  className?: string;
}) {
  const cameraFps = useVoice((v) => v.cameraFps);
  const setCameraFps = useVoice((v) => v.setCameraFps);
  return (
    <Segmento
      rotulo={rotulo}
      rotuloAcessivel="Taxa de quadros da câmera"
      opcoes={CAMERA_FPS_OPCOES.map((f) => ({ valor: String(f), texto: rotuloFps(f) }))}
      atual={String(cameraFps)}
      onEscolher={(v) => {
        const fps = fpsDoValor(v);
        if (fps !== null) setCameraFps(fps);
      }}
      className={className}
    />
  );
}
