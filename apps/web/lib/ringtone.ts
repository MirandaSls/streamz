/**
 * Toque de chamada, como data URI base64.
 *
 * O arquivo é **sintetizado** em vez de versionado: um WAV pronto no repositório
 * seria um binário de dezenas de KB que ninguém consegue revisar num diff, e o
 * toque é matemática simples — o par de senóides de 440 Hz e 480 Hz que todo
 * telefone usa, 2 s tocando e 2 s de silêncio, em laço.
 *
 * PCM 16 bits mono a 8 kHz: qualidade de telefone, que é exatamente o que se
 * quer aqui, e ~64 KB de WAV → ~85 KB de base64 gerados uma vez por sessão.
 */

const TAXA = 8000;
const TOM_A = 440;
const TOM_B = 480;
const SEG_TOCANDO = 2;
const SEG_SILENCIO = 2;
/** Rampa de subida/descida para o tom não começar com um "click". */
const RAMPA_S = 0.01;

let cache: string | null = null;

/** Data URI do toque, pronto para o `src` de um `<audio loop>`. */
export function ringtoneDataUrl(): string {
  if (cache) return cache;
  cache = wavBase64(amostras());
  return cache;
}

function amostras(): Int16Array {
  const total = TAXA * (SEG_TOCANDO + SEG_SILENCIO);
  const tocando = TAXA * SEG_TOCANDO;
  const rampa = Math.max(1, Math.floor(TAXA * RAMPA_S));
  const out = new Int16Array(total);
  for (let i = 0; i < tocando; i++) {
    const t = i / TAXA;
    const onda = Math.sin(2 * Math.PI * TOM_A * t) + Math.sin(2 * Math.PI * TOM_B * t);
    const envelope = Math.min(1, i / rampa, (tocando - i) / rampa);
    // /2 volta a soma das duas senóides para [-1, 1]; 0.3 é o volume do toque
    out[i] = Math.round((onda / 2) * envelope * 0.3 * 32767);
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
