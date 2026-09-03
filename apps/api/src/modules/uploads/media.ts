/**
 * Detecção de tipo por magic-bytes e leitura de dimensões, sem dependências.
 *
 * Só reconhecemos os formatos de imagem que renderizamos inline (PNG, JPEG,
 * GIF, WebP). Qualquer outro arquivo é tratado como binário genérico
 * (`application/octet-stream`) — nunca devolvemos um content-type "confiável"
 * a partir do que o cliente declarou, o que evita servir HTML/SVG como
 * executável (XSS).
 */

export interface ImageInfo {
  mime: string;
  width: number | null;
  height: number | null;
}

/** Retorna info da imagem se o buffer for um formato reconhecido, senão null. */
export function sniffImage(buf: Buffer): ImageInfo | null {
  if (isPng(buf)) return { mime: "image/png", ...pngSize(buf) };
  if (isJpeg(buf)) return { mime: "image/jpeg", ...jpegSize(buf) };
  if (isGif(buf)) return { mime: "image/gif", ...gifSize(buf) };
  if (isWebp(buf)) return { mime: "image/webp", ...webpSize(buf) };
  return null;
}

function isPng(b: Buffer): boolean {
  return (
    b.length > 24 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  );
}

function pngSize(b: Buffer): { width: number | null; height: number | null } {
  // IHDR começa no offset 16: width (4) + height (4), big-endian
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function isJpeg(b: Buffer): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function jpegSize(b: Buffer): { width: number | null; height: number | null } {
  // varre os marcadores até um SOF (Start Of Frame) que carrega as dimensões
  let off = 2;
  while (off + 9 < b.length) {
    if (b[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = b[off + 1];
    const size = b.readUInt16BE(off + 2);
    // SOF0..SOF15 (exceto DHT/JPG/DAC): 0xC0-0xCF menos C4/C8/CC
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      const height = b.readUInt16BE(off + 5);
      const width = b.readUInt16BE(off + 7);
      return { width, height };
    }
    off += 2 + size;
  }
  return { width: null, height: null };
}

function isGif(b: Buffer): boolean {
  return assinaturaGif(b) !== null;
}

/**
 * Assinatura do GIF, ou null. São as **duas** versões que existem (`GIF87a` e
 * `GIF89a`, esta a que carrega animação): conferir só as três primeiras letras
 * aceitaria qualquer arquivo que comece com "GIF", e o content-type declarado
 * pelo cliente nunca é usado como prova aqui.
 */
export function assinaturaGif(b: Buffer): "GIF87a" | "GIF89a" | null {
  if (b.length <= 10) return null;
  const marca = b.toString("ascii", 0, 6);
  return marca === "GIF87a" || marca === "GIF89a" ? marca : null;
}

/**
 * GIF animado pela extensão de aplicação `NETSCAPE2.0`, que carrega o número de
 * repetições do laço. É o marcador que todo codificador de GIF animado escreve;
 * contar os descritores de imagem exigiria percorrer os blocos comprimidos.
 * Um GIF de quadro único com o bloco de laço seria marcado como animado — o
 * efeito é só um selo na interface, então o falso positivo é barato.
 */
export function gifAnimado(b: Buffer): boolean {
  return b.includes("NETSCAPE2.0", 0, "ascii");
}

/** WebP animado: contêiner VP8X com o bit ANIM (0x02) ligado nas flags. */
export function webpAnimado(b: Buffer): boolean {
  if (b.length < 21) return false;
  if (b.toString("ascii", 12, 16) !== "VP8X") return false;
  return (b[20] & 0x02) !== 0;
}

function gifSize(b: Buffer): { width: number | null; height: number | null } {
  // dimensões em little-endian nos offsets 6 e 8
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

function isWebp(b: Buffer): boolean {
  return (
    b.length > 30 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  );
}

function webpSize(b: Buffer): { width: number | null; height: number | null } {
  const format = b.toString("ascii", 12, 16);
  try {
    if (format === "VP8 ") {
      // lossy: dimensões (14 bits) logo após o start code
      return {
        width: b.readUInt16LE(26) & 0x3fff,
        height: b.readUInt16LE(28) & 0x3fff,
      };
    }
    if (format === "VP8L") {
      // lossless: 14 bits cada, empacotados a partir do offset 21
      const bits = b.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (format === "VP8X") {
      // extended: canvas em 24 bits (offsets 24 e 27), valor - 1
      const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return { width, height };
    }
  } catch {
    /* buffer curto/corrompido - sem dimensões */
  }
  return { width: null, height: null };
}

/** Reduz o nome ao básico seguro, preservando a extensão. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "arquivo";
  // mantém só letras/números/._- ; o resto vira "_"
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return (clean || "arquivo").slice(0, 200);
}
