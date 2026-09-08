import type { LinhaDeMembro, MembroDoDiscord } from "../tipos";
import { usuarioParaDiscord } from "./usuario";

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
export function membroParaDiscord(m: LinhaDeMembro, comUsuario = true): MembroDoDiscord {
  // Castigo vencido sai como ausente: o discord.js só compara a data com o
  // relógio dele em `isCommunicationDisabled()`, mas o discord.py trata
  // qualquer data preenchida como "está de castigo" na lista de membros.
  const castigo =
    m.timeoutUntil !== null && m.timeoutUntil.getTime() > Date.now()
      ? m.timeoutUntil.toISOString()
      : null;

  const membro: MembroDoDiscord = {
    nick: null,
    avatar: null,
    roles: m.cargoSnowflakes.map(String),
    joined_at: m.joinedAt.toISOString(),
    premium_since: null,
    // `deaf`/`mute` do Discord são o silenciamento **do servidor** dentro da
    // voz; o nosso silenciamento é do próprio usuário e vive no estado de voz
    // (F2). Aqui é sempre false.
    deaf: false,
    mute: false,
    flags: 0,
    // `pending` é a triagem de regras do Discord, que não temos.
    pending: false,
    communication_disabled_until: castigo,
  };

  return comUsuario ? { user: usuarioParaDiscord(m.user), ...membro } : membro;
}
