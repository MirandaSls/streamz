import type { PipeTransform } from "@nestjs/common";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE,
  MAX_MESSAGE_LENGTH,
  ehSnowflake,
} from "@streamz/shared";
import { z } from "zod";
import { sanitizeFilename } from "../../uploads/media";
import { jsonInvalido } from "../erros";

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
 * não implementamos é ignorado, não recusado. Recusar faria um bot escrito para
 * o Discord parar de funcionar por causa de um campo que ele sempre manda.
 *
 * ── onda 3 ── `embeds`, `components` e `flags` continuam `unknown` **aqui** e
 * são validados com as regras do Discord logo depois, no controller, por
 * `lerPayloadDeBot` (`traducao/embed.ts`): é ele que devolve o `50035` com o
 * caminho do campo (`embeds[0].title`), coisa que o `zodBody` — que só conhece
 * a primeira falha e responde no formato do Nest — não sabe fazer.
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
    // ids de anexo **nossos** (cuid), já enviados por `POST /uploads`. O
    // `attachments` do Discord é outra coisa — o pareamento `id` ↔ `files[n]`
    // do multipart — e é lido por `arquivosDoMultipart`, logo abaixo
    attachment_ids: z.array(z.string()).optional(),
    attachments: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type CorpoDeMensagem = z.infer<typeof corpoDeMensagemSchema>;

/** O `PATCH`: `content`, `embeds`, `components` e `flags` (onda 3); o resto passa e é ignorado. */
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

// ── multipart/form-data (rodada de correção) ─────────────────

/**
 * O upload do Discord: `payload_json` + `files[n]`.
 *
 * Todo `channel.send({ files })` do discord.js, `reply({ files })` e
 * `webhook.send({ files })` sai assim — e o discord.py igual. O corpo JSON de
 * sempre vai **dentro** do campo de texto `payload_json`, os arquivos em
 * `files[0]`, `files[1]`…, e o `attachments` do payload pareia cada um pelo
 * `id` (o `n` do campo), com o `filename` que vale e a `description`:
 *
 * ```
 * payload_json = {"content":"placar","embeds":[{"image":{"url":"attachment://placar.png"}}],
 *                 "attachments":[{"id":0,"filename":"placar.png"}]}
 * files[0]     = <bytes>
 * ```
 *
 * Sem isto a única forma de um embed apontar para um arquivo era subir antes
 * por `POST /uploads` e mandar `attachment_ids` — que nenhuma lib conhece.
 *
 * Quem lê os arquivos é o `AnyFilesInterceptor` do `@nestjs/platform-express`
 * (o multer, como nas rotas de upload da API); o que chega ao controller mora
 * aqui, puro e testável.
 */

/** Os limites do multer nas rotas de compat: os do anexo comum do Streamz. */
export const LIMITES_DO_MULTIPART = {
  fileSize: MAX_ATTACHMENT_SIZE,
  files: MAX_ATTACHMENTS_PER_MESSAGE,
} as const;

