/**
 * Sons da voz e da chamada: o toque, o ringback e os avisos curtos de
 * mudo/surdo/entrar/sair/transmissão.
 *
 * São os **arquivos originais do Discord**, em `public/sons/` (copiados de
 * `docs/Reference/audio/`, que está fora do git). Nada mais é sintetizado: a
 * primeira leva deixou entrar/alguém-entrou como tons do Web Audio porque o
 * arquivo ainda não existia, e era exatamente isso que soava "errado" para
 * quem conhece o som do Discord de ouvido.
 *
 * O mapeamento, decidido pelo usuário (arquivo de origem → nosso arquivo → uso):
 *
 * | origem | nosso | quando toca |
 * |---|---|---|
 * | `discord-notification.mp3` | `mensagem.mp3` | mensagem nova (`notification-sound.ts`) |
 * | `discord-call-sound.mp3` | `chamada.mp3` | chamada recebida (em loop) **e** o ringback de quem liga |
 * | `discord mute.mp3` | `mudo.mp3` | mutar o microfone **e** desligar o áudio (surdo) |
 * | `discord-unmute-sound.mp3` | `desmudo.mp3` | desmutar **e** religar o áudio |
 * | `user_join.mp3` | `entrar.mp3` | eu entrei na chamada **e** alguém entrou |
 * | `discord connect and disconect.mp3` | `sair.mp3` | eu saí **e** alguém saiu |
 * | `discord_start_screan.mp3` | `transmissao-iniciada.mp3` | a **minha** transmissão de tela começou |
 * | `discord-stream-stop.mp3` | `transmissao-encerrada.mp3` | a minha transmissão terminou |
 * | `discord-user-moved.mp3` | `movido.mp3` | fui movido de canal — ainda **sem chamador** (a API não move ninguém) |
 *
 * Mudo e surdo dividem o mesmo par de arquivos de propósito: é o que o usuário
 * pediu, e é o que o Discord faz.
 *
 * Os arquivos são servidos junto com o app (`/sons/...`): no desktop vão
 * dentro do `.exe` (frontendDist) e a CSP já libera `media-src 'self'`.
 * `'self'` é a origem do documento, que no Windows é `http://tauri.localhost`
 * (`use_https_scheme` é `false` por padrão) — a mesma de onde o protocolo do
 * Tauri devolve `/sons/chamada.mp3`, com `audio/mpeg` no `Content-Type`
 * (o `infer` do `tauri-utils` reconhece o `ID3` do arquivo).
 *
 * Duas coisas **não** são de graça e estão tratadas aqui:
 *
 * - **Autoplay.** O toque é o único som que precisa começar sem gesto nenhum.
 *   Ver `toque-com-gesto.ts` e a flag do WebView2 em `src-tauri/src/main.rs`.
 * - **Saída de áudio.** Quem escolheu um fone na aba "Voz e vídeo" espera o
 *   telefone tocando **nele**, não no alto-falante padrão do sistema. O áudio
 *   remoto já faz isso (`AudioRemotoHost` → `aplicarSaida`); os sons daqui
 *   passaram a fazer também.
 */

import { pararToqueEm, tocarToqueEm } from "@/lib/toque-com-gesto";
import { somLigado } from "@/stores/sons";
import { useSettings } from "@/stores/settings";
import { aplicarSaida, useVoiceDevicesStore } from "@/stores/voiceDevices";

/** Toque de chamada recebida, para o `src` de um `<audio loop>`. */
export function toqueDeChamadaUrl(): string {
  return "/sons/chamada.mp3";
}

/** Ringback — o mesmo toque, do lado de quem liga. */
export function ringbackUrl(): string {
  return toqueDeChamadaUrl();
}

/**
 * Prepara um `<audio loop>` de toque (a chamada recebida e o ringback de quem
 * liga) e diz se ele pode tocar.
 *
 * Existe porque esses dois são elementos do React, não passam por `tocarSom`, e
 * por isso saíam sempre em volume cheio e ignorando os interruptores: quem
 * baixou o volume de saída ou desligou "Chamada recebida" na aba Notificações
 * levava o toque na mesma altura de antes.
 */
export function prepararToque(el: HTMLAudioElement | null): boolean {
  if (!el) return false;
  el.volume = Math.min(1, Math.max(0, volumeDeSaida()));
  aplicarSaidaEscolhida(el);
  return useSettings.getState().notificationSound && somLigado("chamada");
}

