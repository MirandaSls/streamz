import { MAX_MESSAGE_LENGTH, TIPOS_DE_OPCAO_ACEITOS, type OpcaoDeComando } from "@streamz/shared";
import { z } from "zod";
import { naoImplementado } from "../erros";
import {
  arquivosDoMultipart,
  gravarArquivosDoMultipart,
  renomearReferenciasDeAnexo,
  type ArquivoDoMultipart,
  type EnviadorDeArquivos,
} from "./corpos";

/**
 * Os corpos das rotas da F3 — registro de comandos, callback e followups.
 *
 * ── Lote B (REST compat) implementa. ──
 *
 * Vale aqui tudo que vale em `corpos.ts` (o §5 do documento): as rotas de compat
 * usam `@Body()` cru + zod porque o `ValidationPipe` global roda com
 * `whitelist: true` e **apagaria** `data.embeds`, `data.components` e
 * `data.flags` antes de o handler ver — o risco (b) do §12, que já mordeu na F1.
 *
 * A linha editorial dos schemas tem duas metades, e a diferença entre elas é o
 * que decide se um bot escrito para o Discord funciona aqui:
 *
 * 1. **Tolerantes com o que não usamos.** O `SlashCommandBuilder.toJSON()` do
 *    discord.js manda muito mais campo do que a F3 materializa —
 *    `name_localizations`, `description_localizations`, `dm_permission`, `nsfw`,
 *    `integration_types`, `contexts`, `default_member_permissions`. Tudo isso é
 *    **aceito e ignorado** (`passthrough`): recusar faria um `deploy-commands.js`
 *    padrão morrer por causa de um campo que a lib sempre manda.
 * 2. **Duros com o que não suportamos.** Subcomando (opção de tipo 1) e grupo de
 *    subcomando (tipo 2) são F5, e um comando com eles **é recusado** com 50035.
 *    É a regra escrita em `aplicativos.ts`: um comando que aparece no composer e
 *    não funciona é pior que um comando que o dono do bot descobre que não subiu.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9 (D6) e o `CONTRATO-F3.md`.
 */

// ── limites, todos os do Discord ─────────────────────────────

/** Nome de comando e de opção. */
export const MAX_NOME = 32;

/** Descrição de comando e de opção. */
export const MAX_DESCRICAO = 100;

/** Opções por comando. */
export const MAX_OPCOES = 25;

/** Escolhas fixas por opção. */
export const MAX_ESCOLHAS = 25;

/** Comandos por escopo (global, ou por servidor). */
export const MAX_COMANDOS = 100;

/**
 * `type` do comando: 1 CHAT_INPUT, 2 USER, 3 MESSAGE.
 *
 * A F3 só tem o 1 — os outros dois são os menus de contexto (clicar com o botão
 * direito numa mensagem ou numa pessoa), que não têm nem onde aparecer no
 * Streamz. Ver a recusa em `comandoParaRegistrarSchema`.
 */
export const TIPO_CHAT_INPUT = 1;

// ── o registro de comandos ───────────────────────────────────

/**
 * Nome de comando ou de opção.
 *
 * O Discord exige minúsculas e um conjunto restrito de caracteres; aqui a regra
 * é a mínima que o **nosso** composer precisa — sem espaço, porque `/play url`
 * é o comando `play` com a opção `url`, e um nome com espaço nunca casaria.
 * Validar mais que isso só criaria recusas que o Discord não faz.
 */
const nomeSchema = z
  .string()
  .min(1, "obrigatório")
  .max(MAX_NOME, `no máximo ${MAX_NOME} caracteres`)
  .regex(/^\S+$/u, "não pode conter espaços");

const descricaoSchema = z
  .string()
  .min(1, "obrigatório")
  .max(MAX_DESCRICAO, `no máximo ${MAX_DESCRICAO} caracteres`);

/** Uma escolha fixa de opção (`choices`). */
const escolhaSchema = z
  .object({
    name: z.string().min(1).max(MAX_DESCRICAO),
    value: z.union([z.string().max(6000), z.number()]),
  })
  .passthrough();

/**
 * Uma opção declarada pelo comando.
 *
 * O `type` é conferido contra `TIPOS_DE_OPCAO_ACEITOS` (`@streamz/shared`) e
 * **não** contra uma lista escrita aqui: a mesma constante é o que o lote C usa
 * para converter o valor digitado, e duas listas divergiriam no primeiro tipo
 * novo.
 */
