"use client";

import { create } from "zustand";

/**
 * "Ocultar canais silenciados" (print p5, item do menu do ícone do servidor
 * e do cabeçalho da coluna de canais) — um interruptor **por servidor**, e só
 * deste navegador: o contrato (`@streamz/shared`) não tem — e não precisa ter
 * — campo para isto, é preferência de tela.
 *
 * Mesmo padrão de `stores/categories.ts` (colapso de categoria, também por
 * servidor) e `stores/voicePrefs.ts`: um `localStorage` lido/gravado à mão,
 * com `try/catch` em volta de cada acesso — não o `persist` de
 * `zustand/middleware`, cujo `getStorage` padrão (`() => localStorage`, sem
 * checar `typeof window` antes) falha alto em qualquer ambiente sem
 * `window` (SSR, os testes deste pacote, que rodam em ambiente `node`) e
 * cai no fallback de "não sei persistir" pro resto da vida da store — o
 * guard explícito aqui evita justamente isso.
 */

const CHAVE = "streamz:canais-ocultos";

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
    return {}; // storage indisponível ou lixo salvo: começa tudo desligado
  }
}

function gravarPreferencias(porServidor: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(porServidor));
  } catch {
    // modo privado / cota cheia: a preferência não sobrevive ao reload
  }
}

interface CanaisOcultosState {
  /** servidor → interruptor ligado. Ausente = desligado (padrão do Discord). */
  porServidor: Record<string, boolean>;
  /** `true` quando este servidor está escondendo os canais silenciados. */
  ocultarSilenciados: (guildId: string) => boolean;
  /** liga/desliga a preferência **deste** servidor, sem tocar nos outros. */
  alternar: (guildId: string) => void;
}

export const useCanaisOcultos = create<CanaisOcultosState>((set, get) => ({
  porServidor: lerPreferencias(),
  ocultarSilenciados: (guildId) => get().porServidor[guildId] ?? false,
  alternar: (guildId) => {
    const porServidor = {
      ...get().porServidor,
      [guildId]: !(get().porServidor[guildId] ?? false),
    };
    set({ porServidor });
    gravarPreferencias(porServidor);
  },
}));