/**
 * Começa (ou recomeça) o toque, com a retomada no primeiro gesto se o autoplay
 * recusar. Só para o toque e o ringback: um aviso curto que chegasse atrasado,
 * no clique seguinte, seria pior do que não tocar.
 */
export function tocarToque(el: HTMLAudioElement | null): void {
  if (!el) return;
  void tocarToqueEm(el, typeof window === "undefined" ? null : window);
}

/** Para o toque e desarma a espera por gesto, se houver. */
export function pararToque(el: HTMLAudioElement | null): void {
  if (!el) return;
  pararToqueEm(el);
}

/** Manda o elemento para o dispositivo de saída escolhido nas configurações. */
function aplicarSaidaEscolhida(el: HTMLAudioElement): void {
  void aplicarSaida(el, useVoiceDevicesStore.getState().outputId);
}

/** Elementos reaproveitados por arquivo: criar um `Audio` por toque vazaria memória. */
const elementos = new Map<string, HTMLAudioElement>();

/**
 * Toca um arquivo curto do começo. `volume` vai de 0 a 1.
 *
 * Falha em silêncio de propósito: som de interface é enfeite — se o navegador
 * bloquear (autoplay antes do primeiro gesto), o estado visual já contou a
 * história.
 */
export function tocarArquivo(url: string, volume: number): void {
  if (typeof Audio === "undefined") return;
  try {
    let el = elementos.get(url);
    if (!el) {
      el = new Audio(url);
      el.preload = "auto";
      elementos.set(url, el);
    }
    aplicarSaidaEscolhida(el);
    el.volume = Math.min(1, Math.max(0, volume));
    el.currentTime = 0;
    void el.play().catch(() => {
      // autoplay bloqueado ou arquivo indisponível: silêncio, não erro
    });
  } catch {
    // sem suporte a áudio
  }
}

/** Volume de saída das configurações, de 0 a 1 — o mesmo do resto do app. */
export function volumeDeSaida(): number {
  return useSettings.getState().outputVolume / 100;
}

// ── avisos curtos ──────────────────────────────────────────────────────────

export type SomDeVoz =
  | "mudo"
  | "desmudo"
  | "surdo"
  | "nao-surdo"
  | "entrar"
  | "sair"
  | "alguem-entrou"
  | "alguem-saiu"
  | "transmissao-iniciada"
  | "transmissao-encerrada"
  | "movido";

/** Qual arquivo toca cada aviso. Todos têm arquivo: nada aqui é sintetizado. */
const ARQUIVOS: Record<SomDeVoz, string> = {
  mudo: "/sons/mudo.mp3",
  desmudo: "/sons/desmudo.mp3",
  surdo: "/sons/mudo.mp3",
  "nao-surdo": "/sons/desmudo.mp3",
  entrar: "/sons/entrar.mp3",
  sair: "/sons/sair.mp3",
  "alguem-entrou": "/sons/entrar.mp3",
  "alguem-saiu": "/sons/sair.mp3",
  "transmissao-iniciada": "/sons/transmissao-iniciada.mp3",
  "transmissao-encerrada": "/sons/transmissao-encerrada.mp3",
  movido: "/sons/movido.mp3",
};

/**
 * Toca um aviso curto no volume de saída das configurações (ou no `volume`
 * dado, de 0 a 1).
 *
 * O filtro vive aqui, e não em cada chamador, para que desligar um item na aba
 * "Notificações" valha em todo lugar que toca aquele som — e o interruptor
 * mestre (`notificationSound`) vale junto, que é o que a aba promete ao
 * desabilitar a lista inteira quando ele está desligado. `forcar` é para a
 * prévia da própria aba, que precisa tocar mesmo o que está desligado.
 */
export function tocarSom(nome: SomDeVoz, volume = volumeDeSaida(), forcar = false) {
  if (!forcar && (!useSettings.getState().notificationSound || !somLigado(nome))) return;
  tocarArquivo(ARQUIVOS[nome], volume);
}

/**
 * "Você foi movido de canal".
 *
 * Fica pronto e **sem chamador**: mover alguém de canal não existe na API nem
 * no gateway ainda. Quando existir, o handler do evento chama isto — o som já
 * está no lugar, na lista da aba "Notificações" e com interruptor próprio.
 */
export function tocarSomDeMovido(volume = volumeDeSaida()): void {
  tocarSom("movido", volume);
}
