import { createHash, randomBytes } from "node:crypto";
import { EMAIL_VERIFY_TTL_HOURS, PASSWORD_RESET_TTL_HOURS } from "@newdisc/shared";

/**
 * Tokens de uso único enviados por e-mail (verificar conta, redefinir senha).
 *
 * O banco guarda **só o SHA-256**, como nos refresh tokens: um dump do banco
 * não permite verificar o e-mail nem trocar a senha de ninguém. São 32 bytes
 * aleatórios — entropia alta, não senha humana —, então o hash rápido basta e é
 * o que permite achar a linha por igualdade em vez de comparar uma a uma.
 */

/** Token cru, para entrar no link. 32 bytes em base64url = 43 caracteres. */
export function gerarTokenDeEmail(): string {
  return randomBytes(32).toString("base64url");
}

/** O que vai para a coluna `tokenHash`. */
export function hashDeToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/** Validade de cada tipo de token, a partir de `agora`. */
export function expiraEm(tipo: "VERIFY" | "RESET", agora: Date): Date {
  const horas = tipo === "VERIFY" ? EMAIL_VERIFY_TTL_HOURS : PASSWORD_RESET_TTL_HOURS;
  return new Date(agora.getTime() + horas * 60 * 60 * 1000);
}

/**
 * O link que vai no e-mail. `WEB_PUBLIC_URL` é a base da web (não da API): o
 * usuário clica e cai numa tela, não num JSON.
 */
export function linkDeEmail(caminho: string, token: string): string {
  const base = (process.env.WEB_PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${caminho}?token=${encodeURIComponent(token)}`;
}