const opcaoSchema = z
  .object({
    name: nomeSchema,
    description: descricaoSchema,
    type: z.number().int(),
    required: z.boolean().optional(),
    choices: z.array(escolhaSchema).max(MAX_ESCOLHAS).optional(),
    // ── onda 3 ── a opção pede sugestões ao bot (interação 4, callback 8)
    autocomplete: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((opcao, ctx) => {
    if ((TIPOS_DE_OPCAO_ACEITOS as readonly number[]).includes(opcao.type)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["type"],
      message:
        opcao.type === 1 || opcao.type === 2
          ? "subcomandos (tipo 1 e 2) ainda não são suportados"
          : `tipo de opção não suportado: ${opcao.type}`,
    });
  });

/** O comando já normalizado, pronto para virar linha de `ApplicationCommand`. */
export interface ComandoNormalizado {
  name: string;
  description: string;
  type: number;
  options: OpcaoDeComando[];
  /** bitfield do Discord, como texto; null = todo mundo pode usar. */
  defaultMemberPermissions: string | null;
}

/**
 * Um comando no corpo do `PUT`/`POST`.
 *
 * Tudo que não está declarado aqui passa e é descartado por
 * `normalizarComando` — é o `toJSON()` inteiro do `SlashCommandBuilder`
 * chegando sem que a gente tenha que acompanhar cada campo novo que o Discord
 * inventa.
 *
 * **Sem `.transform()`, e não por estilo:** o `zodBody` de `common/zod.pipe.ts`
 * recebe um `ZodSchema<T>`, que é `ZodType<T, ZodTypeDef, T>` — entrada e saída
 * do mesmo tipo. Um schema com `transform` tem `_input` diferente de `_output` e
 * não casa com essa assinatura. Como o pipe é do repo inteiro (e não da F3), a
 * normalização mora numa função pura ao lado, que ainda por cima é mais fácil de
 * testar sozinha.
 */
export const comandoParaRegistrarSchema = z
  .object({
    name: nomeSchema,
    description: descricaoSchema,
    type: z.number().int().optional(),
    options: z.array(opcaoSchema).max(MAX_OPCOES).optional(),
    // string ("0", "8", …) ou null. O Discord manda os dois; a F3 guarda o valor
    // e ainda não o aplica (quem pode usar o comando é decisão da F5).
    default_member_permissions: z.string().nullish(),
  })
  .passthrough()
  .superRefine((comando, ctx) => {
    const tipo = comando.type ?? TIPO_CHAT_INPUT;
    if (tipo === TIPO_CHAT_INPUT) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["type"],
      // 2 (USER) e 3 (MESSAGE) são os menus de contexto: eles não aparecem no
      // composer, e aceitá-los seria gravar uma linha que ninguém nunca vê
      message: `só comandos de barra (type 1) são suportados; recebido ${tipo}`,
    });
  });

/** O comando como chegou, já validado. */
export type ComandoParaRegistrar = z.infer<typeof comandoParaRegistrarSchema>;

/**
 * O que chegou → o que vai para o banco.
 *
 * A saída das opções é `OpcaoDeComando` (o contrato de `@streamz/shared`) — os
 * campos que a F3 usa, e só eles. É essa forma que vai para a coluna `options`
 * (Json) e que o `comandosDoServidor` do lote A devolve ao composer sem
 * reprocessar: o §10 do documento diz "como veio no PUT", e o que veio no PUT
 * tem `autocomplete`, `min_value`, `channel_types` e localizações que ninguém
 * lê. Guardar o normalizado é o mesmo contrato com menos superfície.
 */
export function normalizarComando(comando: ComandoParaRegistrar): ComandoNormalizado {
  return {
    name: comando.name,
    description: comando.description,
    type: TIPO_CHAT_INPUT,
    options: (comando.options ?? []).map((opcao) => ({
      name: opcao.name,
      description: opcao.description,
      // o `superRefine` do schema já garantiu que o número está na lista; o
      // `as` só repete para o compilador o que a validação decidiu em tempo de
      // execução
      type: opcao.type as OpcaoDeComando["type"],
      required: opcao.required ?? false,
      ...(opcao.choices ? { choices: opcao.choices } : {}),
      // ── onda 3 ── guardado para o composer saber que deve pedir sugestões
      // (`POST /api/channels/:id/interactions/autocomplete`); só quando `true`,
      // para o JSON das opções antigas não mudar
      ...(opcao.autocomplete === true ? { autocomplete: true } : {}),
    })),
    defaultMemberPermissions: comando.default_member_permissions ?? null,
  };
}

/**
 * O corpo do `PUT` — a lista inteira, que **sobrescreve em bloco**.
 *
 * Nome repetido é recusado aqui e não no banco: o `@@unique([applicationId,
 * guildId, name])` também recusaria, mas como erro do Prisma no meio de uma
 * transação — 500 no bot, em vez do 50035 que ele sabe ler.
 */
