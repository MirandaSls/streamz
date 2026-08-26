import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TOTP_DIGITS, TOTP_STEP_SECONDS } from "@streamz/shared";

/**
 * TOTP (RFC 6238) sobre HOTP (RFC 4226) com HMAC-SHA1 — o que Google
 * Authenticator, Authy, 1Password e Bitwarden assumem por padrão.
 *
 * É implementado aqui, e não via biblioteca, porque o algoritmo cabe em ~40
 * linhas de `node:crypto` e assim vira **lógica pura testável**: a máquina do
 * MFA (gerar segredo → derivar código → validar com janela) tem teste unitário
 * sem depender do relógio real nem de rede.
 *
 * Nada aqui toca o banco. Quem persiste segredo e códigos é o AuthService.
 */

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Codifica bytes em base32 sem padding (é o que os apps autenticadores leem). */
export function paraBase32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

/** Decodifica base32 (ignora espaços, hífens e o padding `=`). */
export function deBase32(texto: string): Buffer {
  const limpo = texto.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const ch of limpo) {
    const indice = ALFABETO_BASE32.indexOf(ch);
    if (indice < 0) throw new Error(`Caractere inválido em base32: ${ch}`);
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segredo novo em base32. 20 bytes = 160 bits, o tamanho recomendado no RFC. */
export function gerarSegredoTotp(bytes = 20): string {
  return paraBase32(randomBytes(bytes));
}

/** Código HOTP de `contador` para o segredo (já em bytes). */
function hotp(segredo: Buffer, contador: number, digitos: number): string {
  const buffer = Buffer.alloc(8);
  // contador de 64 bits; o JS só garante 53, o que dá ~285 milhões de anos aqui
  buffer.writeUInt32BE(Math.floor(contador / 2 ** 32), 0);
  buffer.writeUInt32BE(contador >>> 0, 4);

  const digest = createHmac("sha1", segredo).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binario =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binario % 10 ** digitos).padStart(digitos, "0");
}

/** Código TOTP válido no instante `agoraMs` (padrão: agora). */
export function gerarCodigoTotp(
  segredoBase32: string,
  agoraMs: number = Date.now(),
  digitos: number = TOTP_DIGITS,
): string {
  const contador = Math.floor(agoraMs / 1000 / TOTP_STEP_SECONDS);
  return hotp(deBase32(segredoBase32), contador, digitos);
}

/**
 * Valida o código aceitando `janela` passos para trás e para frente (padrão 1 =
 * ±30 s). A janela existe porque o relógio do celular do usuário quase nunca
 * está perfeitamente sincronizado com o do servidor.
 *
 * A comparação é em tempo constante para não vazar quantos dígitos bateram.
 */
export function validarCodigoTotp(
  segredoBase32: string,
  codigo: string,
  agoraMs: number = Date.now(),
  janela = 1,
): boolean {
  const limpo = codigo.replace(/[\s-]/g, "");
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(limpo)) return false;
  const segredo = deBase32(segredoBase32);
  const contadorAtual = Math.floor(agoraMs / 1000 / TOTP_STEP_SECONDS);
  for (let delta = -janela; delta <= janela; delta += 1) {
    const esperado = hotp(segredo, contadorAtual + delta, TOTP_DIGITS);
    if (igualEmTempoConstante(esperado, limpo)) return true;
  }
  return false;
}

/** Compara sem vazar em quantos caracteres as strings divergiram. */
export function igualEmTempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * URL `otpauth://` que vira o QR. `emissor` aparece como o nome do serviço no
 * app; `conta` identifica qual conta é, quando a pessoa tem várias.
 */
export function otpauthUrl(emissor: string, conta: string, segredoBase32: string): string {
  const rotulo = `${encodeURIComponent(emissor)}:${encodeURIComponent(conta)}`;
  const params = new URLSearchParams({
    secret: segredoBase32,
    issuer: emissor,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${rotulo}?${params.toString()}`;
}

/** Agrupa o segredo em blocos de 4 para o usuário digitar sem se perder. */
export function segredoLegivel(segredoBase32: string): string {
  return segredoBase32.replace(/(.{4})/g, "$1 ").trim();
}