/** O que o multer entrega por arquivo. */
export interface ArquivoDoMultipart {
  fieldname: string;
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * `@Body(new PayloadJsonPipe(), zodBody(schema))`: desembrulha o `payload_json`.
 *
 * Roda **antes** do zod. Num corpo JSON comum não há `payload_json` e o valor
 * passa intacto. Num multipart, o multer põe os campos de texto em `req.body`
 * (um objeto sem protótipo) e o JSON de verdade está em `payload_json`; ele vira
 * o corpo, e o resto do handler não percebe a diferença.
 *
 * JSON quebrado leva o `50109` do Discord em vez de um 500 do `JSON.parse`.
 */
export class PayloadJsonPipe implements PipeTransform<unknown, unknown> {
  transform(valor: unknown): unknown {
    if (typeof valor !== "object" || valor === null) return valor;
    const bruto = (valor as Record<string, unknown>).payload_json;
    if (typeof bruto !== "string") return valor;
    let lido: unknown;
    try {
      lido = JSON.parse(bruto);
    } catch {
      throw jsonInvalido();
    }
    if (typeof lido !== "object" || lido === null || Array.isArray(lido)) throw jsonInvalido();
    return lido;
  }
}

/** Um arquivo do multipart, com o nome com que ele fica gravado. */
export interface ArquivoPareado {
  arquivo: ArquivoDoMultipart;
  /** o nome que o bot usou (`attachments[].filename` ou o do próprio arquivo). */
  nomeDoBot: string;
  /** o nome depois do `sanitizeFilename` — é este que `attachment://` resolve. */
  nomeGravado: string;
}

/**
 * Os arquivos do multer, pareados com o `attachments` do payload.
 *
 * O `n` de `files[n]` casa com o `id` de `attachments` (número ou texto, as
 * libs mandam os dois); achando, o `filename` de lá vale — é como o Discord
 * renomeia um arquivo sem reenviar os bytes. Campo com outro nome (`file`,
 * versões antigas) usa a posição.
 */
export function arquivosDoMultipart(
  arquivos: readonly ArquivoDoMultipart[] | undefined,
  attachments: unknown,
): ArquivoPareado[] {
  if (!arquivos?.length) return [];
  const nomes = new Map<string, string>();
  if (Array.isArray(attachments)) {
    for (const item of attachments) {
      if (typeof item !== "object" || item === null) continue;
      const { id, filename } = item as { id?: unknown; filename?: unknown };
      if ((typeof id === "number" || typeof id === "string") && typeof filename === "string" && filename) {
        nomes.set(String(id), filename);
      }
    }
  }
  return arquivos.map((arquivo, posicao) => {
    const indice = /^files\[(\d+)\]$/.exec(arquivo.fieldname)?.[1] ?? String(posicao);
    const nomeDoBot = nomes.get(indice) ?? arquivo.originalname;
    return { arquivo, nomeDoBot, nomeGravado: sanitizeFilename(nomeDoBot) };
  });
}

/**
 * `attachment://<nome do bot>` → `attachment://<nome gravado>`, em qualquer
 * profundidade de `embeds`/`components`.
 *
 * Necessário porque o upload passa o nome por `sanitizeFilename` (espaço e
 * acento viram `_`), e a resolução (`resolverAnexosDoPayload`) casa pelo nome
 * **gravado**. Sem a troca, `attachment://meu placar.png` nunca acharia o
 * `meu_placar.png`. Só o texto exato `attachment://<nome>` muda; o resto do
 * payload volta idêntico (cópia, sem mutar o corpo).
 */
export function renomearReferenciasDeAnexo<T>(valor: T, pareados: readonly ArquivoPareado[]): T {
  const trocas = new Map<string, string>();
  for (const p of pareados) {
    if (p.nomeDoBot !== p.nomeGravado) {
      trocas.set(`attachment://${p.nomeDoBot}`, `attachment://${p.nomeGravado}`);
    }
  }
  if (trocas.size === 0) return valor;
  const trocar = (v: unknown): unknown => {
    if (typeof v === "string") return trocas.get(v) ?? v;
    if (Array.isArray(v)) return v.map(trocar);
    if (typeof v === "object" && v !== null) {
      return Object.fromEntries(Object.entries(v).map(([k, filho]) => [k, trocar(filho)]));
    }
    return v;
  };
  return trocar(valor) as T;
}

/** O pedaço do `UploadsService` que a casca usa (estrutural, para testar sem Nest). */
export interface EnviadorDeArquivos {
  upload(
    uploaderId: string,
    file: { originalname: string; buffer: Buffer; size: number },
  ): Promise<{ id: string }>;
}

/**
 * Grava cada arquivo pelo `UploadsService` — a mesma validação, o mesmo bucket
 * e a mesma linha de `Attachment` solta do `POST /uploads` — e devolve os cuids
 * na ordem dos `files[n]`.
 *
 * Em série e não em paralelo: a ordem dos anexos é a ordem em que o bot os
 * mandou, e dez uploads simultâneos do mesmo bot não ganham nada.
 *
 * `uploaderId` é o **usuário-bot**: o `MessagesService.create` só vincula anexo
 * solto do próprio autor, e é isso que impede o bot de pegar o arquivo de
 * outra pessoa.
 */
export async function gravarArquivosDoMultipart(
  enviador: EnviadorDeArquivos,
  uploaderId: string,
  pareados: readonly ArquivoPareado[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const { arquivo, nomeDoBot } of pareados) {
    const anexo = await enviador.upload(uploaderId, {
      originalname: nomeDoBot,
      buffer: arquivo.buffer,
      size: arquivo.size,
    });
    ids.push(anexo.id);
  }
  return ids;
}