export const comandosParaRegistrarSchema = z
  .array(comandoParaRegistrarSchema)
  .max(MAX_COMANDOS, `no máximo ${MAX_COMANDOS} comandos`)
  .superRefine((comandos, ctx) => {
    const vistos = new Set<string>();
    for (const comando of comandos) {
      if (vistos.has(comando.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `comando repetido: ${comando.name}`,
        });
        return;
      }
      vistos.add(comando.name);
    }
  });

// ── callback e followups ─────────────────────────────────────

/**
 * O `data` de uma resposta de interação, e o corpo inteiro de um followup.
 *
 * `embeds`, `components` e `flags` chegam inteiros (é para isso que o `@Body()`
 * é cru) e, desde a onda 3, são **guardados**: o domínio das interações os valida
 * com `validarPayloadDeBot` (`@streamz/shared`) e responde `50035` com o
 * detalhe por campo quando não passam. `attachments` é o pareamento com os
 * `files[n]` do multipart (rodada de correção, `anexarArquivosAoCorpo`), e os
 * arquivos gravados seguem em `attachment_ids`. `flags: 64` é a **mensagem efêmera**, e desde
 * o PR das efêmeras é entregue de verdade: só o invocador a recebe, pelo
 * socket, e ela não entra no histórico do canal — §9 do documento.
 *
 * A forma casa com `CorpoDeResposta` de `modules/interactions/tipos.ts`, que é
 * o que `responder`, `editarOriginal` e `followup` recebem.
 */
export const dadosDeRespostaSchema = z
  .object({
    content: z.string().max(MAX_MESSAGE_LENGTH).optional(),
    flags: z.number().int().optional(),
    tts: z.boolean().optional(),
    embeds: z.array(z.record(z.unknown())).optional(),
    components: z.array(z.record(z.unknown())).optional(),
    attachments: z.array(z.record(z.unknown())).optional(),
    // ── rodada de correção ── cuids de `Attachment` do usuário-bot, soltos. Quem
    // preenche é `anexarArquivosAoCorpo` depois do upload multipart; o mesmo
    // campo que o `POST /channels/:id/messages` já aceitava.
    attachment_ids: z.array(z.string()).optional(),
    allowed_mentions: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type DadosDeResposta = z.infer<typeof dadosDeRespostaSchema>;

/**
 * ── rodada de correção ── Os `files[n]` de um multipart → gravados pelo
 * `UploadsService` e acrescentados ao corpo como `attachment_ids`.
 *
 * É o `reply({ files })`/`followUp({ files })` do discord.js. Os
 * `attachment://<nome>` de `embeds`/`components` são trocados pelo nome
 * **gravado** (o upload sanitiza o nome, e a resolução casa por ele — ver
 * `renomearReferenciasDeAnexo`).
 *
 * Sem arquivo devolve o **mesmo** objeto: o corpo JSON de sempre não muda em
 * nada. Com arquivo e sem `UploadsService` injetado, 501 dizendo o que falta.
 *
 * Quem vincula os `attachment_ids` à mensagem é o `InteractionsService` (ele
 * chama `MessagesService.criarComoBot`, que só aceita anexo solto do próprio
 * autor — o usuário-bot, que é quem grava aqui).
 */
export async function anexarArquivosAoCorpo(
  corpo: DadosDeResposta,
  arquivos: readonly ArquivoDoMultipart[] | undefined,
  enviador: EnviadorDeArquivos | undefined,
  botUserId: string,
): Promise<DadosDeResposta> {
  const pareados = arquivosDoMultipart(arquivos, corpo.attachments);
  if (pareados.length === 0) return corpo;
  if (!enviador) throw naoImplementado("multipart file upload");
  const ids = await gravarArquivosDoMultipart(enviador, botUserId, pareados);
  return {
    ...corpo,
    ...(corpo.embeds ? { embeds: renomearReferenciasDeAnexo(corpo.embeds, pareados) } : {}),
    ...(corpo.components
      ? { components: renomearReferenciasDeAnexo(corpo.components, pareados) }
      : {}),
    attachment_ids: [...(corpo.attachment_ids ?? []), ...ids],
  };
}

/**
 * `POST /interactions/:id/:token/callback`.
 *
 * `data` é **opcional**: um `deferReply()` manda `{ "type": 5 }` pelado, e
 * exigir o objeto ali quebraria justamente o caminho que o bot de música usa.
 * Qual `type` é implementado (4 e 5) e qual leva 501 (6, 7, 8, 9) é decisão do
 * `responder` — a casca não duplica a tabela.
 */
export const corpoDeCallbackSchema = z
  .object({
    type: z.number().int(),
    data: dadosDeRespostaSchema.optional(),
  })
  .passthrough();

export type CorpoDeCallback = z.infer<typeof corpoDeCallbackSchema>;
