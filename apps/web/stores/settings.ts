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

/**
 * Escala da fonte: px escritos em `html { font-size }`, de onde sai todo `rem`
 * do Tailwind (texto e espaçamento). O padrão é **15,5px**, 3,1% abaixo dos 16
 * do Discord — o pedido foi "um pouco menor", e é o único ponto do app que
 * encolhe o texto inteiro de uma vez. Superfície medida em px (cabeçalho de 49,
 * linha de conversa, ícone) não muda: por isso a redução é pequena.
 *
 * O passo é de meio pixel porque 15,5 precisa estar na grade do deslizador —
 * um padrão que o próprio controle não alcança não volta depois de arrastado.
 */
export const FONT_SCALE = { min: 12, max: 24, step: 0.5, default: 15.5 };
// 17px é o respiro que o Discord usa entre grupos de mensagens
export const GROUP_SPACING = { min: 0, max: 24, step: 1, default: 17 };
// 20px é o emoji do chip de reação do Discord, medido no print
// `docs/Reference/Captura de tela 2026-08-31 120906.png` (chip 😍 1 com o avatar
// de 40px confirmando escala 1:1): tinta do emoji de 20×20 dentro de um chip de
// 52×30. O padrão era 22 num chip fixo de 24 e o glifo do Segoe UI Emoji — cuja
// tinta ocupa o em inteiro — pintava por cima da própria borda de baixo.
export const EMOJI_SIZE = { min: 16, max: 48, step: 2, default: 20 };

/**
 * Altura do chip de reação para um emoji de lado `tamanho`.
 *
 * 30px com o emoji de 20 é a medida do Discord (mesmo print): borda de 1, 4px
 * de folga acima e 4 abaixo do emoji. Os 10px de folga acompanham o controle de
 * tamanho do emoji — é isso que impede o glifo de encostar na borda quando o
 * usuário sobe o valor, em vez de o chip continuar fixo e o emoji transbordar.
 *
 * Mora aqui, e não no componente, porque a prévia das configurações desenha o
 * mesmo chip e não pode divergir dele.
 */
export function alturaDoChipDeReacao(tamanho: number): number {
  return Math.max(30, tamanho + 10);
}
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

  /**
   * Modo desenvolvedor: revela "Copiar ID" nos menus de contexto. Sem ele o
   * item aparecia para todo mundo, poluindo menus que no Discord têm 5 linhas.
   */
  developerMode: boolean;
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
  developerMode: false,
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
      version: 2,
      /**
       * v1 → v2: o padrão da escala da fonte caiu de 16px para 15,5px.
       *
       * `partialize` grava todos os valores no primeiro uso, então quem nunca
       * tocou no controle tem `fontScale: 16` guardado e ficaria no tamanho
       * antigo para sempre. Quem está **exatamente** no padrão antigo vai para o
       * novo; quem escolheu outro número mantém a escolha (16 escolhido de
       * propósito é indistinguível de 16 nunca tocado, e o preço de errar é um
       * meio pixel).
       */
      migrate: (persistido, versao) => {
        const valores = persistido as Partial<SettingsValues> | undefined;
        if (!valores) return valores;
        if (versao < 2 && valores.fontScale === 16) {
          return { ...valores, fontScale: FONT_SCALE.default };
        }
        return valores;
      },
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
