import type { JsonDoDiscord, LinhaDeServidor } from "../tipos";

/**
 * `Guild` → objeto `guild` do Discord.
 *
 * ── Lote C (tradução) implementa. Puro. ──
 *
 * **Este é o payload mais perigoso da F1.** É dele que o cache do bot nasce, e
 * um campo obrigatório faltando não dá erro: o `ready` simplesmente nunca
 * dispara e o bot fica mudo (risco (a) do §12; o discord.py chega a levantar
 * `KeyError` em `Guild._from_data` para alguns campos).
 *
 * A lista do §7, inteira:
 * `id, name, icon: null, owner_id, roles[], channels[]` (com as **categorias
 * como tipo 4**), `members[]`, `voice_states[]` (vazio na F1 — a voz é F2),
 * `member_count`, `unavailable: false`, `emojis: []`, `features: []`,
 * `premium_tier: 0`, `nsfw_level: 0`, `system_channel_id`, `rules_channel_id`,
 * `afk_channel_id: null`, `afk_timeout: 300`, `verification_level: 0`,
 * `default_message_notifications: 0`, `explicit_content_filter: 0`,
 * `mfa_level: 0`, `stickers: []`, `guild_scheduled_events: []`, `threads: []`,
 * `stage_instances: []`.
 *
 * `completo: false` produz a forma reduzida do `GET /guilds/:id` (sem
 * `members`/`channels`/`voice_states`); `true`, a do `GUILD_CREATE`.
 */
export function servidorParaDiscord(_g: LinhaDeServidor, _completo = true): JsonDoDiscord {
  throw new Error("F1 lote C: servidorParaDiscord não implementado");
}
