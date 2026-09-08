import type { JsonDoDiscord, LinhaDeServidor } from "../tipos";
import { canalParaDiscord, categoriaParaDiscord } from "./canal";
import { cargoParaDiscord } from "./cargo";
import { membroParaDiscord } from "./membro";

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
export const CAMPOS_DO_SERVIDOR: readonly string[] = [
  "id",
  "name",
  "icon",
  "owner_id",
  "roles",
  "channels",
  "members",
  "voice_states",
  "member_count",
  "unavailable",
  "emojis",
  "features",
  "premium_tier",
  "nsfw_level",
  "system_channel_id",
  "rules_channel_id",
  "afk_channel_id",
  "afk_timeout",
  "verification_level",
  "default_message_notifications",
  "explicit_content_filter",
  "mfa_level",
  "stickers",
  "guild_scheduled_events",
  "threads",
  "stage_instances",
];

/** Campos que só o `GUILD_CREATE` carrega — o `GET /guilds/:id` não os manda. */
export const CAMPOS_SO_DO_GUILD_CREATE: readonly string[] = [
  "channels",
  "members",
  "voice_states",
  "threads",
  "stage_instances",
];

export function servidorParaDiscord(g: LinhaDeServidor, completo = true): JsonDoDiscord {
  const servidor: JsonDoDiscord = {
    id: String(g.snowflake),
    name: g.name,
    // sem CDN no formato do Discord na F1 (§5): o ícone é rota autenticável.
    icon: null,
    owner_id: String(g.ownerSnowflake),
    roles: g.cargos.map(cargoParaDiscord),
    member_count: g.memberCount,
    // `unavailable: true` faz o discord.js guardar a guild como indisponível e
    // continuar esperando — é o que o READY manda, e o oposto do que aqui vale.
    unavailable: false,
    emojis: [],
    features: [],
    premium_tier: 0,
    nsfw_level: 0,
    system_channel_id: g.systemChannelSnowflake === null ? null : String(g.systemChannelSnowflake),
    rules_channel_id: g.rulesChannelSnowflake === null ? null : String(g.rulesChannelSnowflake),
    // Não temos canal de ausente, nível de verificação nem filtro de conteúdo:
    // os padrões do Discord ("nada configurado") são a tradução fiel.
    afk_channel_id: null,
    afk_timeout: 300,
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    mfa_level: 0,
    stickers: [],
    guild_scheduled_events: [],
  };

  if (!completo) return servidor;

  // As categorias vêm antes dos canais para o cache do bot já ter o pai quando
  // ler o `parent_id` do filho — o discord.js não exige, o discord.py agradece.
  servidor.channels = [
    ...g.categorias.map(categoriaParaDiscord),
    ...g.canais.map(canalParaDiscord),
  ];
  servidor.members = g.membros.map((m) => membroParaDiscord(m, true));
  // Voz é F2: lista vazia é "ninguém conectado", que é o que o bot de música
  // vai ver até a ponte existir.
  servidor.voice_states = [];
  servidor.threads = [];
  servidor.stage_instances = [];

  return servidor;
}
