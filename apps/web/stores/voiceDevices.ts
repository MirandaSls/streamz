import { create } from "zustand";

/**
 * Dispositivos de áudio e vídeo escolhidos pelo usuário.
 *
 * >>> STUB DO CONTRATO DO AGENTE F (voz) <<<
 * O contrato da rodada é `useVoiceDevices(): { inputs, outputs, cameras,
 * inputId, outputId, cameraId, setInput, setOutput, setCamera, refresh }`, e a
 * aba "Voz e vídeo" das configurações consome exatamente isso. Esta
 * implementação é funcional (enumera de verdade e persiste a escolha) para a
 * tela não ficar morta; quando o F trouxer a versão dele, é este arquivo que
 * ele substitui — sem mexer na aba.
 *
 * `deviceId` null significa "padrão do sistema": nunca gravamos um id de
 * dispositivo que sumiu, senão a chamada seguinte falharia com
 * `OverconstrainedError`.
 */

interface VoiceDevicesState {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  inputId: string | null;
  outputId: string | null;
  cameraId: string | null;
  setInput: (id: string | null) => void;
  setOutput: (id: string | null) => void;
  setCamera: (id: string | null) => void;
  /** Re-enumera (chame depois de conseguir permissão: sem ela não há rótulo). */
  refresh: () => Promise<void>;
}

const KEY = "voiceDevices";

function load(): Pick<VoiceDevicesState, "inputId" | "outputId" | "cameraId"> {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) return JSON.parse(raw) as Pick<VoiceDevicesState, "inputId" | "outputId" | "cameraId">;
  } catch {
    // storage indisponível ou corrompido: cai no padrão do sistema
  }
  return { inputId: null, outputId: null, cameraId: null };
}

function save(state: Pick<VoiceDevicesState, "inputId" | "outputId" | "cameraId">) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // sem storage não há o que persistir
  }
}

export const useVoiceDevices = create<VoiceDevicesState>((set, get) => {
  function escolher(patch: Partial<Pick<VoiceDevicesState, "inputId" | "outputId" | "cameraId">>) {
    const { inputId, outputId, cameraId } = { ...get(), ...patch };
    save({ inputId, outputId, cameraId });
    set(patch);
  }

  return {
    inputs: [],
    outputs: [],
    cameras: [],
    ...load(),

    setInput: (id) => escolher({ inputId: id }),
    setOutput: (id) => escolher({ outputId: id }),
    setCamera: (id) => escolher({ cameraId: id }),

    refresh: async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
      try {
        const todos = await navigator.mediaDevices.enumerateDevices();
        const inputs = todos.filter((d) => d.kind === "audioinput");
        const outputs = todos.filter((d) => d.kind === "audiooutput");
        const cameras = todos.filter((d) => d.kind === "videoinput");
        set({ inputs, outputs, cameras });

        // o dispositivo escolhido pode ter sido desconectado desde a última vez
        const { inputId, outputId, cameraId } = get();
        escolher({
          inputId: inputs.some((d) => d.deviceId === inputId) ? inputId : null,
          outputId: outputs.some((d) => d.deviceId === outputId) ? outputId : null,
          cameraId: cameras.some((d) => d.deviceId === cameraId) ? cameraId : null,
        });
      } catch {
        // sem permissão ou sem suporte: a aba mostra "padrão do sistema"
      }
    },
  };
});

if (typeof navigator !== "undefined" && navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener?.("devicechange", () => {
    void useVoiceDevices.getState().refresh();
  });
}
