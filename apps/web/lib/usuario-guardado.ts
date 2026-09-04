/**
 * O retrato da conta em uso, no `localStorage`.
 *
 * Mora fora de `stores/auth.ts` porque a troca de contas também escreve aqui, e
 * um módulo de `lib/` não pode importar uma store (é a mesma regra que mantém
 * `session.ts` livre de ciclos). São dez linhas e uma chave — o valor delas é
 * existir um único lugar que sabe o nome dela.
 */
import type { PublicUser } from "@streamz/shared";

export const CHAVE_USUARIO = "user";

export function lerUsuarioGuardado(): PublicUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(CHAVE_USUARIO);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

export function salvarUsuarioGuardado(user: PublicUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(user));
}

export function limparUsuarioGuardado(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHAVE_USUARIO);
}
