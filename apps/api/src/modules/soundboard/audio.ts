/**
 * Validação do arquivo de um som do painel de efeitos sonoros.
 *
 * Espelha `emojis/imagem.ts`, e com a mesma limitação consciente: **não há
 * biblioteca de mídia na API**. Dá para conferir o tipo pelos magic-bytes e o
 * tamanho em bytes; não dá para conferir a **duração** sem decodificar o áudio.
 * Por isso o teto de segundos (`MAX_SOUNDBOARD_DURACAO_MS`) é medido no cliente,
 * com um `<audio>`, e o que fica aqui é a barreira que ninguém contorna com o
 * cliente na mão: tipo e bytes.
 *
 * Só o que todo navegador toca sem plugin: MP3, Ogg e WAV.
 *
 * Funções puras de propósito: o service traduz o resultado em exceção HTTP.
 */

/** Formatos aceitos, na ordem em que o `<audio>` do cliente os prefere. */
export const TIPOS_DE_AUDIO = ["audio/mpeg", "audio/ogg", "audio/wav"] as const;

export type ResultadoAudio =
  | { ok: true; mime: string }
  | { ok: false; motivo: string; grande?: boolean };

/**
 * Valida o arquivo enviado. `grande: true` distingue "passou do tamanho" (413)
 * de "formato inválido" (400).
 */
export function validarAudio(buf: Buffer, maxBytes: number): ResultadoAudio {
  if (!buf?.length) return { ok: false, motivo: "Arquivo vazio" };
  if (buf.length > maxBytes) {
    return {
      ok: false,
      grande: true,
      motivo: `Arquivo acima de ${Math.round(maxBytes / 1024)} KB`,
    };
  }
  const mime = sniffAudio(buf);
  if (!mime) return { ok: false, motivo: "Use um arquivo MP3, OGG ou WAV" };
  return { ok: true, mime };
}

/** O tipo do áudio pelos primeiros bytes, ou null se não for um dos três. */
export function sniffAudio(buf: Buffer): string | null {
  if (ehMp3(buf)) return "audio/mpeg";
  if (ehOgg(buf)) return "audio/ogg";
  if (ehWav(buf)) return "audio/wav";
  return null;
}

/** Extensão do arquivo a partir do mime — vira o sufixo da chave no bucket. */
export function extensaoDeAudio(mime: string): string {
  return mime === "audio/mpeg" ? "mp3" : mime === "audio/ogg" ? "ogg" : "wav";
}

/**
 * MP3 de duas formas: com tag `ID3` na frente (o caso comum) ou começando
 * direto num quadro, cujo sincronismo é `0xFF` seguido de três bits ligados.
 * O segundo byte não pode ser `0xFF` cheio: essa combinação é a versão e a
 * camada "reservadas", que nenhum codificador emite — sem essa recusa, um
 * arquivo de `FF FF FF…` passaria por MP3.
 */
function ehMp3(b: Buffer): boolean {
  if (b.length < 4) return false;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true; // "ID3"
  return b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && b[1] !== 0xff;
}

/** Ogg: o contêiner começa sempre na página "OggS". */
function ehOgg(b: Buffer): boolean {
  return b.length > 4 && b.toString("ascii", 0, 4) === "OggS";
}

/** WAV é RIFF com o tipo "WAVE" nos bytes 8..12 (RIFF também é AVI e WebP). */
function ehWav(b: Buffer): boolean {
  return (
    b.length > 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WAVE"
  );
}
