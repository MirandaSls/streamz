import { paraBitfieldDoDiscord } from "@streamz/shared";

import type { CargoDoDiscord, LinhaDeCargo } from "../tipos";

/**
 * `Role` → objeto `role` do Discord.
 *
 * ── Lote C (tradução) implementa. Puro. ──
 *
 * Dois detalhes que não são óbvios:
 *
 * 1. **O `@everyone` do Discord tem `id == guild.id`.** O nosso é uma linha
 *    própria, com snowflake próprio. Traduzimos o `isDefault` para o snowflake
 *    da guild — se não fizermos isso, `guild.roles.everyone` do discord.js vem
 *    `undefined` e todo cálculo de permissão do bot desanda.
 * 2. **`permissions` é string decimal de um bitfield de 64 bits**, vindo de
 *    `paraBitfieldDoDiscord` (`@streamz/shared`), nunca do nosso número de 21
 *    bits cru.
 *
 * `color` do Discord é inteiro (`0xRRGGBB`); o nosso é `"#rrggbb"` ou null
 * (que vira 0, "sem cor").
 */
export function cargoParaDiscord(r: LinhaDeCargo): CargoDoDiscord {
  return {
    id: String(r.isDefault ? r.guildSnowflake : r.snowflake),
    name: r.name,
    color: corParaInteiro(r.color),
    hoist: r.hoist,
    position: r.position,
    permissions: String(paraBitfieldDoDiscord(r.permissions)),
    // `managed` é "cargo criado por uma integração, que ninguém edita à mão".
    // O cargo gerenciado do bot nasce com a instalação, que é F4.
    managed: false,
    mentionable: r.mentionable,
    flags: 0,
  };
}

/** `"#5865f2"` → `5793266`; null → 0. Isolado para o teste. */
export function corParaInteiro(cor: string | null): number {
  // Cor inválida vira 0 ("sem cor") em vez de `NaN`: um `NaN` aqui atravessa o
  // `JSON.stringify` como `null` e o discord.js faz `role.color.toString(16)`.
  if (!cor || !/^#?[0-9a-f]{6}$/i.test(cor)) return 0;
  return Number.parseInt(cor.startsWith("#") ? cor.slice(1) : cor, 16);
}
