"use client";

import { create } from "zustand";

/**
 * Ocultar nomes de participantes em canais de voz (print s2, ação "Ocultar nomes"
 * no menu de contexto de um participante) — um interruptor **por canal de voz**,
 * e só deste navegador: o contrato não tem campo para isto, é preferência de tela.
 *
 * Mesmo padrão de `stores/canais-ocultos.ts`: localStorage lido/gravado à mão,
 * com `try/catch` e guarda de `typeof window`.
 */

const CHAVE = "streamz:nomes-ocultos";

function lerPreferencias(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    const obj: unknown = bruto ? JSON.parse(bruto) : {};
    if (!obj || typeof obj !== "object") return {};
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).filter(
        (par): par is [string, boolean] => typeof par[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

function gravarPreferencias(porCanal: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(porCanal));
  } catch {
    // modo privado / cota cheia: preferência não sobrevive ao reload
  }
}

interface NomesOcultosState {
  /** canal → interruptor ligado. Ausente = desligado (padrão). */
  porCanal: Record<string, boolean>;
  /** `true` quando nomes estão ocultos neste canal. */
  ocultos: (channelId: string) => boolean;
  /** liga/desliga o ocultamento de nomes **deste** canal, sem tocar nos outros. */
  alternar: (channelId: string) => void;
}

export const useNomesOcultos = create<NomesOcultosState>((set, get) => ({
  porCanal: lerPreferencias(),
  ocultos: (channelId) => get().porCanal[channelId] ?? false,
  alternar: (channelId) => {
    const porCanal = {
      ...get().porCanal,
      [channelId]: !(get().porCanal[channelId] ?? false),
    };
    set({ porCanal });
    gravarPreferencias(porCanal);
  },
}));
