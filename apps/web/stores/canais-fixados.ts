"use client";

import { create } from "zustand";

/**
 * Canais fixados por servidor (print s1, ação "Fixar canal" no menu de contexto
 * do canal) — array de IDs de canais fixados **por servidor**, e só deste
 * navegador: o contrato não tem campo para isto, é preferência de tela.
 *
 * Mesmo padrão de `stores/canais-ocultos.ts`: localStorage lido/gravado à mão,
 * com `try/catch` e guarda de `typeof window` para evitar quebra em SSR/testes.
 */

const CHAVE = "streamz:canais-fixados";

function lerPreferencias(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    const obj: unknown = bruto ? JSON.parse(bruto) : {};
    if (!obj || typeof obj !== "object") return {};
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).filter(
        (par): par is [string, string[]] =>
          Array.isArray(par[1]) &&
          par[1].every((id): id is string => typeof id === "string"),
      ),
    );
  } catch {
    return {};
  }
}

function gravarPreferencias(porServidor: Record<string, string[]>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(porServidor));
  } catch {
    // modo privado / cota cheia: preferência não sobrevive ao reload
  }
}

interface CanaisFixadosState {
  /** servidor → lista de IDs de canais fixados neste servidor. */
  porServidor: Record<string, string[]>;
  /** retorna a lista de IDs fixados neste servidor. */
  fixados: (guildId: string) => string[];
  /** `true` se este canal está fixado neste servidor. */
  estaFixado: (guildId: string, channelId: string) => boolean;
  /** fixa ou desfixa um canal neste servidor. */
  alternar: (guildId: string, channelId: string) => void;
}

export const useCanaisFixados = create<CanaisFixadosState>((set, get) => ({
  porServidor: lerPreferencias(),
  fixados: (guildId) => get().porServidor[guildId] ?? [],
  estaFixado: (guildId, channelId) => {
    const fixados = get().porServidor[guildId] ?? [];
    return fixados.includes(channelId);
  },
  alternar: (guildId, channelId) => {
    const fixados = get().porServidor[guildId] ?? [];
    const novoArray = fixados.includes(channelId)
      ? fixados.filter((id) => id !== channelId)
      : [...fixados, channelId];
    const porServidor = {
      ...get().porServidor,
      [guildId]: novoArray,
    };
    set({ porServidor });
    gravarPreferencias(porServidor);
  },
}));

/**
 * Ordena uma lista de itens colocando os fixados no início.
 * @param lista - itens com campo `id`
 * @param fixados - array de IDs fixados, em ordem de preferência
 * @returns objeto com `fixados` (na ordem da preferência) e `resto` (ordem original)
 */
export function ordenarComFixados<T extends { id: string }>(
  lista: T[],
  fixados: string[],
): { fixados: T[]; resto: T[] } {
  const mapa = new Map(lista.map((item) => [item.id, item]));
  const fixadosOrdenados: T[] = [];
  const resto: T[] = [];

  for (const id of fixados) {
    const item = mapa.get(id);
    if (item) {
      fixadosOrdenados.push(item);
    }
  }

  for (const item of lista) {
    if (!fixados.includes(item.id)) {
      resto.push(item);
    }
  }

  return { fixados: fixadosOrdenados, resto };
}
