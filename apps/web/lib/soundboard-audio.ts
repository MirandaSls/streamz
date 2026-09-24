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
 *
 * É a porta de quem **ouve o `soundboard.play`** (`hooks/useRealtime.ts`); o
 * tocar em si é `tocarNaSaida`, que hoje já checa `deafened` sozinha — a
 * checagem aqui é redundante, mas inofensiva.
 */
export function tocarEfeitoSonoro(sound: SoundboardSound, volume: number): void {
  if (useVoicePrefs.getState().deafened) return;
  tocarNaSaida(sound.url, volumeDoEfeito(sound, volume));
}

/**
 * Toca um arquivo na saída de áudio escolhida em "Voz e vídeo", no volume dado
 * (0 a 1) — e não toca se a pessoa está **surda**.
 *
 * Antes esta função tocava a prévia mesmo ensurdecida (era o gesto deliberado
 * da aba "Painel de efeitos sonoros" e do modal "Adicionar som", sem chamada
 * envolvida). Mudança de pedido: ensurdecer agora cala tudo, prévia inclusa —
 * não há mais exceção, nem aqui nem nos dois chamadores.
 *
 * Devolve o elemento (ou `null` quando nada tocou) para quem precisa **parar**
 * a prévia — trocar de som, sair da aba.
 */
export function tocarNaSaida(url: string, volume: number): HTMLAudioElement | null {
  if (useVoicePrefs.getState().deafened) return null;
  if (typeof Audio === "undefined") return null;
  const nivel = Math.min(1, Math.max(0, volume));
  if (nivel <= 0) return null;
  try {
    let el = elementos.get(url);
    if (!el) {
      el = new Audio(url);
      el.preload = "auto";
      elementos.set(url, el);
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
    return el;
  } catch {
    // sem suporte a áudio
    return null;
  }
}

/**
 * Esquece o elemento de uma URL — para a URL que **morre**.
 *
 * O cache por URL é certo para os sons do servidor (o arquivo de um id nunca
 * muda), mas a prévia do modal "Adicionar som" toca um `blob:` do arquivo local,
 * e cada arquivo escolhido é uma URL nova que é revogada logo depois. Sem isto o
 * mapa guardaria um `Audio` apontando para um blob morto a cada troca.
 */
export function soltarElemento(url: string): void {
  const el = elementos.get(url);
  if (!el) return;
  el.pause();
  elementos.delete(url);
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
