/**
 * Atalhos de teclado do app: o texto ("Ctrl+Shift+M") vira combinação, e a
 * combinação sabe se um `KeyboardEvent` a satisfaz.
 *
 * A lógica é pura de propósito — quem escuta o teclado é
 * `hooks/useKeyboardShortcuts`, quem desenha a lista é a aba "Teclado". Aqui só
 * existe o parser, o formatador e o comparador, que são o que dá para testar
 * sem DOM e o que quebra em silêncio quando alguém digita "Ctrl + Alt + Up".
 */

export interface Shortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** tecla normalizada em minúscula ("m", "arrowup", "escape", "="). */
  key: string;
}

/** Ações que um atalho dispara. O handler mora em `useKeyboardShortcuts`. */
export type ShortcutAction =
  | "canalAnterior"
  | "canalProximo"
  | "naoLidoAnterior"
  | "naoLidoProximo"
  | "servidorAnterior"
  | "servidorProximo"
  | "marcarLido"
  | "marcarServidorLido"
  | "alternarMudo"
  | "alternarSurdo"
  | "quickSwitcher"
  | "configuracoes"
  | "mostrarAtalhos"
  | "zoomMais"
  | "zoomMenos"
  | "zoomPadrao";

export interface ShortcutSpec {
  action: ShortcutAction;
  /** combinações que disparam a ação (a primeira é a mostrada na aba Teclado). */
  combos: string[];
  /** chave do dicionário de `lib/i18n` com a descrição. */
  label: string;
}

/** Todos os atalhos do app, na ordem em que a aba "Teclado" os lista. */
export const SHORTCUTS: readonly ShortcutSpec[] = [
  { action: "quickSwitcher", combos: ["Ctrl+K"], label: "atalho.quickSwitcher" },
  { action: "canalProximo", combos: ["Alt+ArrowDown"], label: "atalho.canalProximo" },
  { action: "canalAnterior", combos: ["Alt+ArrowUp"], label: "atalho.canalAnterior" },
  { action: "naoLidoProximo", combos: ["Alt+Shift+ArrowDown"], label: "atalho.naoLidoProximo" },
  { action: "naoLidoAnterior", combos: ["Alt+Shift+ArrowUp"], label: "atalho.naoLidoAnterior" },
  { action: "servidorProximo", combos: ["Ctrl+Alt+ArrowDown"], label: "atalho.servidorProximo" },
  { action: "servidorAnterior", combos: ["Ctrl+Alt+ArrowUp"], label: "atalho.servidorAnterior" },
  { action: "marcarLido", combos: ["Escape"], label: "atalho.marcarLido" },
  { action: "marcarServidorLido", combos: ["Shift+Escape"], label: "atalho.marcarServidorLido" },
  { action: "alternarMudo", combos: ["Ctrl+Shift+M"], label: "atalho.alternarMudo" },
  { action: "alternarSurdo", combos: ["Ctrl+Shift+D"], label: "atalho.alternarSurdo" },
  { action: "configuracoes", combos: ["Ctrl+,"], label: "atalho.configuracoes" },
  { action: "mostrarAtalhos", combos: ["Ctrl+/"], label: "atalho.mostrarAtalhos" },
  { action: "zoomMais", combos: ["Ctrl+=", "Ctrl+Shift+="], label: "atalho.zoomMais" },
  { action: "zoomMenos", combos: ["Ctrl+-"], label: "atalho.zoomMenos" },
  { action: "zoomPadrao", combos: ["Ctrl+0"], label: "atalho.zoomPadrao" },
];

type Modificador = "ctrl" | "alt" | "shift" | "meta";

const MODIFICADORES: Record<string, Modificador> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
};

/** Apelidos aceitos no texto do atalho para teclas sem letra. */
const APELIDOS: Record<string, string> = {
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  esc: "escape",
  space: " ",
  spacebar: " ",
  plus: "=",
  minus: "-",
  enter: "enter",
  return: "enter",
};

/** Como cada tecla aparece na aba "Teclado". */
const SIMBOLOS: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  escape: "Esc",
  enter: "Enter",
  " ": "Espaço",
};

/**
 * Normaliza a tecla de um evento ou de um texto.
 *
 * Minúscula porque `Ctrl+Shift+M` chega como `"M"`; `+` vira `=` porque a mesma
 * tecla física manda um ou outro conforme o Shift — sem isso, Ctrl+= só
 * funcionaria em metade dos teclados.
 */
export function normalizeKey(key: string): string {
  const k = key.toLowerCase();
  // a mesma tecla física manda "+" ou "=" conforme o Shift
  if (k === "+") return "=";
  if (k === "_") return "-";
  return APELIDOS[k] ?? k;
}

/**
 * Lê "Ctrl+Shift+M" (ou "Alt+Up", "Ctrl++"). Devolve null quando não sobra
 * tecla nenhuma além dos modificadores — atalho só de Ctrl não existe.
 */
export function parseShortcut(text: string): Shortcut | null {
  const bruto = text.split("+").map((t) => t.trim());
  // "Ctrl++" e "Ctrl+" viram ["Ctrl","",""] / ["Ctrl",""]: o separador *é* a tecla
  const partes = bruto.map((t, i) => (t === "" && i > 0 ? "+" : t)).filter((t) => t !== "");
  if (partes.length === 0) return null;

  const atalho: Shortcut = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
  for (const parte of partes) {
    const mod = MODIFICADORES[parte.toLowerCase()];
    if (mod) {
      atalho[mod] = true;
      continue;
    }
    atalho.key = normalizeKey(parte);
  }
  return atalho.key ? atalho : null;
}

/** Texto de exibição de uma combinação ("Ctrl + Shift + M"). */
export function formatShortcut(text: string): string {
  const atalho = parseShortcut(text);
  if (!atalho) return text;
  const partes: string[] = [];
  if (atalho.ctrl) partes.push("Ctrl");
  if (atalho.alt) partes.push("Alt");
  if (atalho.shift) partes.push("Shift");
  if (atalho.meta) partes.push("Meta");
  partes.push(SIMBOLOS[atalho.key] ?? atalho.key.toUpperCase());
  return partes.join(" + ");
}

/** O mínimo de um `KeyboardEvent` que um atalho precisa olhar. */
export interface TeclaPressionada {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/**
 * true quando o evento satisfaz a combinação.
 *
 * Ctrl e Meta são intercambiáveis para que o mesmo registro sirva no macOS sem
 * uma segunda tabela de atalhos.
 */
export function matchesShortcut(event: TeclaPressionada, combo: string): boolean {
  const atalho = parseShortcut(combo);
  if (!atalho) return false;
  if (normalizeKey(event.key) !== atalho.key) return false;
  const comando = event.ctrlKey || event.metaKey;
  if ((atalho.ctrl || atalho.meta) !== comando) return false;
  if (atalho.alt !== event.altKey) return false;
  if (atalho.shift !== event.shiftKey) return false;
  return true;
}

/** Primeira ação cujo atalho casa com o evento (null quando nenhuma casa). */
export function actionForEvent(
  event: TeclaPressionada,
  specs: readonly ShortcutSpec[] = SHORTCUTS,
): ShortcutAction | null {
  for (const spec of specs) {
    if (spec.combos.some((combo) => matchesShortcut(event, combo))) return spec.action;
  }
  return null;
}
