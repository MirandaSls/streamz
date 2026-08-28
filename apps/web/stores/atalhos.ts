"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SHORTCUTS, type ShortcutAction, type ShortcutSpec } from "@/lib/shortcuts";

/**
 * As combinações que o usuário regravou na aba "Teclado".
 *
 * Só o que **difere** do registro de `lib/shortcuts` é guardado: assim um
 * atalho novo (ou alterado) no código passa a valer para quem nunca mexeu
 * nele, em vez de ficar congelado no `localStorage` de meses atrás.
 *
 * Fica no `localStorage` como as demais preferências de dispositivo — atalho é
 * do teclado que está na mesa, não da conta.
 */

interface AtalhosState {
  /** ação → combinação escolhida. Ausente = a combinação padrão do registro. */
  regravados: Partial<Record<ShortcutAction, string>>;
  regravar: (action: ShortcutAction, combo: string) => void;
  restaurar: (action: ShortcutAction) => void;
  restaurarTudo: () => void;
}

export const useAtalhos = create<AtalhosState>()(
  persist(
    (set) => ({
      regravados: {},
      regravar: (action, combo) =>
        set((s) => ({ regravados: { ...s.regravados, [action]: combo } })),
      restaurar: (action) =>
        set((s) => {
          const { [action]: _fora, ...resto } = s.regravados;
          return { regravados: resto };
        }),
      restaurarTudo: () => set({ regravados: {} }),
    }),
    {
      name: "atalhos",
      version: 1,
      // só os dados são persistidos; as ações são remontadas a cada carga
      partialize: (s) => ({ regravados: s.regravados }),
    },
  ),
);

/**
 * O registro de atalhos com as regravações aplicadas.
 *
 * É esta lista — e não `SHORTCUTS` — que a aba "Teclado" mostra, e é ela que
 * `actionForEvent(evento, specs)` precisa receber para que a regravação valha
 * de verdade no app.
 */
export function atalhosEfetivos(
  regravados: Partial<Record<ShortcutAction, string>>,
): ShortcutSpec[] {
  return SHORTCUTS.map((spec) => {
    const combo = regravados[spec.action];
    return combo ? { ...spec, combos: [combo] } : { ...spec };
  });
}

/** A ação que já usa esta combinação, se houver outra (para barrar conflito). */
export function conflitoDe(
  combo: string,
  action: ShortcutAction,
  regravados: Partial<Record<ShortcutAction, string>>,
): ShortcutSpec | null {
  const normal = combo.toLowerCase();
  return (
    atalhosEfetivos(regravados).find(
      (s) => s.action !== action && s.combos.some((c) => c.toLowerCase() === normal),
    ) ?? null
  );
}
