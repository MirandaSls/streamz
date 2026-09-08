"use client";

import type { SoundboardSound } from "@streamz/shared";
import { aplicarSaida, useVoiceDevicesStore } from "@/stores/voiceDevices";
import { useVoicePrefs } from "@/stores/voicePrefs";

/**
 * Tocar um efeito sonoro do painel — **localmente**, neste cliente.
 *
 * Isto é o coração do "tocar para todo mundo": ninguém mistura áudio em faixa
 * nenhuma. Quem aperta o card chama a API, a API manda um `soundboard.play`
 * para quem está no canal de voz, e **cada um dos que ouvem chama esta função**
 * com o volume de efeitos que escolheu. O LiveKit não sabe que isso existe.
 *
 * Por que não fica em `lib/ringtone.ts`, que já toca arquivo: os sons de lá são
 * um vocabulário fechado (`NomeDeSom` é uma união de literais, com fator de
 * volume por nome e interruptor por som na aba Notificações). O efeito sonoro é
 * o oposto — URL arbitrária vinda do servidor, volume próprio de cada arquivo,
 * e um único controle de volume, dele. Encaixar um no outro obrigaria a abrir o
 * `NomeDeSom` para `string` e a inventar um interruptor por som que ninguém
 * pediu.
 *
 * O que **é** compartilhado com aquele arquivo, de propósito:
 *
 * - **saída de áudio**: quem escolheu um fone na aba "Voz e vídeo" ouve o
 *   efeito nele, não no alto-falante do sistema (`aplicarSaida`);
 * - **elemento por URL**: criar um `Audio` a cada disparo vaza memória, e num
 *   painel de efeitos o mesmo arquivo é apertado em sequência;
 * - **falhar em silêncio**: som de interface é enfeite. Autoplay bloqueado ou
 *   arquivo fora do ar não vira erro na tela de ninguém.
 *
 * O que **não** é: a guarda de 300 ms do `ringtone`. Lá ela existe para o mesmo
 * aviso não se sobrepor a si mesmo; aqui, apertar o mesmo som de novo é
 * justamente a intenção — o teto é do servidor (um por segundo, por pessoa).
 */

/** Elementos reaproveitados por URL. */
const elementos = new Map<string, HTMLAudioElement>();

/** Última saída já aplicada a cada elemento (trocar no meio do play dá salto). */
const saidaAplicada = new WeakMap<HTMLMediaElement, string | null>();

/**
 * Volume final de um efeito, de 0 a 1.
 *
 * Dois fatores, e eles respondem a perguntas diferentes: `volume` é **quanto o
 * ouvinte quer de efeitos** (o deslizador do painel), e `sound.volume` é
 * **quanto aquele arquivo pede** — os sons chegam masterizados em níveis
 * diferentes, e sem o segundo fator um "airhorn" sai muito acima de um "golf
 * clap" no mesmo ajuste.
 */
export function volumeDoEfeito(sound: SoundboardSound, volume: number): number {
  return Math.min(1, Math.max(0, volume * (sound.volume || 1)));
}

/**
 * Toca o efeito, ou não faz nada.
 *
 * Não toca quando o volume de efeitos está em zero (é o que o botão de mudo do
 * painel significa) nem quando a pessoa está **surda**: quem desligou o áudio da
 * chamada não deve ouvir justamente o som que a chamada dispara.
 */
export function tocarEfeitoSonoro(sound: SoundboardSound, volume: number): void {
  if (typeof Audio === "undefined") return;
  if (useVoicePrefs.getState().deafened) return;
  const nivel = volumeDoEfeito(sound, volume);
  if (nivel <= 0) return;
  try {
    let el = elementos.get(sound.url);
    if (!el) {
      el = new Audio(sound.url);
      el.preload = "auto";
      elementos.set(sound.url, el);
    }
    const escolhida = useVoiceDevicesStore.getState().outputId;
    if (!saidaAplicada.has(el) || saidaAplicada.get(el) !== escolhida) {
      saidaAplicada.set(el, escolhida);
      void aplicarSaida(el, escolhida);
    }
    el.volume = nivel;
    el.currentTime = 0;
    void el.play().catch(() => {
      // autoplay bloqueado ou arquivo indisponível: silêncio, não erro
    });
  } catch {
    // sem suporte a áudio
  }
}

/**
 * Duração de um arquivo de áudio local, em ms — o que a API não consegue medir.
 *
 * Usado antes do envio: sem decodificador no servidor, o teto de segundos só
 * existe se alguém o medir, e o único lugar com um decodificador de áudio à mão
 * é o navegador de quem envia. Devolve `null` quando o navegador não consegue
 * ler (arquivo corrompido, formato que ele não toca) — aí a decisão é de quem
 * chama, e o servidor ainda barra por tipo e tamanho.
 */
export function duracaoDoArquivo(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof Audio === "undefined" || typeof URL === "undefined") {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const terminar = (ms: number | null) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    el.addEventListener("loadedmetadata", () =>
      terminar(Number.isFinite(el.duration) ? el.duration * 1000 : null),
    );
    el.addEventListener("error", () => terminar(null));
    el.preload = "metadata";
    el.src = url;
  });
}
