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
export function cargoParaDiscord(_r: LinhaDeCargo): CargoDoDiscord {
  throw new Error("F1 lote C: cargoParaDiscord não implementado");
}

/** `"#5865f2"` → `5793266`; null → 0. Isolado para o teste. */
export function corParaInteiro(_cor: string | null): number {
  throw new Error("F1 lote C: corParaInteiro não implementado");
}
