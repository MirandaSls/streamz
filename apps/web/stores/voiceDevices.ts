"use client";

import { useEffect } from "react";
import { create } from "zustand";

/**
 * Microfone, saída de áudio e câmera escolhidos pelo usuário.
 *
 * Fica numa store própria (e não dentro de `voice.ts`) porque a escolha de
 * dispositivo vale **fora** de qualquer chamada: a aba "Voz e vídeo" das
 * configurações mexe nela com o app parado, e a call em andamento apenas
 * reage. Os ids são persistidos — trocar de fone não deve virar um ritual a
 * cada reload.
 *
 * Cuidado do browser: sem permissão de mídia concedida, `enumerateDevices`
 * devolve entradas com `label` vazio. É por isso que `refresh()` pede a
 * permissão antes de listar — e segue em frente (com a lista anônima) se o
 * usuário negar, em vez de deixar a tela vazia sem explicação.
 */

export interface VoiceDevicesState {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
  inputId: string | null;
  outputId: string | null;
  cameraId: string | null;
  /** true quando os rótulos vieram (permissão concedida). */
  autorizado: boolean;
  setInput: (id: string | null) => void;
  setOutput: (id: string | null) => void;
  setCamera: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const KEY = "voiceDevices";

type Ids = Pick<VoiceDevicesState, "inputId" | "outputId" | "cameraId">;

function load(): Ids {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) return JSON.parse(raw) as Ids;
  } catch {
    // storage indisponível ou corrompido: volta ao padrão do sistema
  }
  return { inputId: null, outputId: null, cameraId: null };
}

function save(ids: Ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // sem storage não há o que persistir
  }
}

/** `mediaDevices` não existe em contexto inseguro (http fora de localhost) nem no SSR. */
function midia(): MediaDevices | null {
  if (typeof navigator === "undefined") return null;
  return navigator.mediaDevices ?? null;
}

let ouvindoTroca = false;

export const useVoiceDevicesStore = create<VoiceDevicesState>((set, get) => ({
  inputs: [],
  outputs: [],
  cameras: [],
  ...load(),
  autorizado: false,

  setInput: (id) => {
    const next = { ...ids(get()), inputId: id };
    save(next);
    set(next);
  },
  setOutput: (id) => {
    const next = { ...ids(get()), outputId: id };
    save(next);
    set(next);
  },
  setCamera: (id) => {
    const next = { ...ids(get()), cameraId: id };
    save(next);
    set(next);
  },

  refresh: async () => {
    const md = midia();
    if (!md) return;
    let autorizado = get().autorizado;
    if (!autorizado) {
      try {
        // um stream efêmero só para destravar os rótulos; é fechado em seguida
        const stream = await md.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        autorizado = true;
      } catch {
        // permissão negada: a lista vem sem rótulo, mas ainda dá para escolher
        autorizado = false;
      }
    }
    const todos = await md.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    set({
      autorizado,
      inputs: todos.filter((d) => d.kind === "audioinput"),
      outputs: todos.filter((d) => d.kind === "audiooutput"),
      cameras: todos.filter((d) => d.kind === "videoinput"),
    });
    // dispositivo escolhido que foi desconectado volta a "padrão do sistema"
    const atual = ids(get());
    const valido = (id: string | null, lista: MediaDeviceInfo[]) =>
      id === null || lista.some((d) => d.deviceId === id) ? id : null;
    const next: Ids = {
      inputId: valido(atual.inputId, get().inputs),
      outputId: valido(atual.outputId, get().outputs),
      cameraId: valido(atual.cameraId, get().cameras),
    };
    if (
      next.inputId !== atual.inputId ||
      next.outputId !== atual.outputId ||
      next.cameraId !== atual.cameraId
    ) {
      save(next);
      set(next);
    }
  },
}));

function ids(s: VoiceDevicesState): Ids {
  return { inputId: s.inputId, outputId: s.outputId, cameraId: s.cameraId };
}

/**
 * Hook público (é o que a aba "Voz e vídeo" consome): devolve a store e cuida
 * de listar na montagem e de reagir a `devicechange` — plugar um fone atualiza
 * a lista sozinho.
 */
export function useVoiceDevices(): VoiceDevicesState {
  const state = useVoiceDevicesStore();

  useEffect(() => {
    void useVoiceDevicesStore.getState().refresh();
    const md = midia();
    if (!md || ouvindoTroca) return;
    ouvindoTroca = true;
    const aoTrocar = () => void useVoiceDevicesStore.getState().refresh();
    md.addEventListener?.("devicechange", aoTrocar);
    return () => {
      ouvindoTroca = false;
      md.removeEventListener?.("devicechange", aoTrocar);
    };
  }, []);

  return state;
}

/**
 * Aponta um `<audio>` para a saída escolhida. `setSinkId` só existe no Chrome/
 * Edge — nos outros o elemento continua na saída padrão, que é o comportamento
 * aceitável (falhar aqui não pode calar o áudio).
 */
export async function aplicarSaida(el: HTMLMediaElement, outputId: string | null) {
  const alvo = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
  if (!outputId || typeof alvo.setSinkId !== "function") return;
  await alvo.setSinkId(outputId).catch(() => {});
}
