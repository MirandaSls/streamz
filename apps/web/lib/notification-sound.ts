/**
 * Som de mensagem nova: o arquivo original do Discord (`public/sons/mensagem.mp3`,
 * ~0,5 s). Era um WAV de dois tons embutido em base64; o usuário pediu o som
 * que já conhece (2026-09-03).
 *
 * O browser só deixa tocar áudio depois de alguma interação do usuário; por
 * isso a reprodução engole a rejeição em silêncio em vez de derrubar o fluxo
 * de mensagens (ver `tocarArquivo`).
 */

import { tocarArquivo } from "@/lib/ringtone";

export const SOM_DE_MENSAGEM_URL = "/sons/mensagem.mp3";

/** Toca o som de mensagem. `volume` vai de 0 a 1. */
export function tocarSomDeNotificacao(volume = 1): void {
  tocarArquivo(SOM_DE_MENSAGEM_URL, volume);
}
