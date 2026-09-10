import { MAX_BULK_DELETE, MAX_ROLE_NAME } from "@streamz/shared";
import { z } from "zod";

/**
 * ── F5 membros ── Os corpos das rotas de membro, banimento, cargo, DM e
 * remoção em lote.
 *
 * Mesma decisão dos `corpos.ts` da F1, pelo mesmo motivo: o `ValidationPipe`
 * global roda com `whitelist: true` e apagaria todo campo que não estivesse
 * declarado numa classe de `class-validator` — e o discord.js manda muito mais
 * do que a gente lê. `@Body()` cru + zod, e `passthrough()` em tudo: campo que
 * ainda não implementamos é **ignorado**, nunca recusado. Recusar faria um bot
 * escrito para o Discord parar por causa de um campo que ele sempre manda.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §5.
 */

/**
 * `PATCH /guilds/:id/members/:uid`.
 *
 * `roles` **substitui** o conjunto (é o que o Discord faz, e o que o
 * `member.roles.set([...])` do discord.js manda); `communication_disabled_until`
 * é o castigo (ISO 8601, ou `null` para tirar); `nick` é o apelido por servidor
 * — ver a nota da rota, que o Streamz não tem.
 *
 * `null` e `undefined` querem dizer coisas diferentes aqui, e por isso os
 * campos são `.nullable().optional()` em vez de só opcionais: ausente é "não
 * mexe", `null` é "limpa".
 */
export const edicaoDeMembroSchema = z
  .object({
    roles: z.array(z.string()).optional(),
    nick: z.string().nullable().optional(),
    communication_disabled_until: z.string().nullable().optional(),
    mute: z.boolean().optional(),
    deaf: z.boolean().optional(),
    channel_id: z.string().nullable().optional(),
  })
  .passthrough();

export type EdicaoDeMembro = z.infer<typeof edicaoDeMembroSchema>;

/**
 * `PUT /guilds/:id/bans/:uid`.
 *
 * `delete_message_seconds` é o campo de hoje (0..604800); `delete_message_days`
 * é o antigo, que bots mais velhos ainda mandam — aceitamos os dois e
 * convertemos para as **horas** que o `ModerationService.ban` recebe.
 */
export const banimentoSchema = z
  .object({
    delete_message_seconds: z.number().int().min(0).max(604_800).optional(),
    delete_message_days: z.number().int().min(0).max(7).optional(),
    reason: z.string().max(512).optional(),
  })
  .passthrough();

export type CorpoDeBanimento = z.infer<typeof banimentoSchema>;

/**
 * `POST /channels/:id/messages/bulk-delete`.
 *
 * O intervalo 2..100 é do Discord e é recusado com 50035 pela própria lib antes
 * de sair — mas um bot em Python, ou um `fetch` cru, chega aqui com 1. O teto
 * casa com o `MAX_BULK_DELETE` do Streamz (também 100).
 */
export const remocaoEmLoteSchema = z
  .object({
    messages: z.array(z.string()).min(2).max(MAX_BULK_DELETE),
  })
  .passthrough();

export type CorpoDeRemocaoEmLote = z.infer<typeof remocaoEmLoteSchema>;

/** `POST /users/@me/channels` — abrir a DM com alguém. */
export const abrirDmSchema = z
  .object({
    recipient_id: z.string().min(1),
  })
  .passthrough();

export type CorpoDeAbrirDm = z.infer<typeof abrirDmSchema>;

/**
 * `POST /guilds/:id/roles` e `PATCH /guilds/:id/roles/:rid`.
 *
 * `permissions` é **string decimal** de um bitfield de 64 (§6) — o discord.js
 * serializa assim, e um `number` aqui perderia bits acima de 2^53. `color` é
 * inteiro `0xRRGGBB`, com 0 = "sem cor".
 */
export const corpoDeCargoSchema = z
  .object({
    name: z.string().max(MAX_ROLE_NAME).optional(),
    permissions: z.union([z.string(), z.number()]).nullable().optional(),
    color: z.number().int().min(0).max(0xffffff).nullable().optional(),
    hoist: z.boolean().nullable().optional(),
    mentionable: z.boolean().nullable().optional(),
    icon: z.unknown().optional(),
    unicode_emoji: z.unknown().optional(),
  })
  .passthrough();

export type CorpoDeCargo = z.infer<typeof corpoDeCargoSchema>;

/**
 * `color` do Discord (inteiro) → o nosso `"#rrggbb"`. 0 = sem cor (`null`).
 *
 * O par de `corParaInteiro` (`traducao/cargo.ts`), e o motivo de estar aqui e
 * não lá: `traducao/` é a saída, este arquivo é a entrada.
 */
export function corDoDiscord(valor: number | null | undefined): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null || valor === 0) return null;
  return `#${valor.toString(16).padStart(6, "0")}`;
}
