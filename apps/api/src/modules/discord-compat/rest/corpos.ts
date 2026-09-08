import { MAX_MESSAGE_LENGTH, ehSnowflake } from "@streamz/shared";
import { z } from "zod";

/**
 * Os corpos e as queries que as rotas de compat aceitam, em zod.
 *
 * **Por que zod e não um DTO de `class-validator`:** o `ValidationPipe` global
 * do `main.ts` roda com `whitelist: true` e apaga todo campo que não está
 * declarado numa classe. O `POST /channels/:id/messages` do discord.js manda
 * `embeds`, `components`, `flags`, `allowed_mentions`, `message_reference`,
 * `tts` e `nonce` — com whitelist, tudo isso sumiria antes do handler e ninguém
 * descobriria por quê (risco (b) do §12). Um `@Body()` sem classe não tem
 * metatype validável, então o pipe global o deixa passar inteiro, e a validação
 * de verdade acontece aqui. Há um teste de integração provando isso
 * (`rest/corpo-do-post.spec.ts`), porque este é o tipo de coisa que raciocínio
 * nenhum garante.
 *
 * Os schemas são **permissivos de propósito** (`passthrough`): campo que ainda
 * não implementamos (embed rico, componente) é ignorado, não recusado. Recusar
 * faria um bot escrito para o Discord parar de funcionar por causa de um campo
 * que ele sempre manda.
 */

/** `message_reference` do Discord — o que nos interessa é o `message_id`. */
const referenciaSchema = z
  .object({
    message_id: z.string().optional(),
    channel_id: z.string().optional(),
    guild_id: z.string().optional(),
    fail_if_not_exists: z.boolean().optional(),
  })
  .passthrough();

/** `allowed_mentions`: na F1 só o `replied_user` muda comportamento nosso. */
const mencoesPermitidasSchema = z
  .object({
    parse: z.array(z.string()).optional(),
    users: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    replied_user: z.boolean().optional(),
  })
  .passthrough();

export const corpoDeMensagemSchema = z
  .object({
    content: z.string().max(MAX_MESSAGE_LENGTH).optional(),
    tts: z.boolean().optional(),
    nonce: z.union([z.string(), z.number()]).optional(),
    embeds: z.array(z.unknown()).optional(),
    components: z.array(z.unknown()).optional(),
    flags: z.number().optional(),
    allowed_mentions: mencoesPermitidasSchema.optional(),
    message_reference: referenciaSchema.optional(),
    // ids de anexo **nossos** (cuid): o `attachments` do Discord é outra coisa
    // (o pareamento com o multipart), e a F1 não faz upload por esta rota
    attachment_ids: z.array(z.string()).optional(),
  })
  .passthrough();

export type CorpoDeMensagem = z.infer<typeof corpoDeMensagemSchema>;

/** O `PATCH` só mexe no texto na F1; o resto passa e é ignorado. */
export const edicaoDeMensagemSchema = z
  .object({
    content: z.string().max(MAX_MESSAGE_LENGTH).optional(),
    embeds: z.array(z.unknown()).optional(),
    components: z.array(z.unknown()).optional(),
    flags: z.number().optional(),
    allowed_mentions: mencoesPermitidasSchema.optional(),
  })
  .passthrough();

export type EdicaoDeMensagem = z.infer<typeof edicaoDeMensagemSchema>;

/** `limit` do histórico: 1..100, padrão 50 (o mesmo do Discord). */
export const LIMITE_PADRAO = 50;

/**
 * `?limit&before&after&around` do `GET /channels/:id/messages`.
 *
 * Query chega sempre como texto. Os cursores são **snowflakes**, e um valor que
 * não é snowflake é tratado como ausente em vez de virar 400: é o que o Discord
 * faz, e um `BigInt("lixo")` aqui derrubaria o handler com `SyntaxError`.
 */
export function lerQueryDoHistorico(query: Record<string, unknown>): {
  limit: number;
  before?: bigint;
  after?: bigint;
  around?: bigint;
} {
  const bruto = Number(primeiro(query.limit));
  const limit = Number.isFinite(bruto) && bruto > 0 ? Math.min(100, Math.trunc(bruto)) : LIMITE_PADRAO;
  return {
    limit,
    ...(cursor(query.before) !== undefined ? { before: cursor(query.before) } : {}),
    ...(cursor(query.after) !== undefined ? { after: cursor(query.after) } : {}),
    ...(cursor(query.around) !== undefined ? { around: cursor(query.around) } : {}),
  };
}

function cursor(valor: unknown): bigint | undefined {
  const texto = primeiro(valor);
  return texto && ehSnowflake(texto) ? BigInt(texto) : undefined;
}

/** `?limit=1&limit=2` chega como array; vale o primeiro. */
function primeiro(valor: unknown): string | undefined {
  if (typeof valor === "string") return valor;
  if (Array.isArray(valor) && typeof valor[0] === "string") return valor[0];
  return undefined;
}
