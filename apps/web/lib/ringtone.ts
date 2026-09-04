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
 * Quatro coisas **não** são de graça e estão tratadas aqui:
 *
 * - **Autoplay.** O toque é o único som que precisa começar sem gesto nenhum.
 *   Ver `toque-com-gesto.ts` e a flag do WebView2 em `src-tauri/src/main.rs`.
 * - **Saída de áudio.** Quem escolheu um fone na aba "Voz e vídeo" espera o
 *   telefone tocando **nele**, não no alto-falante padrão do sistema. O áudio
 *   remoto já faz isso (`AudioRemotoHost` → `aplicarSaida`); os sons daqui
 *   passaram a fazer também. O `setSinkId` só é reaplicado quando a escolha
 *   **mudou** (`SAIDA_APLICADA`): trocar a rota de um elemento no meio do
 *   `play()` produz um salto de nível audível, e antes isso acontecia em todo
 *   toque.
 * - **Um som não se sobrepõe a si mesmo.** Toda entrada passa por
 *   `JANELA_SEM_REPETIR_MS`: dois pedidos do *mesmo arquivo* a menos de 300 ms
 *   viram um, como no Discord. É o que conserta o "toca várias vezes ao mesmo
 *   tempo" — a origem da repetição varia (o `useEffect` remontando em
 *   desenvolvimento, um caminho de voz que chama o mesmo aviso duas vezes, o
 *   mesmo elemento reiniciado no meio da reprodução), mas o efeito é sempre o
 *   mesmo e o remédio mora num lugar só.
 * - **Um dono do volume.** `volumeDoSom()` é o **único** ponto que decide
 *   quanto sai: `outputVolume` das configurações × o fator do som (`FATOR`).
 *   Ninguém mais passa volume — antes eram quatro contas diferentes espalhadas
 *   (a mensagem tinha `1` como padrão, o toque em loop tinha outra), e o
 *   resultado era o "os sons ficam variando de volume do nada".
 */

import { pararToqueEm, tocarToqueEm } from "@/lib/toque-com-gesto";
import { somLigado } from "@/stores/sons";
import { useSettings } from "@/stores/settings";
import { aplicarSaida, useVoiceDevicesStore } from "@/stores/voiceDevices";

// ── o vocabulário de sons ──────────────────────────────────────────────────

/** Avisos curtos da voz. */
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

/**
 * Todo som que o app sabe tocar. Mora aqui, e não em `stores/sons`, porque é a
 * chave dos dois mapas abaixo (arquivo e fator de volume); a store dos
 * interruptores reexporta o tipo para quem só lida com a lista da aba
 * "Notificações".
 */
export type NomeDeSom = "mensagem" | "chamada" | SomDeVoz;

