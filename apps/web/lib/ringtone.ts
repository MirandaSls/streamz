/**
 * Sons da voz: o toque de chamada, o retorno de chamada (ringback) e os avisos
 * curtos de mudo/surdo/entrar/sair.
 *
 * Nenhum áudio é versionado: um WAV pronto no repositório seria um binário de
 * dezenas de KB que ninguém consegue revisar num diff, e todos esses sons são
 * matemática simples. O toque e o ringback são o par de senóides de 440 Hz e
 * 480 Hz que todo telefone usa; os avisos são dois tons curtos, gerados na hora
 * pelo Web Audio (não vale a pena embutir 8 WAVs de 200 ms).
 *
 * PCM 16 bits mono a 8 kHz: qualidade de telefone, que é exatamente o que se
 * quer aqui, e ~64 KB de WAV → ~85 KB de base64 gerados uma vez por sessão.
 */

import { somLigado } from "@/stores/sons";

const TAXA = 8000;
const TOM_A = 440;
const TOM_B = 480;
/** Rampa de subida/descida para o tom não começar com um "click". */
const RAMPA_S = 0.01;

const cache = new Map<string, string>();

/** Data URI do toque de chamada recebida, para o `src` de um `<audio loop>`. */
export function ringtoneDataUrl(): string {
  // 2 s tocando, 2 s de silêncio: a cadência de telefone que todo mundo conhece
  return laco("toque", 2, 2, 0.3);
}

/**
 * Data URI do **ringback**: o que quem liga escuta enquanto o outro lado toca.
 * É o mesmo par de tons, mais baixo e com silêncio mais longo — o padrão que
 * distingue "estou chamando" de "estão me chamando" ao ouvido.
 */
export function ringbackDataUrl(): string {
  return laco("ringback", 1, 3, 0.18);
}

function laco(chave: string, segTocando: number, segSilencio: number, volume: number): string {
  const pronto = cache.get(chave);
  if (pronto) return pronto;
  const url = wavBase64(amostras(segTocando, segSilencio, volume));
  cache.set(chave, url);
  return url;
}

function amostras(segTocando: number, segSilencio: number, volume: number): Int16Array {
  const total = Math.round(TAXA * (segTocando + segSilencio));
  const tocando = Math.round(TAXA * segTocando);
  const rampa = Math.max(1, Math.floor(TAXA * RAMPA_S));
  const out = new Int16Array(total);
  for (let i = 0; i < tocando; i++) {
    const t = i / TAXA;
    const onda = Math.sin(2 * Math.PI * TOM_A * t) + Math.sin(2 * Math.PI * TOM_B * t);
    const envelope = Math.min(1, i / rampa, (tocando - i) / rampa);
    // /2 volta a soma das duas senóides para [-1, 1]
    out[i] = Math.round((onda / 2) * envelope * volume * 32767);
  }
  return out;
}

/** Cabeçalho RIFF de 44 bytes + as amostras, em base64. */
function wavBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i++) view.setUint8(offset + i, texto.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TAXA, true);
  view.setUint32(28, TAXA * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // alinhamento do bloco
  view.setUint16(34, 16, true); // bits por amostra
  ascii(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i], true);
  return `data:audio/wav;base64,${base64(bytes)}`;
}

/** `btoa` não aceita bytes acima de 0xFF direto: converte em blocos. */
function base64(bytes: Uint8Array): string {
  let bin = "";
  const BLOCO = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOCO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  }
  return typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
}

// ── avisos curtos ──────────────────────────────────────────────────────────

/**
 * Cada aviso é um par de tons: a **direção** do intervalo é o significado.
 * Subindo = algo abriu (microfone voltou, alguém entrou); descendo = algo
 * fechou. É por isso que mudo e desmudo não podem ser o mesmo bipe.
 *
 * Entrar e sair da chamada usam a quinta justa (dó→sol), nota mais longa e onda
 * triangular: é o formato que soa "sino" em vez de "bipe de erro", e é o que
 * distingue o evento social (entrei numa sala) do aviso de controle (mutei).
 * São sons **próprios** com esse desenho — os arquivos do Discord são material
 * proprietário e não entram no repositório.
 */
