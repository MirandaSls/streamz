"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Emojis usados com mais frequência para reagir — a fileira que o Discord
 * mostra no início da mini-barra da mensagem e no topo do menu de contexto.
 *
 * A contagem fica **no browser**: é um hábito de quem está usando o app, não um
 * dado de conta. Enquanto ninguém reagiu, valem os padrões — uma fileira vazia
 * seria pior que uma fileira genérica, porque tira o atalho justamente de quem
 * ainda não descobriu que ele existe.
 */

/** Emojis mostrados antes de haver histórico próprio. */
const PADRAO = ["👍", "😂", "❤️", "🎉", "😮", "😢"];

interface Estado {
  /** emoji → quantas vezes eu reagi com ele. */
  usos: Record<string, number>;
  registrarUso: (emoji: string) => void;
}

export const useReacoesRapidas = create<Estado>()(
  persist(
    (set) => ({
      usos: {},
      registrarUso: (emoji) =>
        set((s) => ({ usos: { ...s.usos, [emoji]: (s.usos[emoji] ?? 0) + 1 } })),
    }),
    {
      name: "reacoes-frequentes",
      // só os dados são persistidos; as ações são remontadas a cada carga
      partialize: (s) => ({ usos: s.usos }),
    },
  ),
);

/** Ordena por uso e completa com os padrões até `quantos` emojis. */
export function ordenarFrequentes(usos: Record<string, number>, quantos: number): string[] {
  const meus = Object.entries(usos)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji]) => emoji);
  const lista = [...meus];
  for (const e of PADRAO) {
    if (lista.length >= quantos) break;
    if (!lista.includes(e)) lista.push(e);
  }
  return lista.slice(0, quantos);
}

/** Os `quantos` emojis mais usados por mim, completados com os padrões. */
export function useFrequentes(quantos: number): string[] {
  const usos = useReacoesRapidas((s) => s.usos);
  return ordenarFrequentes(usos, quantos);
}

/** Atalho para call sites fora de componentes. */
export function registrarUsoDeReacao(emoji: string): void {
  useReacoesRapidas.getState().registrarUso(emoji);
}