/** Qual arquivo toca cada som. Todos têm arquivo: nada aqui é sintetizado. */
const ARQUIVOS: Record<NomeDeSom, string> = {
  mensagem: "/sons/mensagem.mp3",
  chamada: "/sons/chamada.mp3",
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
 * Quanto de `outputVolume` cada som usa.
 *
 * Os arquivos do Discord estão masterizados em níveis diferentes e o app tocava
 * todos em volume cheio: o bipe de "microfone mudo" saía tão alto quanto o
 * telefone tocando. A mistura aqui é a mesma ordem do Discord — a chamada é o
 * som que precisa acordar alguém; os avisos de voz são os que mais se repetem,
 * e por isso são os mais baixos.
 *
 * Só o fator é opinião; o resto é o volume que o usuário escolheu.
 */
const FATOR: Record<NomeDeSom, number> = {
  // 2026-09-03: o usuário achou tudo alto demais ("mutar está extremamente
  // alto; coloque bem baixo"). Mudo/desmudo são os mais baixos de todos.
  mensagem: 0.15,
  chamada: 0.35,
  mudo: 0.08,
  desmudo: 0.08,
  surdo: 0.08,
  "nao-surdo": 0.08,
  entrar: 0.2,
  sair: 0.2,
  "alguem-entrou": 0.2,
  "alguem-saiu": 0.2,
  "transmissao-iniciada": 0.2,
  "transmissao-encerrada": 0.2,
  movido: 0.2,
};

/** Dois pedidos do mesmo arquivo dentro desta janela viram um (a do Discord). */
export const JANELA_SEM_REPETIR_MS = 300;

// ── volume: o único lugar que decide ───────────────────────────────────────

/** Volume de saída das configurações, de 0 a 1 — o mesmo do resto do app. */
export function volumeDeSaida(): number {
  return useSettings.getState().outputVolume / 100;
}

/** Quanto este som sai, de 0 a 1. **Ninguém mais calcula volume de som.** */
export function volumeDoSom(nome: NomeDeSom): number {
  return Math.min(1, Math.max(0, volumeDeSaida() * FATOR[nome]));
}

// ── o toque em loop (chamada recebida e ringback) ──────────────────────────

/** Toque de chamada recebida, para o `src` de um `<audio loop>`. */
export function toqueDeChamadaUrl(): string {
  return ARQUIVOS.chamada;
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
 * levava o toque na mesma altura de antes. O volume sai do mesmo
 * `volumeDoSom("chamada")` do resto — dois elementos tocando o mesmo arquivo
 * não podem estar em níveis diferentes.
 */
export function prepararToque(el: HTMLAudioElement | null): boolean {
  if (!el) return false;
  el.volume = volumeDoSom("chamada");
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

// ── tocar um arquivo ───────────────────────────────────────────────────────

/** Elementos reaproveitados por arquivo: criar um `Audio` por toque vazaria memória. */
const elementos = new Map<string, HTMLAudioElement>();

/** Última saída já aplicada a cada elemento — ver o comentário do cabeçalho. */
const saidaAplicada = new WeakMap<HTMLMediaElement, string | null>();

/** Quando cada arquivo tocou pela última vez (a guarda dos 300 ms). */
const ultimoToque = new Map<string, number>();

/** Manda o elemento para o dispositivo de saída escolhido — só se mudou. */
function aplicarSaidaEscolhida(el: HTMLAudioElement): void {
  const escolhida = useVoiceDevicesStore.getState().outputId;
  if (saidaAplicada.has(el) && saidaAplicada.get(el) === escolhida) return;
  saidaAplicada.set(el, escolhida);
  void aplicarSaida(el, escolhida);
}

/**
 * Esquece as janelas de repetição. Existe para o teste e para o logout: a
 * sessão seguinte não herda o relógio da anterior.
 */
export function esquecerToquesRecentes(): void {
  ultimoToque.clear();
}

/**
 * Toca um arquivo curto do começo, no volume dado (0 a 1), **no máximo uma vez
 * por `JANELA_SEM_REPETIR_MS`**.
 *
 * A guarda é por arquivo, e não por nome de som, porque o recurso disputado é o
 * arquivo: `mudo` e `surdo` são o mesmo `mudo.mp3` no mesmo elemento, e
 * reiniciá-lo no meio da reprodução (o `currentTime = 0` abaixo) é o que soava
 * como "o som variando de volume".
 *
 * Falha em silêncio de propósito: som de interface é enfeite — se o navegador
 * bloquear (autoplay antes do primeiro gesto), o estado visual já contou a
 * história.
 */
function tocarArquivo(url: string, volume: number): void {
  if (typeof Audio === "undefined") return;
  const agora = Date.now();
  const anterior = ultimoToque.get(url);
  if (anterior !== undefined && agora - anterior < JANELA_SEM_REPETIR_MS) return;
  ultimoToque.set(url, agora);
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

/**
 * Toca um som pelo nome. É a única porta: arquivo, volume e guarda de
 * repetição saem todos daqui.
 *
 * O filtro vive aqui, e não em cada chamador, para que desligar um item na aba
 * "Notificações" valha em todo lugar que toca aquele som — e o interruptor
 * mestre (`notificationSound`) vale junto, que é o que a aba promete ao
 * desabilitar a lista inteira quando ele está desligado. `forcar` é para a
 * prévia da própria aba, que precisa tocar mesmo o que está desligado.
 */
export function tocarSom(nome: NomeDeSom, opcoes: { forcar?: boolean } = {}): void {
  if (!opcoes.forcar && (!useSettings.getState().notificationSound || !somLigado(nome))) return;
  tocarArquivo(ARQUIVOS[nome], volumeDoSom(nome));
}

/**
 * "Você foi movido de canal".
 *
 * Fica pronto e **sem chamador**: mover alguém de canal não existe na API nem
 * no gateway ainda. Quando existir, o handler do evento chama isto — o som já
 * está no lugar, na lista da aba "Notificações" e com interruptor próprio.
 */
export function tocarSomDeMovido(): void {
  tocarSom("movido");
}
