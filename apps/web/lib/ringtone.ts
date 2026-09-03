/**
 * Sons da voz e da chamada: o toque, o ringback e os avisos curtos de
 * mudo/surdo/entrar/sair.
 *
 * São os **arquivos originais do Discord**, em `public/sons/` (pedido de
 * 2026-09-03, a partir de `docs/Reference/audio/`). Antes eram tons
 * sintetizados no Web Audio; o usuário quer o som que o ouvido já conhece.
 *
 * - `chamada.mp3` — toque de chamada recebida; serve também de ringback (o
 *   que quem liga escuta enquanto o outro lado toca).
 * - `mudo.mp3` / `desmudo.mp3` — microfone; surdo e não-surdo reaproveitam
 *   os dois, porque o Discord não trouxe arquivo próprio.
 * - `sair.mp3` — desconectar e "alguém saiu". O arquivo veio nomeado como
 *   "connect and disconnect", mas tem **um som só**, descendente
 *   (440 → 330 Hz, medido por FFT): é o de sair.
 * - entrar / alguém entrou — continuam **sintetizados** (quinta ascendente,
 *   onda triangular) até chegar o arquivo de entrada do Discord.
 *
 * Os arquivos são servidos junto com o app (`/sons/...`): no desktop vão
 * dentro do `.exe` (frontendDist) e a CSP já libera `media-src 'self'`.
 */

import { somLigado } from "@/stores/sons";
import { useSettings } from "@/stores/settings";

/** Toque de chamada recebida, para o `src` de um `<audio loop>`. */
export function toqueDeChamadaUrl(): string {
  return "/sons/chamada.mp3";
}

/** Ringback — o mesmo toque, do lado de quem liga. */
export function ringbackUrl(): string {
  return toqueDeChamadaUrl();
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
function volumeDeSaida(): number {
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
  | "alguem-saiu";

/** Qual arquivo toca cada aviso; ausente = ainda sintetizado. */
const ARQUIVOS: Partial<Record<SomDeVoz, string>> = {
  mudo: "/sons/mudo.mp3",
  desmudo: "/sons/desmudo.mp3",
  surdo: "/sons/mudo.mp3",
  "nao-surdo": "/sons/desmudo.mp3",
  sair: "/sons/sair.mp3",
  "alguem-saiu": "/sons/sair.mp3",
};

/**
 * Os avisos sem arquivo: um par de tons ascendentes (dó→sol, onda triangular),
 * que soa "sino" em vez de "bipe de erro". `brilho` é quanto da oitava acima
 * entra junto; `peso` é o volume relativo na mistura.
 */
interface Aviso {
  tons: readonly [number, number];
  dur: number;
  onda: OscillatorType;
  brilho: number;
  peso: number;
}

const SINTETIZADOS: Partial<Record<SomDeVoz, Aviso>> = {
  entrar: { tons: [523.25, 783.99], dur: 0.14, onda: "triangle", brilho: 0.35, peso: 1 },
  "alguem-entrou": { tons: [659.25, 987.77], dur: 0.11, onda: "triangle", brilho: 0.3, peso: 0.8 },
};

/** Os tons sintetizados foram calibrados para este teto; o arquivo não precisa. */
const TETO_SINTETIZADO = 0.12;

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  // o navegador suspende o contexto criado antes de qualquer gesto do usuário
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Toca um aviso curto no volume de saída das configurações (ou no `volume`
 * dado, de 0 a 1).
 *
 * O filtro por som vive aqui, e não em cada chamador, para que desligar um item
 * na aba "Notificações" valha em todo lugar que toca aquele som. `forcar` é
 * para a prévia da própria aba, que precisa tocar mesmo o que está desligado.
 */
export function tocarSom(nome: SomDeVoz, volume = volumeDeSaida(), forcar = false) {
  if (!forcar && !somLigado(nome)) return;
  const arquivo = ARQUIVOS[nome];
  if (arquivo) {
    tocarArquivo(arquivo, volume);
    return;
  }
  const aviso = SINTETIZADOS[nome];
  if (!aviso) return;
  try {
    const ac = contexto();
    if (!ac) return;
    const { tons, dur: DUR, onda, brilho, peso } = aviso;
    const inicio = ac.currentTime;
    const alvo = volume * TETO_SINTETIZADO * peso;
    for (const [i, freq] of tons.entries()) {
      // as duas notas se sobrepõem um pouco: emendadas soam como um som só
      const t0 = inicio + i * DUR * 0.75;
      nota(ac, freq, onda, t0, DUR, alvo);
      // a oitava acima entra mais curta: o brilho é o ataque, não o corpo
      if (brilho > 0) nota(ac, freq * 2, "sine", t0, DUR * 0.55, alvo * brilho);
    }
  } catch {
    // contexto de áudio indisponível: o aviso simplesmente não sai
  }
}

/**
 * Uma nota: oscilador com envelope de ataque rápido (12 ms em rampa, para não
 * estalar) e queda exponencial (a linear soa cortada; esta some como um sino).
 */
function nota(
  ac: AudioContext,
  freq: number,
  onda: OscillatorType,
  t0: number,
  dur: number,
  alvo: number,
) {
  const osc = ac.createOscillator();
  const ganho = ac.createGain();
  osc.type = onda;
  osc.frequency.value = freq;
  ganho.gain.setValueAtTime(0.0001, t0);
  ganho.gain.linearRampToValueAtTime(alvo, t0 + 0.012);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(ganho).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
