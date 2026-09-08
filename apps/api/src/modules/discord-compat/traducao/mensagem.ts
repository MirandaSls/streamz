import type { LinhaDeMensagem, MensagemDoDiscord } from "../tipos";

/**
 * `Message` → objeto `message` do Discord.
 *
 * ── Lote C (tradução) implementa. Puro. ──
 *
 * O que o §5 manda:
 * - `type` é **0 para tudo**: `DEFAULT` e todas as `SYSTEM_*`. Mandar um número
 *   que a lib não conhece faz `MessageType[x]` virar `undefined` em algumas, e
 *   nenhuma delas sabe renderizar os nossos tipos de sistema. O texto do
 *   sistema já vai achatado em `content`.
 * - `timestamp`/`edited_timestamp` em ISO-8601.
 * - `embeds: []` e `components: []` — a F1 não tem embed rico.
 * - `mention_everyone` sai de `mentionsEveryone(content)` (`@streamz/shared`);
 *   `mentions`/`mention_roles` podem sair vazios na F1 (o bot lê o `content`).
 * - `message_reference` quando é resposta: `{message_id, channel_id, guild_id}`.
 *
 * `flags: 0` e `tts: false` fixos.
 */
export function mensagemParaDiscord(_m: LinhaDeMensagem): MensagemDoDiscord {
  throw new Error("F1 lote C: mensagemParaDiscord não implementado");
}