interface Aviso {
  tons: readonly [number, number];
  /** duração de cada nota. */
  dur: number;
  onda: OscillatorType;
  /**
   * Quanto da oitava acima entra junto da fundamental, de 0 a 1.
   *
   * É o que separa um **sino** de um **bipe**: um oscilador sozinho soa a
   * aparelho eletrônico, e duas senóides em oitava já soam a instrumento. Os
   * avisos de controle levam pouco (querem passar despercebidos); os eventos
   * sociais levam mais, porque precisam ser notados no meio de uma conversa.
   */
  brilho: number;
  /**
   * Peso do som na mistura, de 0 a 1.
   *
   * Aviso que eu mesmo provoquei (mutei, desmutei) não precisa do mesmo volume
   * de um que outra pessoa provocou (alguém entrou): no primeiro eu já sei o
   * que aconteceu, porque acabei de clicar. Sem essa diferença, um canal cheio
   * vira uma sequência de bipes todos igualmente urgentes.
   */
  peso: number;
}

const AVISOS = {
  mudo: { tons: [520, 380], dur: 0.06, onda: "sine", brilho: 0.12, peso: 0.55 },
  desmudo: { tons: [380, 520], dur: 0.06, onda: "sine", brilho: 0.12, peso: 0.55 },
  surdo: { tons: [460, 300], dur: 0.06, onda: "sine", brilho: 0.1, peso: 0.55 },
  "nao-surdo": { tons: [300, 460], dur: 0.06, onda: "sine", brilho: 0.1, peso: 0.55 },
  entrar: { tons: [523.25, 783.99], dur: 0.14, onda: "triangle", brilho: 0.35, peso: 1 },
  sair: { tons: [783.99, 523.25], dur: 0.14, onda: "triangle", brilho: 0.3, peso: 1 },
  "alguem-entrou": { tons: [659.25, 987.77], dur: 0.11, onda: "triangle", brilho: 0.3, peso: 0.8 },
  "alguem-saiu": { tons: [987.77, 659.25], dur: 0.11, onda: "triangle", brilho: 0.25, peso: 0.8 },
} as const satisfies Record<string, Aviso>;

export type SomDeVoz = keyof typeof AVISOS;

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
 * Toca um aviso curto. Falha em silêncio de propósito: som de interface é
 * enfeite — se o navegador bloquear, o estado visual já contou a história.
 *
 * O filtro por som vive aqui, e não em cada chamador, para que desligar um item
 * na aba "Notificações" valha em todo lugar que toca aquele som. `forcar` é
 * para a prévia da própria aba, que precisa tocar mesmo o que está desligado.
 */
export function tocarSom(nome: SomDeVoz, volume = 0.12, forcar = false) {
  if (!forcar && !somLigado(nome)) return;
  try {
    const ac = contexto();
    if (!ac) return;
    const { tons, dur: DUR, onda, brilho, peso } = AVISOS[nome];
    const inicio = ac.currentTime;
    const alvo = volume * peso;
    for (const [i, freq] of tons.entries()) {
      // as duas notas se sobrepõem um pouco: emendadas soam como um som só,
      // que é o que separa um sino de dois bipes seguidos
      const t0 = inicio + i * DUR * 0.75;
      nota(ac, freq, onda, t0, DUR, alvo);
      // a oitava acima entra mais curta que a fundamental: o brilho é o ataque
      // do som, não o corpo dele — sustentá-la até o fim soaria a dois bipes
      // tocados juntos, que é exatamente o que se quer evitar
      if (brilho > 0) nota(ac, freq * 2, "sine", t0, DUR * 0.55, alvo * brilho);
    }
  } catch {
    // contexto de áudio indisponível: o aviso simplesmente não sai
  }
}

/**
 * Uma nota: oscilador com envelope de ataque rápido e queda exponencial.
 *
 * O ataque em rampa (e não em degrau) existe porque um `gain` que salta de 0
 * para o valor estala no alto-falante; a queda é exponencial porque a linear
 * soa cortada, e esta some como um sino. São 12 ms de subida — rápido o
 * bastante para o som parecer instantâneo, lento o bastante para não clicar.
 */
function nota(
  ac: AudioContext,
  freq: number,
  onda: OscillatorType,
  t0: number,
  dur: number,
  volume: number,
) {
  const osc = ac.createOscillator();
  const ganho = ac.createGain();
  osc.type = onda;
  osc.frequency.value = freq;
  ganho.gain.setValueAtTime(0, t0);
  ganho.gain.linearRampToValueAtTime(volume, t0 + 0.012);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  ganho.gain.linearRampToValueAtTime(0, t0 + dur + 0.005);
  osc.connect(ganho).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
}
