import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Preferências de app do usuário — aparência, acessibilidade, voz, notificações
 * e idioma.
 *
 * Ficam **no browser** (`localStorage`, via `persist`): são preferências de
 * dispositivo, não de conta. O que precisa valer em todo lugar (silenciar um
 * canal, nível de notificação) é do servidor e mora em `stores/notifications`.
 *
 * Os efeitos visuais (escala da fonte, zoom, reduzir movimento, saturação) são
 * aplicados no `<html>` pela própria store, no fim deste arquivo: assim
 * ninguém precisa montar um componente "de efeitos" — importar a store já
 * basta, e a preferência volta a valer sozinha depois da reidratação.
 */

export type Locale = "pt-BR" | "en-US";
/** Como o Enter se comporta no composer. */
export type SendMode = "enter" | "ctrl-enter";

export const FONT_SCALE = { min: 12, max: 24, step: 1, default: 16 };
// 17px é o respiro que o Discord usa entre grupos de mensagens
export const GROUP_SPACING = { min: 0, max: 24, step: 1, default: 17 };
export const EMOJI_SIZE = { min: 16, max: 48, step: 2, default: 22 };
export const ZOOM = { min: 0.8, max: 2, step: 0.1, default: 1 };

export interface SettingsValues {
  // ── aparência ──
  /** só escuro no MVP; o campo existe para o dia em que houver claro. */
  theme: "dark";
  /** px aplicados em `html { font-size }` (12–24). */
  fontScale: number;
  /** px de respiro entre grupos de mensagens (0–24). */
  groupSpacing: number;
  /** mensagens sem avatar, hora à esquerda. */
  compactMode: boolean;
  /** fator de zoom do app (Ctrl+= / Ctrl+-). */
  zoom: number;

  // ── acessibilidade ──
  reduceMotion: boolean;
  /** 0–100 (%) — 0 deixa a interface em escala de cinza. */
  saturation: number;
  alwaysShowTime: boolean;
  emojiSize: number;
  sendMode: SendMode;

  // ── voz e vídeo ──
  inputVolume: number;
  outputVolume: number;

  // ── notificações ──
  desktopNotifications: boolean;
  notificationSound: boolean;
  badgeCount: boolean;
  /** "não perturbe" silencia tudo, inclusive menções. */
  dndSilencesAll: boolean;

  // ── idioma ──
  locale: Locale;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  theme: "dark",
  fontScale: FONT_SCALE.default,
  groupSpacing: GROUP_SPACING.default,
  compactMode: false,
  zoom: ZOOM.default,

  reduceMotion: false,
  saturation: 100,
  alwaysShowTime: false,
  emojiSize: EMOJI_SIZE.default,
  sendMode: "enter",

  inputVolume: 100,
  outputVolume: 100,

  desktopNotifications: true,
  notificationSound: true,
  badgeCount: true,
  dndSilencesAll: true,

  locale: "pt-BR",
};

interface SettingsState extends SettingsValues {
  /** Muda um punhado de preferências de uma vez. */
  set: (patch: Partial<SettingsValues>) => void;
  /** Volta tudo ao padrão (botão "restaurar padrões" das abas). */
  reset: () => void;
  /** Aplica um passo de zoom (Ctrl+= / Ctrl+-), respeitando os limites. */
  stepZoom: (delta: number) => void;
}

/** Mantém um número dentro dos limites do controle que o edita. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      set: (patch) => set(patch),
      reset: () => set({ ...DEFAULT_SETTINGS }),
      stepZoom: (delta) => {
        // arredondar em décimos evita o 1.7000000000000002 do ponto flutuante
        const next = Math.round((get().zoom + delta) * 10) / 10;
        set({ zoom: clamp(next, ZOOM.min, ZOOM.max) });
      },
    }),
    {
      name: "settings",
      version: 1,
      // guarda só os valores: as ações são recriadas a cada carga, e serializar
      // função no localStorage deixaria lixo que nunca mais volta a ser função
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      partialize: ({ set, reset, stepZoom, ...valores }) => valores,
    },
  ),
);

/** Atalho para call sites fora de componentes. */
export const settings = {
  get: () => useSettings.getState(),
  set: (patch: Partial<SettingsValues>) => useSettings.getState().set(patch),
};

// ── efeitos no documento ───────────────────────────────────────────────────

/**
 * Escreve as preferências visuais no `<html>`.
 *
 * `font-size` no root faz o app inteiro escalar junto (todo `rem`/`text-*` do
 * Tailwind deriva dele); `zoom` é multiplicativo por cima disso, como o
 * Ctrl+= do Discord. `reduzir-movimento` e a saturação viram classe/variável
 * consumidas em `globals.css` — um lugar só decide, o CSS aplica.
 */
export function applySettingsToDocument(s: SettingsValues): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.fontSize = `${clamp(s.fontScale, FONT_SCALE.min, FONT_SCALE.max)}px`;
  root.style.setProperty("--zoom", String(clamp(s.zoom, ZOOM.min, ZOOM.max)));
  root.style.setProperty("--espaco-entre-grupos", `${s.groupSpacing}px`);
  root.style.setProperty("--tamanho-emoji", `${s.emojiSize}px`);
  root.style.setProperty("--saturacao", `${clamp(s.saturation, 0, 100) / 100}`);
  root.classList.toggle("reduzir-movimento", s.reduceMotion);
  // o filtro só entra quando muda algo: `saturate(1)` custaria uma camada de
  // composição em toda a árvore sem mudar um pixel
  root.classList.toggle("cores-ajustadas", s.saturation !== 100);
  root.classList.toggle("modo-compacto", s.compactMode);
  root.lang = s.locale;
}

if (typeof window !== "undefined") {
  applySettingsToDocument(useSettings.getState());
  useSettings.subscribe(applySettingsToDocument);
}
