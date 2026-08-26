import { createHash, randomInt } from "node:crypto";
import { RECOVERY_CODE_COUNT, RECOVERY_CODE_LENGTH, normalizarCodigoMfa } from "@streamz/shared";

/**
 * Códigos de recuperação do 2FA — a saída de emergência de quem perdeu o
 * celular.
 *
 * Decisões que valem registro:
 *
 * - **Alfabeto sem ambiguidade**: sem `0/O`, `1/I/L`, `S/5` — o código é lido de
 *   um papel e digitado à mão; um caractere confundível vira suporte.
 * - **Hash, não texto**: o banco guarda SHA-256. São 10 valores de alta entropia
 *   (não senhas humanas), então um hash rápido basta e é o que permite buscar o
 *   código por igualdade de hash em vez de comparar um a um com argon2.
 * - **Uso único**: consumir marca `usedAt`; nunca apagamos a linha, para a tela
 *   poder dizer quantos restam.
 */

/** Sem 0/O, 1/I/L e S/5: o código é digitado a partir de um papel. */
const ALFABETO = "ABCDEFGHJKMNPQRTUVWXYZ2346789";

/** Gera um código legível, já no formato `XXXXX-XXXXX`. */
export function gerarCodigoDeRecuperacao(tamanho = RECOVERY_CODE_LENGTH): string {
  let bruto = "";
  for (let i = 0; i < tamanho; i += 1) bruto += ALFABETO[randomInt(ALFABETO.length)];
  return formatarCodigoDeRecuperacao(bruto);
}

/** Gera o conjunto inteiro entregue ao ativar o 2FA. */
export function gerarCodigosDeRecuperacao(quantidade = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: quantidade }, () => gerarCodigoDeRecuperacao());
}

/** `ABCDEFGHJK` → `ABCDE-FGHJK`: o hífen no meio ajuda a conferir na leitura. */
export function formatarCodigoDeRecuperacao(bruto: string): string {
  const limpo = normalizarCodigoMfa(bruto);
  const meio = Math.ceil(limpo.length / 2);
  return `${limpo.slice(0, meio)}-${limpo.slice(meio)}`;
}

/**
 * Hash guardado no banco. Normaliza antes (sem hífen, maiúsculas) para que o
 * usuário possa digitar `abcde fghjk` e ainda assim casar.
 */
export function hashDeCodigo(codigo: string): string {
  return createHash("sha256").update(normalizarCodigoMfa(codigo)).digest("hex");
}

/** true se o texto tem cara de código de recuperação (e não de código TOTP). */
export function pareceCodigoDeRecuperacao(codigo: string): boolean {
  const limpo = normalizarCodigoMfa(codigo);
  return limpo.length === RECOVERY_CODE_LENGTH && /^[A-Z0-9]+$/.test(limpo) && /[A-Z]/.test(limpo);
}
