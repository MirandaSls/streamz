#!/usr/bin/env node
/**
 * Codemod da onda 0.8: troca os nomes antigos de cor (panel, chat, txt-*,
 * accent…) pelo nome do token do Discord que o apelido já apontava
 * (`tailwind.config.ts`, `apelidosDaMigracao`). O mapa é 1:1 com os apelidos,
 * então o CSS gerado não muda — muda só o vocabulário.
 *
 *   node scripts/paridade/renomear-tokens.mjs [--verificar]
 *
 * `--verificar` não escreve: só lista o que sobraria com nome antigo.
 *
 * **Já aplicado (onda 0.8) e NÃO é idempotente**: `border-strong` é nome antigo
 * e nome novo ao mesmo tempo (o antigo `border-strong-hover` virou o
 * `border-strong` do Discord), então uma segunda passada o renomearia de novo.
 * Fica no repositório como registro do mapa, não para ser rodado outra vez.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = join(RAIZ, "apps/web");
const PASTAS = ["app", "components", "lib", "hooks", "stores"].map((p) => join(WEB, p));
const VERIFICAR = process.argv.includes("--verificar");

/** nome antigo → nome do token do Discord (mesma ordem dos apelidos). */
const MAPA = {
  panel: "background-base-lowest",
  footer: "background-base-low",
  chat: "background-base-lower",
  input: "chat-background-default",
  msghov: "message-background-hover",
  hov: "interactive-background-hover",
  sel: "interactive-background-selected",
  void: "input-background-default",
  border: "border-subtle",
  "border-strong": "border-normal",
  "border-strong-hover": "border-strong",
  overlay: "background-surface-higher",
  "rail-divider": "app-frame-border",
  scroll: "scrollbar-thin-thumb",
  accent: "brand-500",
  "accent-hover": "control-primary-background-hover",
  "accent-press": "control-primary-background-active",
  "accent-ink": "control-primary-text-default",
  mention: "mention-foreground",
  green: "status-positive",
  yellow: "status-warning",
  red: "status-danger",
  "red-hover": "control-critical-primary-background-hover",
  "txt-primary": "text-strong",
  "txt-normal": "text-default",
  "txt-secondary": "text-subtle",
  "txt-muted": "text-muted",
  "txt-faint": "channels-default",
  "txt-link": "text-link",
};
/** Sombras: `high` era a combinação de popout do Discord; `header`, a elevação baixa. */
const SOMBRAS = { high: "popout", header: "elevation-low" };

// Utilitários do Tailwind que recebem cor. `border-x`, `border-t`… também.
const UTIL = [
  "bg", "text", "border", "border-[trblxyse]", "ring", "ring-offset", "outline",
  "fill", "stroke", "from", "via", "to", "divide", "placeholder", "caret",
  "decoration", "accent",
];
// nomes mais longos primeiro, para `border-strong-hover` não virar `border-strong` + `-hover`
const nomes = Object.keys(MAPA).sort((a, b) => b.length - a.length);
const esc = (s) => s.replace(/[-]/g, "\\-");
const RE = new RegExp(
  `(?<![\\w-])((?:${UTIL.join("|")}))-(${nomes.map(esc).join("|")})(?![\\w-])`,
  "g",
);
const RE_SOMBRA = new RegExp(`(?<![\\w-])shadow-(${Object.keys(SOMBRAS).join("|")})(?![\\w-])`, "g");

function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...arquivos(p));
    else if (/\.(tsx?|css)$/.test(nome) && !nome.endsWith("tokens.css")) saida.push(p);
  }
  return saida;
}

let total = 0;
let tocados = 0;
for (const arq of PASTAS.flatMap(arquivos)) {
  const antes = readFileSync(arq, "utf8");
  let n = 0;
  const depois = antes
    .replace(RE, (_, util, nome) => {
      n++;
      return `${util}-${MAPA[nome]}`;
    })
    .replace(RE_SOMBRA, (_, nome) => {
      n++;
      return `shadow-${SOMBRAS[nome]}`;
    });
  if (n === 0) continue;
  total += n;
  tocados++;
  if (VERIFICAR) console.log(`${arq.slice(RAIZ.length + 1)}: ${n}`);
  else writeFileSync(arq, depois);
}
console.log(`${VERIFICAR ? "sobrariam" : "trocados"}: ${total} usos em ${tocados} arquivos`);
