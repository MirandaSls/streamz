import type { LinhaDeMembro, MembroDoDiscord } from "../tipos";

/**
 * `GuildMember` → objeto `member` do Discord.
 *
 * ── Lote C (tradução) implementa. Puro. ──
 *
 * - `roles` **não inclui o `@everyone`** (no Discord ele é implícito) — a
 *   `LinhaDeMembro` já chega sem ele.
 * - `nick` é sempre null: o Streamz não tem apelido por servidor.
 * - `communication_disabled_until` é o nosso `timeoutUntil`; data no passado é
 *   o mesmo que ausente (o histórico não é apagado, mas o castigo acabou).
 * - `comUsuario: false` produz o membro **sem** o campo `user` — é a forma que
 *   entra dentro de uma `message` (lá o autor já está em `author`).
 */
export function membroParaDiscord(_m: LinhaDeMembro, _comUsuario = true): MembroDoDiscord {
  throw new Error("F1 lote C: membroParaDiscord não implementado");
}
