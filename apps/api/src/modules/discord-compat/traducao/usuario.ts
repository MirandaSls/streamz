import type { LinhaDeUsuario, UsuarioDoDiscord } from "../tipos";

/**
 * `User` do Streamz → objeto `user` do Discord.
 *
 * ── Lote C (tradução) implementa. Puro: sem Prisma, sem Nest, testável. ──
 *
 * Regras que vêm do §5:
 * - `id` é **string decimal** do snowflake (`String(bigint)`), nunca number.
 * - `avatar` é sempre `null`: o nosso avatar é uma rota autenticável, não um
 *   hash imutável de CDN, e a F1 não implementa o CDN no formato do Discord.
 * - `discriminator` é `"0"` (o Discord migrou para nomes únicos; as libs ainda
 *   leem o campo e um `undefined` ali quebra `User#tag` em algumas).
 * - `global_name` recebe o nosso `displayName`.
 */
export function usuarioParaDiscord(_u: LinhaDeUsuario): UsuarioDoDiscord {
  throw new Error("F1 lote C: usuarioParaDiscord não implementado");
}
