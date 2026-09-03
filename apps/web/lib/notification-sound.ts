/**
 * Som de mensagem nova: o arquivo original do Discord (`public/sons/mensagem.mp3`,
 * ~0,5 s). Era um WAV de dois tons embutido em base64; o usuário pediu o som
 * que já conhece (2026-09-03).
 *
 * É um envelope de uma linha sobre `tocarSom("mensagem")`: arquivo, volume,
 * interruptores e a guarda de 300 ms vivem todos em `lib/ringtone.ts`. Assinar
 * um `volume` aqui é o que fazia a mensagem sair em `1` (volume cheio) quando
 * quem chamava esquecia de passá-lo, enquanto o resto do app respeitava o
 * `outputVolume`.
 */

import { tocarSom } from "@/lib/ringtone";

/** Toca o som de mensagem. `forcar` só para a prévia da aba Notificações. */
export function tocarSomDeNotificacao(opcoes: { forcar?: boolean } = {}): void {
  tocarSom("mensagem", opcoes);
}
