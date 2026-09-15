// Mensagens de bot: embeds, componentes (botões, selects, Components v2),
// modais, autocomplete e os eventos das interações de componente.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.
//
// ── Onda 3 (paridade) · cartão 3.0-contrato ──
//
// **A forma é a da API do Discord, letra por letra.** Os objetos de embed e de
// componente viajam em snake_case e com o `type` numérico do Discord porque é
// isso que o discord.js e o discord.py mandam e esperam ler de volta: um bot
// escrito para o Discord tem de funcionar aqui sem adaptação (ADR-0009 e
// `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`). As fontes conferidas, no commit de
// 2026-09-10 do repositório `discord/discord-api-docs`:
//
// - `developers/components/reference.mdx` (tipos, campos e limites dos componentes);
// - `developers/resources/message.mdx` (embed, limites de embed, flags de mensagem);
// - `developers/interactions/receiving-and-responding.mdx` (callbacks 4–9, modal,
//   autocomplete).
//
// Onde o Streamz tem de dizer algo que o Discord não diz (os eventos para o
// navegador, as rotas internas), os nomes são nossos e em português, como o
// resto do REST interno. O documento que explica tudo isto para os cartões
// 3a–3g é `docs/CONTRATO-ONDA-3.md`.

import { z } from "zod";
import type { PublicUser } from "./dominio";
import { idSchema, MAX_MESSAGE_LENGTH } from "./internos";

// ── flags de mensagem ────────────────────────────────────────

/** `message.flags` do Discord (`resources/message.mdx`, "Message Flags"). */
export const FLAGS_DE_MENSAGEM = {
  CROSSPOSTED: 1 << 0,
  IS_CROSSPOST: 1 << 1,
  /** Não mostra embed nenhum (nem o rico do bot, nem a prévia de link). */
  SUPPRESS_EMBEDS: 1 << 2,
  SOURCE_MESSAGE_DELETED: 1 << 3,
  URGENT: 1 << 4,
  HAS_THREAD: 1 << 5,
  /** Só quem invocou a interação vê. No Streamz é a tabela `EphemeralMessage`. */
  EPHEMERAL: 1 << 6,
  /** A resposta adiada (callback 5): "<bot> está pensando…". */
  LOADING: 1 << 7,
  FAILED_TO_MENTION_SOME_ROLES_IN_THREAD: 1 << 8,
  /** Não dispara notificação de desktop nem som. */
  SUPPRESS_NOTIFICATIONS: 1 << 12,
  IS_VOICE_MESSAGE: 1 << 13,
  HAS_SNAPSHOT: 1 << 14,
  /** Mensagem feita só de componentes: sem `content` e sem `embeds`. */
  IS_COMPONENTS_V2: 1 << 15,
} as const;

/**
 * As flags que um bot pode **pôr** numa mensagem. O Discord ignora as outras
 * (`receiving-and-responding.mdx`: "only SUPPRESS_EMBEDS, EPHEMERAL,
 * IS_COMPONENTS_V2, IS_VOICE_MESSAGE, and SUPPRESS_NOTIFICATIONS can be set");
 * aqui também são descartadas em silêncio, e não recusadas. `IS_VOICE_MESSAGE`
 * fica de fora porque o Streamz não tem mensagem de voz — aceitá-la seria
 * gravar uma promessa que a tela não cumpre.
 *
 * `EPHEMERAL` só vale em resposta de interação (callback e followup); numa
 * `POST /channels/:id/messages` ela também é descartada, como no Discord.
 */
export const FLAGS_QUE_O_BOT_ENVIA =
  FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS |
  FLAGS_DE_MENSAGEM.EPHEMERAL |
  FLAGS_DE_MENSAGEM.SUPPRESS_NOTIFICATIONS |
  FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2;

/**
 * As flags que vão para a coluna `flags` de `MessageBotPayload` e de
 * `EphemeralMessage`. As outras duas que importam moram em outro lugar, e é de
 * propósito: `SUPPRESS_EMBEDS` já era a coluna `Message.suppressEmbeds` (o
 * "remover prévia" do menu), e `EPHEMERAL` é a própria tabela da efêmera.
 */
export const FLAGS_GUARDADAS =
  FLAGS_DE_MENSAGEM.LOADING |
  FLAGS_DE_MENSAGEM.SUPPRESS_NOTIFICATIONS |
  FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2;

/** `true` quando `flags` tem o bit `flag` ligado. Aceita `undefined`. */
export function temFlag(flags: number | null | undefined, flag: number): boolean {
  return ((flags ?? 0) & flag) !== 0;
}

// ── números do Discord ───────────────────────────────────────

/** `type` dos componentes (`components/reference.mdx`, "Component Types"). */
export const TIPO_DE_COMPONENTE = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
  USER_SELECT: 5,
  ROLE_SELECT: 6,
  MENTIONABLE_SELECT: 7,
  CHANNEL_SELECT: 8,
  SECTION: 9,
  TEXT_DISPLAY: 10,
  THUMBNAIL: 11,
  MEDIA_GALLERY: 12,
  FILE: 13,
  SEPARATOR: 14,
  CONTAINER: 17,
  LABEL: 18,
  FILE_UPLOAD: 19,
  RADIO_GROUP: 21,
  CHECKBOX_GROUP: 22,
  CHECKBOX: 23,
} as const;

/** `style` do botão. */
export const ESTILO_DE_BOTAO = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
  LINK: 5,
  PREMIUM: 6,
} as const;

/** `style` do text input. */
export const ESTILO_DE_TEXT_INPUT = { SHORT: 1, PARAGRAPH: 2 } as const;

/** `spacing` do separator. */
export const ESPACAMENTO_DO_SEPARATOR = { SMALL: 1, LARGE: 2 } as const;

/** Os tipos de select que abrem uma lista preenchida pelo servidor (usuário, cargo…). */
export const TIPOS_DE_SELECT = [3, 5, 6, 7, 8] as const;

/** `type` da interação (o que o navegador dispara e o bot recebe). */
export const TIPO_DE_INTERACAO_DE_BOT = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

/**
 * O prazo da primeira resposta do bot. É o do Discord ("you must send an
 * initial response within 3 seconds"), e é o que decide o "Esta interação
 * falhou" no navegador (`interaction.failed`).
 */
export const PRAZO_DA_RESPOSTA_DO_BOT_MS = 3_000;

// ── limites ──────────────────────────────────────────────────

/** `resources/message.mdx`, "Embed Limits" (e "Supports up to 10 embeds"). */
export const LIMITES_DE_EMBED = {
  EMBEDS_POR_MENSAGEM: 10,
  TITULO: 256,
  DESCRICAO: 4096,
  CAMPOS: 25,
  NOME_DO_CAMPO: 256,
  VALOR_DO_CAMPO: 1024,
  RODAPE: 2048,
  AUTOR: 256,
  /** soma de título, descrição, campos, rodapé e autor de todos os embeds. */
  TOTAL: 6000,
} as const;

/** `components/reference.mdx` (e "Modal" em `receiving-and-responding.mdx`). */
export const LIMITES_DE_COMPONENTE = {
  CUSTOM_ID: 100,
  /** mensagem sem `IS_COMPONENTS_V2`: "up to 5 action rows as top-level components". */
  ACTION_ROWS_LEGADO: 5,
  BOTOES_POR_ROW: 5,
  ROTULO_DO_BOTAO: 80,
  URL_DO_BOTAO: 512,
  OPCOES_DO_SELECT: 25,
  PLACEHOLDER_DO_SELECT: 150,
  VALORES_DO_SELECT: 25,
  ROTULO_DA_OPCAO: 100,
  VALOR_DA_OPCAO: 100,
  DESCRICAO_DA_OPCAO: 100,
  /** mensagem com `IS_COMPONENTS_V2`: "up to 40 total components", contando os aninhados. */
  COMPONENTES_V2: 40,
  /**
   * Soma do `content` de todos os text displays de uma mensagem v2. Não está
   * na página de referência: é o teto que a API do Discord aplica (e o mesmo
   * que os builders do discord.js documentam). Cada text display sozinho
   * também não passa disto.
   */
  TEXTO_V2: 4000,
  TEXTOS_POR_SECTION: 3,
  ITENS_DA_GALERIA: 10,
  DESCRICAO_DE_MIDIA: 1024,
  TITULO_DO_MODAL: 45,
  COMPONENTES_DO_MODAL: 5,
  ROTULO_DO_LABEL: 45,
  DESCRICAO_DO_LABEL: 100,
  /** `label` do text input dentro de action row (forma antiga, ainda aceita). */
  ROTULO_DO_TEXT_INPUT: 45,
  VALOR_DO_TEXT_INPUT: 4000,
  PLACEHOLDER_DO_TEXT_INPUT: 100,
  OPCOES_DE_RADIO_MIN: 2,
  OPCOES_DE_RADIO_MAX: 10,
  OPCOES_DE_CHECKBOX: 10,
  ARQUIVOS_DO_UPLOAD: 10,
  TIPOS_DO_UPLOAD: 10,
  ESCOLHAS_DE_AUTOCOMPLETE: 25,
} as const;

// ── blocos ───────────────────────────────────────────────────

const customIdSchema = z.string().min(1).max(LIMITES_DE_COMPONENTE.CUSTOM_ID);

/** O `id` opcional de todo componente: inteiro de 32 bits. `0` = "gere um". */
const idDeComponenteSchema = z.number().int().min(0).max(2_147_483_647).optional();

/**
 * Emoji parcial (`name`, `id`, `animated`). O `id` é o **snowflake** do Discord
 * quando o bot manda um emoji personalizado; quem desenha resolve contra os
 * emojis do servidor e cai para o `name` quando não acha.
 */
export const emojiParcialSchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  animated: z.boolean().optional(),
});
export type EmojiParcial = z.infer<typeof emojiParcialSchema>;

/**
 * Unfurled Media Item. **Só o `url` é do bot**: os outros campos o servidor
 * preenche (o `normalizarPayloadDeBot` os apaga na entrada, e o DTO da mensagem
 * os preenche na saída quando o `url` é `attachment://<nome>` de um anexo da
 * própria mensagem).
 *
 * `url` aceita `http(s)://…` e `attachment://<nome-do-arquivo>`.
 */
export const itemDeMidiaSchema = z.object({
  url: z.string().min(1),
  proxy_url: z.string().optional(),
  width: z.number().int().nullish(),
  height: z.number().int().nullish(),
  content_type: z.string().optional(),
  /** cuid do `Attachment` (no DTO do Streamz); snowflake na saída da casca. */
  attachment_id: z.string().optional(),
});
export type ItemDeMidia = z.infer<typeof itemDeMidiaSchema>;

// ── embed ────────────────────────────────────────────────────

const imagemDeEmbedSchema = z.object({
  url: z.string().min(1),
  proxy_url: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export const embedSchema = z.object({
  title: z.string().max(LIMITES_DE_EMBED.TITULO).optional(),
  /** sempre `"rich"` no que o bot manda (o normalizador fixa). */
  type: z.string().optional(),
  description: z.string().max(LIMITES_DE_EMBED.DESCRICAO).optional(),
  url: z.string().optional(),
  /** ISO-8601; o normalizador reescreve com `toISOString()`. */
  timestamp: z
    .string()
    .refine((t) => !Number.isNaN(Date.parse(t)), { message: "timestamp inválido" })
    .optional(),
  /** inteiro RGB, `0x000000`–`0xFFFFFF`. É **dado** do bot: a tela o usa em `style`. */
  color: z.number().int().min(0).max(0xffffff).nullish(),
  footer: z
    .object({
      text: z.string().min(1).max(LIMITES_DE_EMBED.RODAPE),
      icon_url: z.string().optional(),
      proxy_icon_url: z.string().optional(),
    })
    .optional(),
  image: imagemDeEmbedSchema.optional(),
  thumbnail: imagemDeEmbedSchema.optional(),
  video: imagemDeEmbedSchema.optional(),
  provider: z.object({ name: z.string().optional(), url: z.string().optional() }).optional(),
  author: z
    .object({
      name: z.string().min(1).max(LIMITES_DE_EMBED.AUTOR),
      url: z.string().optional(),
      icon_url: z.string().optional(),
      proxy_icon_url: z.string().optional(),
    })
    .optional(),
  fields: z
    .array(
      z.object({
        name: z.string().min(1).max(LIMITES_DE_EMBED.NOME_DO_CAMPO),
        value: z.string().min(1).max(LIMITES_DE_EMBED.VALOR_DO_CAMPO),
        inline: z.boolean().optional(),
      }),
    )
    .max(LIMITES_DE_EMBED.CAMPOS)
    .optional(),
});
export type Embed = z.infer<typeof embedSchema>;
export type CampoDeEmbed = NonNullable<Embed["fields"]>[number];

// ── componentes interativos ──────────────────────────────────

export const botaoSchema = z.object({
  type: z.literal(2),
  id: idDeComponenteSchema,
  /** 1 primary · 2 secondary · 3 success · 4 danger · 5 link · 6 premium. */
  style: z.number().int().min(1).max(6),
  label: z.string().max(LIMITES_DE_COMPONENTE.ROTULO_DO_BOTAO).optional(),
  emoji: emojiParcialSchema.optional(),
  custom_id: customIdSchema.optional(),
  sku_id: z.string().optional(),
  url: z.string().max(LIMITES_DE_COMPONENTE.URL_DO_BOTAO).optional(),
  disabled: z.boolean().optional(),
});
export type Botao = z.infer<typeof botaoSchema>;

export const opcaoDeSelectSchema = z.object({
  label: z.string().min(1).max(LIMITES_DE_COMPONENTE.ROTULO_DA_OPCAO),
  value: z.string().min(1).max(LIMITES_DE_COMPONENTE.VALOR_DA_OPCAO),
  description: z.string().max(LIMITES_DE_COMPONENTE.DESCRICAO_DA_OPCAO).optional(),
  emoji: emojiParcialSchema.optional(),
  default: z.boolean().optional(),
});
export type OpcaoDeSelect = z.infer<typeof opcaoDeSelectSchema>;

/** `default_values` dos selects de usuário, cargo, mencionável e canal. */
export const valorPadraoDeSelectSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["user", "role", "channel"]),
});
export type ValorPadraoDeSelect = z.infer<typeof valorPadraoDeSelectSchema>;

const camposDeSelect = {
  id: idDeComponenteSchema,
  custom_id: customIdSchema,
  placeholder: z.string().max(LIMITES_DE_COMPONENTE.PLACEHOLDER_DO_SELECT).optional(),
  min_values: z.number().int().min(0).max(LIMITES_DE_COMPONENTE.VALORES_DO_SELECT).optional(),
  max_values: z.number().int().min(1).max(LIMITES_DE_COMPONENTE.VALORES_DO_SELECT).optional(),
  /** só em modal; numa mensagem é ignorado. */
  required: z.boolean().optional(),
  /** só em mensagem; num modal o Discord recusa. */
  disabled: z.boolean().optional(),
};

const valoresPadraoSchema = z
  .array(valorPadraoDeSelectSchema)
  .max(LIMITES_DE_COMPONENTE.VALORES_DO_SELECT)
  .optional();

export const selectDeTextoSchema = z.object({
  type: z.literal(3),
  ...camposDeSelect,
  options: z.array(opcaoDeSelectSchema).min(1).max(LIMITES_DE_COMPONENTE.OPCOES_DO_SELECT),
});
export const selectDeUsuarioSchema = z.object({
  type: z.literal(5),
  ...camposDeSelect,
  default_values: valoresPadraoSchema,
});
export const selectDeCargoSchema = z.object({
  type: z.literal(6),
  ...camposDeSelect,
  default_values: valoresPadraoSchema,
});
export const selectMencionavelSchema = z.object({
  type: z.literal(7),
  ...camposDeSelect,
  default_values: valoresPadraoSchema,
});
export const selectDeCanalSchema = z.object({
  type: z.literal(8),
  ...camposDeSelect,
  /** `type` numérico de canal do Discord (0 texto, 2 voz, 4 categoria, 5 anúncio…). */
  channel_types: z.array(z.number().int()).optional(),
  default_values: valoresPadraoSchema,
});
export type SelectDeTexto = z.infer<typeof selectDeTextoSchema>;
export type SelectDeUsuario = z.infer<typeof selectDeUsuarioSchema>;
export type SelectDeCargo = z.infer<typeof selectDeCargoSchema>;
export type SelectMencionavel = z.infer<typeof selectMencionavelSchema>;
export type SelectDeCanal = z.infer<typeof selectDeCanalSchema>;
export type SelectDeBot =
  | SelectDeTexto
  | SelectDeUsuario
  | SelectDeCargo
  | SelectMencionavel
  | SelectDeCanal;

export const textInputSchema = z.object({
  type: z.literal(4),
  id: idDeComponenteSchema,
  custom_id: customIdSchema,
  /** 1 short · 2 paragraph. */
  style: z.union([z.literal(1), z.literal(2)]),
  /** forma antiga (text input dentro de action row); na nova o rótulo é o `Label`. */
  label: z.string().max(LIMITES_DE_COMPONENTE.ROTULO_DO_TEXT_INPUT).optional(),
  min_length: z.number().int().min(0).max(LIMITES_DE_COMPONENTE.VALOR_DO_TEXT_INPUT).optional(),
  max_length: z.number().int().min(1).max(LIMITES_DE_COMPONENTE.VALOR_DO_TEXT_INPUT).optional(),
  required: z.boolean().optional(),
  value: z.string().max(LIMITES_DE_COMPONENTE.VALOR_DO_TEXT_INPUT).optional(),
  placeholder: z.string().max(LIMITES_DE_COMPONENTE.PLACEHOLDER_DO_TEXT_INPUT).optional(),
});
export type TextInput = z.infer<typeof textInputSchema>;

/**
 * Action row: até 5 botões **ou** um select (ou, num modal antigo, um text
 * input). A regra de composição é conferida por `conferirMensagemDeBot` e
 * `conferirModalDeBot`, e não aqui, porque o `discriminatedUnion` do zod não
 * aceita objeto refinado.
 */
export const actionRowSchema = z.object({
  type: z.literal(1),
  id: idDeComponenteSchema,
  components: z
    .array(
      z.discriminatedUnion("type", [
        botaoSchema,
        selectDeTextoSchema,
        textInputSchema,
        selectDeUsuarioSchema,
        selectDeCargoSchema,
        selectMencionavelSchema,
        selectDeCanalSchema,
      ]),
    )
    .min(1)
    .max(LIMITES_DE_COMPONENTE.BOTOES_POR_ROW),
});
export type ActionRow = z.infer<typeof actionRowSchema>;
export type FilhoDeActionRow = ActionRow["components"][number];

// ── Components v2 (conteúdo e leiaute) ───────────────────────

export const textDisplaySchema = z.object({
  type: z.literal(10),
  id: idDeComponenteSchema,
  /** markdown, como o `content` de uma mensagem. */
  content: z.string().min(1).max(LIMITES_DE_COMPONENTE.TEXTO_V2),
});
export type TextDisplay = z.infer<typeof textDisplaySchema>;

export const thumbnailSchema = z.object({
  type: z.literal(11),
  id: idDeComponenteSchema,
  media: itemDeMidiaSchema,
  description: z.string().max(LIMITES_DE_COMPONENTE.DESCRICAO_DE_MIDIA).nullish(),
  spoiler: z.boolean().optional(),
});
export type Thumbnail = z.infer<typeof thumbnailSchema>;

export const sectionSchema = z.object({
  type: z.literal(9),
  id: idDeComponenteSchema,
  components: z.array(textDisplaySchema).min(1).max(LIMITES_DE_COMPONENTE.TEXTOS_POR_SECTION),
  accessory: z.discriminatedUnion("type", [botaoSchema, thumbnailSchema]),
});
export type Section = z.infer<typeof sectionSchema>;

export const itemDaGaleriaSchema = z.object({
  media: itemDeMidiaSchema,
  description: z.string().max(LIMITES_DE_COMPONENTE.DESCRICAO_DE_MIDIA).nullish(),
  spoiler: z.boolean().optional(),
});
export type ItemDaGaleria = z.infer<typeof itemDaGaleriaSchema>;

export const mediaGallerySchema = z.object({
  type: z.literal(12),
  id: idDeComponenteSchema,
  items: z.array(itemDaGaleriaSchema).min(1).max(LIMITES_DE_COMPONENTE.ITENS_DA_GALERIA),
});
export type MediaGallery = z.infer<typeof mediaGallerySchema>;

/**
 * File. No Discord o `file.url` **só** aceita `attachment://<nome>`; aqui
 * também. `name` e `size` são preenchidos pelo servidor na saída.
 */
export const arquivoSchema = z.object({
  type: z.literal(13),
  id: idDeComponenteSchema,
  file: itemDeMidiaSchema,
  spoiler: z.boolean().optional(),
  name: z.string().optional(),
  size: z.number().int().optional(),
});
export type Arquivo = z.infer<typeof arquivoSchema>;

export const separatorSchema = z.object({
  type: z.literal(14),
  id: idDeComponenteSchema,
  /** padrão `true`. */
  divider: z.boolean().optional(),
  /** 1 small (padrão) · 2 large. */
  spacing: z.union([z.literal(1), z.literal(2)]).optional(),
});
export type Separator = z.infer<typeof separatorSchema>;

export const containerSchema = z.object({
  type: z.literal(17),
  id: idDeComponenteSchema,
  components: z
    .array(
      z.discriminatedUnion("type", [
        actionRowSchema,
        textDisplaySchema,
        sectionSchema,
        mediaGallerySchema,
        separatorSchema,
        arquivoSchema,
      ]),
    )
    .min(1),
  /** RGB `0x000000`–`0xFFFFFF`, ou null. Dado do bot: vai em `style` na tela. */
  accent_color: z.number().int().min(0).max(0xffffff).nullish(),
  spoiler: z.boolean().optional(),
});
export type Container = z.infer<typeof containerSchema>;
export type FilhoDeContainer = Container["components"][number];

/**
 * Um componente **de primeiro nível** de mensagem. Sem `IS_COMPONENTS_V2` só
 * vale o `1` (action row); com a flag, `1`, `9`, `10`, `12`, `13`, `14` e `17`.
 */
export const componenteDeMensagemSchema = z.discriminatedUnion("type", [
  actionRowSchema,
  sectionSchema,
  textDisplaySchema,
  mediaGallerySchema,
  arquivoSchema,
  separatorSchema,
  containerSchema,
]);
export type ComponenteDeMensagem = z.infer<typeof componenteDeMensagemSchema>;

// ── modal ────────────────────────────────────────────────────

export const fileUploadSchema = z.object({
  type: z.literal(19),
  id: idDeComponenteSchema,
  custom_id: customIdSchema,
  min_values: z.number().int().min(0).max(LIMITES_DE_COMPONENTE.ARQUIVOS_DO_UPLOAD).optional(),
  max_values: z.number().int().min(1).max(LIMITES_DE_COMPONENTE.ARQUIVOS_DO_UPLOAD).optional(),
  required: z.boolean().optional(),
  /** `image`, `video`, `audio` ou extensão com ponto (`.pdf`). */
  file_types: z.array(z.string().min(1)).max(LIMITES_DE_COMPONENTE.TIPOS_DO_UPLOAD).optional(),
});

const opcaoDeGrupoSchema = z.object({
  value: z.string().min(1).max(LIMITES_DE_COMPONENTE.VALOR_DA_OPCAO),
  label: z.string().min(1).max(LIMITES_DE_COMPONENTE.ROTULO_DA_OPCAO),
  description: z.string().max(LIMITES_DE_COMPONENTE.DESCRICAO_DA_OPCAO).optional(),
  default: z.boolean().optional(),
});
export type OpcaoDeGrupo = z.infer<typeof opcaoDeGrupoSchema>;

export const radioGroupSchema = z.object({
  type: z.literal(21),
  id: idDeComponenteSchema,
  custom_id: customIdSchema,
  options: z
    .array(opcaoDeGrupoSchema)
    .min(LIMITES_DE_COMPONENTE.OPCOES_DE_RADIO_MIN)
    .max(LIMITES_DE_COMPONENTE.OPCOES_DE_RADIO_MAX),
  required: z.boolean().optional(),
});

export const checkboxGroupSchema = z.object({
  type: z.literal(22),
  id: idDeComponenteSchema,
  custom_id: customIdSchema,
  options: z.array(opcaoDeGrupoSchema).min(1).max(LIMITES_DE_COMPONENTE.OPCOES_DE_CHECKBOX),
  min_values: z.number().int().min(0).max(LIMITES_DE_COMPONENTE.OPCOES_DE_CHECKBOX).optional(),
  max_values: z.number().int().min(1).max(LIMITES_DE_COMPONENTE.OPCOES_DE_CHECKBOX).optional(),
  required: z.boolean().optional(),
});

export const checkboxSchema = z.object({
  type: z.literal(23),
  id: idDeComponenteSchema,
  custom_id: customIdSchema,
  default: z.boolean().optional(),
});

export type FileUpload = z.infer<typeof fileUploadSchema>;
export type RadioGroup = z.infer<typeof radioGroupSchema>;
export type CheckboxGroup = z.infer<typeof checkboxGroupSchema>;
export type Checkbox = z.infer<typeof checkboxSchema>;

export const labelSchema = z.object({
  type: z.literal(18),
  id: idDeComponenteSchema,
  label: z.string().min(1).max(LIMITES_DE_COMPONENTE.ROTULO_DO_LABEL),
  description: z.string().max(LIMITES_DE_COMPONENTE.DESCRICAO_DO_LABEL).optional(),
  component: z.discriminatedUnion("type", [
    textInputSchema,
    selectDeTextoSchema,
    selectDeUsuarioSchema,
    selectDeCargoSchema,
    selectMencionavelSchema,
    selectDeCanalSchema,
    fileUploadSchema,
    radioGroupSchema,
    checkboxGroupSchema,
    checkboxSchema,
  ]),
});
export type Label = z.infer<typeof labelSchema>;
export type FilhoDeLabel = Label["component"];

/** Primeiro nível de um modal: `Label` (a forma nova), action row com text input (a antiga) e text display. */
export const componenteDeModalSchema = z.discriminatedUnion("type", [
  labelSchema,
  actionRowSchema,
  textDisplaySchema,
]);
export type ComponenteDeModal = z.infer<typeof componenteDeModalSchema>;

/** O `data` do callback 9 (MODAL). */
export const modalDeBotSchema = z.object({
  custom_id: customIdSchema,
  title: z.string().min(1).max(LIMITES_DE_COMPONENTE.TITULO_DO_MODAL),
  components: z
    .array(componenteDeModalSchema)
    .min(1)
    .max(LIMITES_DE_COMPONENTE.COMPONENTES_DO_MODAL),
});
export type ModalDeBot = z.infer<typeof modalDeBotSchema>;

// ── autocomplete ─────────────────────────────────────────────

export const escolhaDeAutocompleteSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.union([z.string().max(100), z.number()]),
  name_localizations: z.record(z.string()).nullish(),
});
export type EscolhaDeAutocomplete = z.infer<typeof escolhaDeAutocompleteSchema>;

/** O `data` do callback 8 (APPLICATION_COMMAND_AUTOCOMPLETE_RESULT). */
export const respostaDeAutocompleteSchema = z.object({
  choices: z.array(escolhaDeAutocompleteSchema).max(LIMITES_DE_COMPONENTE.ESCOLHAS_DE_AUTOCOMPLETE),
});
export type RespostaDeAutocomplete = z.infer<typeof respostaDeAutocompleteSchema>;

// ── o payload de bot de uma mensagem ─────────────────────────

/**
 * O que um bot manda numa mensagem, além dos anexos e da citação: é o corpo
 * que `POST/PATCH /channels/:id/messages`, o callback 4/7 e os followups
 * validam. Todos os campos são opcionais porque no `PATCH` ausente quer dizer
 * "não mexe".
 */
export const payloadDeBotSchema = z.object({
  content: z.string().max(MAX_MESSAGE_LENGTH).optional(),
  embeds: z.array(embedSchema).max(LIMITES_DE_EMBED.EMBEDS_POR_MENSAGEM).optional(),
  components: z.array(componenteDeMensagemSchema).optional(),
  flags: z.number().int().min(0).optional(),
});
export type PayloadDeBot = z.infer<typeof payloadDeBotSchema>;

/** O estado completo de uma mensagem de bot, o que a regra de conjunto confere. */
export interface EstadoDeMensagemDeBot {
  content: string;
  embeds: Embed[];
  components: ComponenteDeMensagem[];
  /** as flags finais (qualquer bit; só as que importam são lidas). */
  flags: number;
  /** a mensagem tem anexo ou figurinha? (para a regra de "mensagem vazia") */
  temAnexos?: boolean;
}

/**
 * Um erro de validação, com o caminho no formato do Discord.
 *
 * `caminho` é `["embeds", 0, "title"]`; a casca o transforma no objeto aninhado
 * do `50035` (`{ embeds: { "0": { title: { _errors: [...] } } } }`). O `codigo`
 * segue o estilo do Discord (`BASE_TYPE_MAX_LENGTH`…), mas as libs de bot não o
 * classificam — elas olham o `50035` de fora —, então os códigos das regras de
 * conjunto são descritivos, e não uma cópia garantida dos internos do Discord.
 */
export interface ErroDePayloadDeBot {
  caminho: (string | number)[];
  codigo: string;
  mensagem: string;
}

export type ResultadoDoPayloadDeBot =
  | { ok: true; payload: PayloadDeBot }
  | { ok: false; erros: ErroDePayloadDeBot[] };

/**
 * Valida a **forma** (tipos, limites de campo) e normaliza. Não confere o
 * conjunto (v2 × legado, 40 componentes, custom_id repetido): isso depende do
 * estado final da mensagem, que num `PATCH` só o servidor conhece — ver
 * `conferirMensagemDeBot`. Quem cria mensagem chama as duas.
 */
export function validarPayloadDeBot(cru: unknown): ResultadoDoPayloadDeBot {
  const r = payloadDeBotSchema.safeParse(cru);
  if (!r.success) return { ok: false, erros: r.error.issues.map(erroDoZod) };
  return { ok: true, payload: normalizarPayloadDeBot(r.data) };
}

/** Valida o `data` do callback 9. Forma + regras do modal. */
export function validarModalDeBot(
  cru: unknown,
): { ok: true; modal: ModalDeBot } | { ok: false; erros: ErroDePayloadDeBot[] } {
  const r = modalDeBotSchema.safeParse(cru);
  if (!r.success) return { ok: false, erros: r.error.issues.map(erroDoZod) };
  const modal: ModalDeBot = {
    ...r.data,
    components: numerarComponentes(r.data.components),
  };
  const erros = conferirModalDeBot(modal);
  return erros.length > 0 ? { ok: false, erros } : { ok: true, modal };
}

function erroDoZod(issue: z.ZodIssue): ErroDePayloadDeBot {
  let codigo = "BASE_TYPE_INVALID";
  if (issue.code === "invalid_type") {
    codigo = issue.received === "undefined" ? "BASE_TYPE_REQUIRED" : "BASE_TYPE_INVALID";
  } else if (issue.code === "too_big") {
    codigo = issue.type === "string" ? "BASE_TYPE_MAX_LENGTH" : issue.type === "array" ? "BASE_TYPE_BAD_LENGTH" : "NUMBER_TYPE_MAX";
  } else if (issue.code === "too_small") {
    codigo = issue.type === "string" ? "BASE_TYPE_MIN_LENGTH" : issue.type === "array" ? "BASE_TYPE_BAD_LENGTH" : "NUMBER_TYPE_MIN";
  } else if (issue.code === "invalid_union_discriminator" || issue.code === "invalid_literal") {
    codigo = "BASE_TYPE_CHOICES";
  }
  return { caminho: issue.path, codigo, mensagem: issue.message };
}

// ── regras de conjunto ───────────────────────────────────────

const TOPO_V2 = new Set<number>([1, 9, 10, 12, 13, 14, 17]);

/**
 * As regras que só fazem sentido na mensagem inteira. Devolve a lista de erros
 * (vazia = válida). É pura: a API a chama no `create` e no estado final do
 * `PATCH`; a web pode chamá-la num teste.
 *
 * - `IS_COMPONENTS_V2`: sem `content` e sem `embeds`; primeiro nível só
 *   1/9/10/12/13/14/17; até 40 componentes contando os aninhados; até 4000
 *   caracteres somando os text displays.
 * - sem a flag: primeiro nível só action row, até 5.
 * - action row: 1–5 botões **ou** exatamente um select; nunca text input
 *   (esse é de modal).
 * - botão: estilos 1–4 exigem `custom_id` e recusam `url`/`sku_id`; 5 exige
 *   `url` e recusa `custom_id`; 6 exige `sku_id` e recusa `custom_id`, `label`,
 *   `url` e `emoji`; todo botão que não é premium precisa de `label` ou `emoji`.
 * - select: `min_values` ≤ `max_values`; no de texto, `max_values` ≤ opções.
 * - `custom_id` único na mensagem.
 * - `File` só com `attachment://`.
 * - embeds: soma de 6000 caracteres.
 * - vazia: sem texto, embed, componente nem anexo → recusa.
 */
export function conferirMensagemDeBot(estado: EstadoDeMensagemDeBot): ErroDePayloadDeBot[] {
  const erros: ErroDePayloadDeBot[] = [];
  const v2 = temFlag(estado.flags, FLAGS_DE_MENSAGEM.IS_COMPONENTS_V2);

  const totalDeEmbed = estado.embeds.reduce((soma, e) => soma + caracteresDoEmbed(e), 0);
  if (totalDeEmbed > LIMITES_DE_EMBED.TOTAL) {
    erros.push({
      caminho: ["embeds"],
      codigo: "MAX_EMBED_SIZE_EXCEEDED",
      mensagem: `Embed size exceeds maximum size of ${LIMITES_DE_EMBED.TOTAL}`,
    });
  }

  if (v2) {
    if (estado.content.trim().length > 0) {
      erros.push({
        caminho: ["content"],
        codigo: "MESSAGE_CANNOT_USE_LEGACY_FIELDS_WITH_COMPONENTS_V2",
        mensagem: "The 'content' field cannot be used when using MessageFlags.IS_COMPONENTS_V2",
      });
    }
    if (estado.embeds.length > 0) {
      erros.push({
        caminho: ["embeds"],
        codigo: "MESSAGE_CANNOT_USE_LEGACY_FIELDS_WITH_COMPONENTS_V2",
        mensagem: "The 'embeds' field cannot be used when using MessageFlags.IS_COMPONENTS_V2",
      });
    }
    estado.components.forEach((c, i) => {
      if (!TOPO_V2.has(c.type)) {
        erros.push({ caminho: ["components", i, "type"], codigo: "BASE_TYPE_CHOICES", mensagem: `Component type ${c.type} is not allowed at the top level` });
      }
    });
    const total = contarComponentes(estado.components);
    if (total > LIMITES_DE_COMPONENTE.COMPONENTES_V2) {
      erros.push({
        caminho: ["components"],
        codigo: "COMPONENT_LAYOUT_TOO_MANY_COMPONENTS",
        mensagem: `Must be ${LIMITES_DE_COMPONENTE.COMPONENTES_V2} or fewer in total`,
      });
    }
    if (textoDosComponentes(estado.components).length > LIMITES_DE_COMPONENTE.TEXTO_V2) {
      erros.push({
        caminho: ["components"],
        codigo: "COMPONENT_LAYOUT_TEXT_TOO_LONG",
        mensagem: `Text displays must be ${LIMITES_DE_COMPONENTE.TEXTO_V2} or fewer characters in total`,
      });
    }
  } else {
    if (estado.components.length > LIMITES_DE_COMPONENTE.ACTION_ROWS_LEGADO) {
      erros.push({
        caminho: ["components"],
        codigo: "BASE_TYPE_BAD_LENGTH",
        mensagem: `Must be ${LIMITES_DE_COMPONENTE.ACTION_ROWS_LEGADO} or fewer in length`,
      });
    }
    estado.components.forEach((c, i) => {
      if (c.type !== 1) {
        erros.push({
          caminho: ["components", i, "type"],
          codigo: "COMPONENT_LAYOUT_REQUIRES_COMPONENTS_V2",
          mensagem: `Component type ${c.type} requires MessageFlags.IS_COMPONENTS_V2`,
        });
      }
    });
  }

  const vistos = new Set<string>();
  percorrer(estado.components, ["components"], (c, caminho) => {
    if (c.type === 1) conferirActionRow(c, caminho, erros, "mensagem");
    if (c.type === 2) conferirBotao(c, caminho, erros);
    if (c.type === 3 || c.type === 5 || c.type === 6 || c.type === 7 || c.type === 8) {
      conferirSelect(c, caminho, erros);
    }
    if (c.type === 13 && !c.file.url.startsWith("attachment://")) {
      erros.push({
        caminho: [...caminho, "file", "url"],
        codigo: "UNFURLED_MEDIA_ITEM_ATTACHMENT_REQUIRED",
        mensagem: "File components only support attachment:// references",
      });
    }
    const customId = "custom_id" in c ? c.custom_id : undefined;
    if (customId) {
      if (vistos.has(customId)) {
        erros.push({
          caminho: [...caminho, "custom_id"],
          codigo: "COMPONENT_CUSTOM_ID_DUPLICATED",
          mensagem: `Component custom id cannot be duplicated: ${customId}`,
        });
      }
      vistos.add(customId);
    }
  });

  const vazia =
    estado.content.trim().length === 0 &&
    estado.embeds.length === 0 &&
    estado.components.length === 0 &&
    !estado.temAnexos;
  if (vazia) {
    erros.push({ caminho: ["content"], codigo: "BASE_TYPE_REQUIRED", mensagem: "Cannot send an empty message" });
  }

  return erros;
}

/** As regras do modal que o schema sozinho não pega. */
export function conferirModalDeBot(modal: ModalDeBot): ErroDePayloadDeBot[] {
  const erros: ErroDePayloadDeBot[] = [];
  const vistos = new Set<string>();
  modal.components.forEach((c, i) => {
    const caminho: (string | number)[] = ["components", i];
    if (c.type === 1) conferirActionRow(c, caminho, erros, "modal");
    const alvos: { comp: FilhoDeLabel | FilhoDeActionRow; caminho: (string | number)[] }[] = [];
    if (c.type === 18) alvos.push({ comp: c.component, caminho: [...caminho, "component"] });
    if (c.type === 1) c.components.forEach((f, j) => alvos.push({ comp: f, caminho: [...caminho, "components", j] }));
    for (const { comp, caminho: cam } of alvos) {
      if ("disabled" in comp && comp.disabled) {
        erros.push({ caminho: [...cam, "disabled"], codigo: "COMPONENT_DISABLED_IN_MODAL", mensagem: "Modals cannot have disabled components" });
      }
      if (comp.type === 3 || comp.type === 5 || comp.type === 6 || comp.type === 7 || comp.type === 8) {
        conferirSelect(comp, cam, erros);
      }
      if (comp.type === 4 && comp.min_length !== undefined && comp.max_length !== undefined && comp.min_length > comp.max_length) {
        erros.push({ caminho: [...cam, "min_length"], codigo: "BASE_TYPE_BAD_LENGTH", mensagem: "min_length must be less than or equal to max_length" });
      }
      if ("custom_id" in comp && comp.custom_id) {
        if (vistos.has(comp.custom_id)) {
          erros.push({ caminho: [...cam, "custom_id"], codigo: "COMPONENT_CUSTOM_ID_DUPLICATED", mensagem: `Component custom id cannot be duplicated: ${comp.custom_id}` });
        }
        vistos.add(comp.custom_id);
      }
    }
  });
  return erros;
}

function conferirActionRow(
  row: ActionRow,
  caminho: (string | number)[],
  erros: ErroDePayloadDeBot[],
  onde: "mensagem" | "modal",
): void {
  const botoes = row.components.filter((f) => f.type === 2).length;
  const selects = row.components.filter((f) => f.type !== 2 && f.type !== 4).length;
  const inputs = row.components.filter((f) => f.type === 4).length;
  if (onde === "mensagem" && inputs > 0) {
    erros.push({ caminho: [...caminho, "components"], codigo: "COMPONENT_TYPE_INVALID", mensagem: "Text inputs are only allowed in modals" });
  }
  if (onde === "modal" && (botoes > 0 || selects > 0 || inputs !== 1)) {
    erros.push({ caminho: [...caminho, "components"], codigo: "COMPONENT_TYPE_INVALID", mensagem: "A modal action row must contain exactly one text input" });
  }
  if (onde === "mensagem" && selects > 0 && row.components.length !== 1) {
    erros.push({ caminho: [...caminho, "components"], codigo: "COMPONENT_LAYOUT_WIDTH_EXCEEDED", mensagem: "A select must be alone in its action row" });
  }
}

function conferirBotao(b: Botao, caminho: (string | number)[], erros: ErroDePayloadDeBot[]): void {
  const erro = (campo: string, codigo: string, mensagem: string) =>
    erros.push({ caminho: [...caminho, campo], codigo, mensagem });
  if (b.style >= 1 && b.style <= 4) {
    if (!b.custom_id) erro("custom_id", "BUTTON_COMPONENT_CUSTOM_ID_REQUIRED", "A custom id is required");
    if (b.url) erro("url", "BUTTON_COMPONENT_INVALID_URL", "Only link buttons can have a url");
    if (b.sku_id) erro("sku_id", "BUTTON_COMPONENT_INVALID_SKU", "Only premium buttons can have a sku_id");
  } else if (b.style === ESTILO_DE_BOTAO.LINK) {
    if (!b.url) erro("url", "BUTTON_COMPONENT_URL_REQUIRED", "A url is required");
    else if (!/^(https?|discord):\/\//i.test(b.url)) erro("url", "BUTTON_COMPONENT_INVALID_URL", "Scheme must be one of ('http', 'https', 'discord')");
    if (b.custom_id) erro("custom_id", "BUTTON_COMPONENT_LINK_HAS_CUSTOM_ID", "A custom id cannot be used with a link button");
  } else if (b.style === ESTILO_DE_BOTAO.PREMIUM) {
    if (!b.sku_id) erro("sku_id", "BUTTON_COMPONENT_SKU_REQUIRED", "A sku_id is required");
    if (b.custom_id || b.label || b.url || b.emoji) {
      erro("style", "BUTTON_COMPONENT_PREMIUM_INVALID", "Premium buttons cannot have custom_id, label, url or emoji");
    }
  }
  if (b.style !== ESTILO_DE_BOTAO.PREMIUM && !b.label && !b.emoji) {
    erro("label", "BUTTON_COMPONENT_LABEL_OR_EMOJI_REQUIRED", "A label or emoji is required");
  }
}

function conferirSelect(s: SelectDeBot, caminho: (string | number)[], erros: ErroDePayloadDeBot[]): void {
  const min = s.min_values ?? 1;
  const max = s.max_values ?? 1;
  if (min > max) {
    erros.push({ caminho: [...caminho, "min_values"], codigo: "SELECT_COMPONENT_MIN_GREATER_THAN_MAX", mensagem: "min_values must be less than or equal to max_values" });
  }
  if (s.type === 3 && max > s.options.length) {
    erros.push({ caminho: [...caminho, "max_values"], codigo: "SELECT_COMPONENT_MAX_VALUES_EXCEEDS_OPTIONS", mensagem: "max_values must be less than or equal to the number of options" });
  }
  if (s.type !== 3 && s.default_values && (s.default_values.length > max || (s.default_values.length > 0 && s.default_values.length < min))) {
    erros.push({ caminho: [...caminho, "default_values"], codigo: "BASE_TYPE_BAD_LENGTH", mensagem: "The number of default values must be between min_values and max_values" });
  }
}

/** Todo nó de componente, em profundidade, na ordem do Discord. */
type NoDeComponente =
  | ComponenteDeMensagem
  | FilhoDeActionRow
  | FilhoDeContainer
  | Thumbnail
  | Section["accessory"];

function percorrer(
  lista: readonly NoDeComponente[],
  caminhoBase: (string | number)[],
  visitar: (c: NoDeComponente, caminho: (string | number)[]) => void,
): void {
  lista.forEach((c, i) => {
    const caminho = [...caminhoBase, i];
    visitar(c, caminho);
    if (c.type === 1 || c.type === 17) percorrer(c.components, [...caminho, "components"], visitar);
    if (c.type === 9) {
      percorrer(c.components, [...caminho, "components"], visitar);
      visitar(c.accessory, [...caminho, "accessory"]);
    }
  });
}

/** Quantos componentes a mensagem tem, contando os aninhados (a regra dos 40). */
export function contarComponentes(lista: readonly ComponenteDeMensagem[]): number {
  let n = 0;
  percorrer(lista, [], () => {
    n += 1;
  });
  return n;
}

function caracteresDoEmbed(e: Embed): number {
  let n = (e.title ?? "").length + (e.description ?? "").length;
  n += (e.footer?.text ?? "").length + (e.author?.name ?? "").length;
  for (const f of e.fields ?? []) n += f.name.length + f.value.length;
  return n;
}

// ── normalização ─────────────────────────────────────────────

/**
 * O que o servidor faz com o corpo antes de gravar, como o Discord faz:
 *
 * - apara espaço nas pontas dos textos de embed ("Leading and trailing
 *   whitespace characters are not included");
 * - `type: "rich"` em todo embed, e o `timestamp` reescrito em ISO;
 * - apaga os campos que só o servidor preenche (`proxy_url`, `proxy_icon_url`,
 *   dimensões e `attachment_id` das mídias, `name`/`size` do File);
 * - dá `id` sequencial a todo componente que veio sem (ou com `0`), sem repetir
 *   um `id` que o bot escolheu.
 *
 * Idempotente: normalizar o normalizado não muda nada.
 */
export function normalizarPayloadDeBot(p: PayloadDeBot): PayloadDeBot {
  const saida: PayloadDeBot = {};
  if (p.content !== undefined) saida.content = p.content;
  if (p.flags !== undefined) saida.flags = p.flags;
  if (p.embeds !== undefined) saida.embeds = p.embeds.map(normalizarEmbed);
  if (p.components !== undefined) saida.components = numerarComponentes(p.components.map(limparComponente));
  return saida;
}

function normalizarEmbed(e: Embed): Embed {
  const saida: Embed = { type: "rich" };
  const titulo = e.title?.trim();
  if (titulo) saida.title = titulo;
  const descricao = e.description?.trim();
  if (descricao) saida.description = descricao;
  if (e.url) saida.url = e.url;
  if (e.timestamp) saida.timestamp = new Date(e.timestamp).toISOString();
  if (e.color !== undefined && e.color !== null) saida.color = e.color;
  if (e.footer) {
    saida.footer = { text: e.footer.text.trim() };
    if (e.footer.icon_url) saida.footer.icon_url = e.footer.icon_url;
  }
  if (e.image) saida.image = { url: e.image.url };
  if (e.thumbnail) saida.thumbnail = { url: e.thumbnail.url };
  if (e.video) saida.video = { url: e.video.url };
  if (e.provider) saida.provider = { ...e.provider };
  if (e.author) {
    saida.author = { name: e.author.name.trim() };
    if (e.author.url) saida.author.url = e.author.url;
    if (e.author.icon_url) saida.author.icon_url = e.author.icon_url;
  }
  if (e.fields) {
    saida.fields = e.fields.map((f) => {
      const campo: CampoDeEmbed = { name: f.name.trim(), value: f.value.trim() };
      if (f.inline !== undefined) campo.inline = f.inline;
      return campo;
    });
  }
  return saida;
}

const soUrl = (m: ItemDeMidia): ItemDeMidia => ({ url: m.url });

function limparComponente(c: ComponenteDeMensagem): ComponenteDeMensagem {
  switch (c.type) {
    case 9:
      return {
        ...c,
        accessory: c.accessory.type === 11 ? { ...c.accessory, media: soUrl(c.accessory.media) } : c.accessory,
      };
    case 12:
      return { ...c, items: c.items.map((item) => ({ ...item, media: soUrl(item.media) })) };
    case 13: {
      const copia: Arquivo = { ...c, file: soUrl(c.file) };
      delete copia.name;
      delete copia.size;
      return copia;
    }
    case 17:
      return {
        ...c,
        components: c.components.map((f) => limparComponente(f) as FilhoDeContainer),
      };
    default:
      return c;
  }
}

/**
 * Dá `id` a quem não tem. Genérico para servir a mensagem e ao modal: os dois
 * são árvores de objetos com `type` e, às vezes, `components`/`component`/
 * `accessory`. Devolve cópias; não muta a entrada.
 */
function numerarComponentes<T extends { type: number; id?: number }>(lista: readonly T[]): T[] {
  const usados = new Set<number>();
  const coletar = (no: unknown) => {
    for (const filho of filhosDe(no)) coletar(filho);
    const id = (no as { id?: unknown }).id;
    if (typeof id === "number" && id > 0) usados.add(id);
  };
  lista.forEach(coletar);

  let proximo = 1;
  const gerar = () => {
    while (usados.has(proximo)) proximo += 1;
    usados.add(proximo);
    return proximo;
  };
  const numerar = (no: Record<string, unknown>): Record<string, unknown> => {
    const copia: Record<string, unknown> = { ...no };
    if (typeof copia.id !== "number" || copia.id <= 0) copia.id = gerar();
    if (Array.isArray(copia.components)) {
      copia.components = (copia.components as Record<string, unknown>[]).map(numerar);
    }
    if (copia.component && typeof copia.component === "object") {
      copia.component = numerar(copia.component as Record<string, unknown>);
    }
    if (copia.accessory && typeof copia.accessory === "object") {
      copia.accessory = numerar(copia.accessory as Record<string, unknown>);
    }
    return copia;
  };
  return lista.map((c) => numerar(c as unknown as Record<string, unknown>) as unknown as T);
}

function filhosDe(no: unknown): unknown[] {
  if (!no || typeof no !== "object") return [];
  const o = no as Record<string, unknown>;
  const filhos: unknown[] = [];
  if (Array.isArray(o.components)) filhos.push(...o.components);
  if (o.component && typeof o.component === "object") filhos.push(o.component);
  if (o.accessory && typeof o.accessory === "object") filhos.push(o.accessory);
  return filhos;
}

// ── leitura do banco ─────────────────────────────────────────

/**
 * O `Json` da coluna → a lista tipada. **Não valida de novo** (o que está no
 * banco já passou por `validarPayloadDeBot`); só protege contra uma linha que
 * não é lista, que é o que um `Json` do Prisma pode ser em teoria.
 */
export function lerEmbedsGuardados(json: unknown): Embed[] {
  return Array.isArray(json) ? (json as Embed[]) : [];
}

export function lerComponentesGuardados(json: unknown): ComponenteDeMensagem[] {
  return Array.isArray(json) ? (json as ComponenteDeMensagem[]) : [];
}

// ── anexos referenciados (`attachment://`) ───────────────────

/** O mínimo de um anexo que a resolução precisa (é o `Attachment` do DTO). */
export interface AnexoParaResolver {
  id: string;
  filename: string;
  url: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
}

const PREFIXO_DE_ANEXO = "attachment://";

/**
 * Troca `attachment://<nome>` pela URL do anexo da própria mensagem, como a
 * resposta do Discord faz: `url` vira a URL servível, e entram `attachment_id`,
 * `content_type`, `width` e `height`; o `File` ganha `name` e `size`. Referência
 * a um nome que a mensagem não tem fica como veio — quem desenha mostra o
 * estado de "arquivo indisponível".
 *
 * Roda **na montagem do DTO** (a URL do anexo é assinada e expira), nunca na
 * gravação.
 */
export function resolverAnexosDoPayload(
  embeds: readonly Embed[],
  components: readonly ComponenteDeMensagem[],
  anexos: readonly AnexoParaResolver[],
): { embeds: Embed[]; components: ComponenteDeMensagem[] } {
  if (anexos.length === 0) return { embeds: [...embeds], components: [...components] };
  const porNome = new Map<string, AnexoParaResolver>(
    anexos.map((a): [string, AnexoParaResolver] => [a.filename, a]),
  );
  const anexoDe = (url: string | undefined) =>
    url && url.startsWith(PREFIXO_DE_ANEXO) ? porNome.get(url.slice(PREFIXO_DE_ANEXO.length)) : undefined;
  const urlDe = (url: string) => anexoDe(url)?.url ?? url;
  const midia = (m: ItemDeMidia): ItemDeMidia => {
    const a = anexoDe(m.url);
    if (!a) return m;
    return { url: a.url, attachment_id: a.id, content_type: a.contentType, width: a.width, height: a.height };
  };

  const embedsResolvidos = embeds.map((e) => {
    const copia: Embed = { ...e };
    if (e.image) copia.image = { ...e.image, url: urlDe(e.image.url) };
    if (e.thumbnail) copia.thumbnail = { ...e.thumbnail, url: urlDe(e.thumbnail.url) };
    if (e.footer?.icon_url) copia.footer = { ...e.footer, icon_url: urlDe(e.footer.icon_url) };
    if (e.author?.icon_url) copia.author = { ...e.author, icon_url: urlDe(e.author.icon_url) };
    return copia;
  });

  const componente = (c: ComponenteDeMensagem): ComponenteDeMensagem => {
    switch (c.type) {
      case 9:
        return c.accessory.type === 11 ? { ...c, accessory: { ...c.accessory, media: midia(c.accessory.media) } } : c;
      case 12:
        return { ...c, items: c.items.map((item) => ({ ...item, media: midia(item.media) })) };
      case 13: {
        const a = anexoDe(c.file.url);
        return a ? { ...c, file: midia(c.file), name: a.filename, size: a.size } : c;
      }
      case 17:
        return { ...c, components: c.components.map((f) => componente(f) as FilhoDeContainer) };
      default:
        return c;
    }
  };

  return { embeds: embedsResolvidos, components: components.map(componente) };
}

/** Os nomes de anexo que o payload referencia — para a v2 esconder os outros. */
export function anexosReferenciados(
  embeds: readonly Embed[],
  components: readonly ComponenteDeMensagem[],
): Set<string> {
  const nomes = new Set<string>();
  const ver = (url: string | undefined) => {
    if (url && url.startsWith(PREFIXO_DE_ANEXO)) nomes.add(url.slice(PREFIXO_DE_ANEXO.length));
  };
  for (const e of embeds) {
    ver(e.image?.url);
    ver(e.thumbnail?.url);
    ver(e.footer?.icon_url);
    ver(e.author?.icon_url);
  }
  percorrer(components, [], (c) => {
    if (c.type === 11) ver(c.media.url);
    if (c.type === 12) for (const item of c.items) ver(item.media.url);
    if (c.type === 13) ver(c.file.url);
  });
  return nomes;
}

// ── o texto achatado ─────────────────────────────────────────

/**
 * Texto dos componentes que têm texto para quem lê: text displays (soltos, em
 * section e em container), na ordem da tela. Botão e select ficam de fora — são
 * ação, não conteúdo.
 */
function textoDosComponentes(lista: readonly ComponenteDeMensagem[]): string {
  const partes: string[] = [];
  percorrer(lista, [], (c) => {
    if (c.type === 10) partes.push(c.content);
  });
  return partes.join("");
}

/**
 * Embeds → texto, na ordem em que o Discord os desenha: autor, título (com
 * link em markdown), descrição, campos (`**nome**: valor`), rodapé e a URL da
 * imagem. **Tolerante** (aceita `unknown[]`): serve tanto ao que está no banco
 * quanto a um corpo cru.
 *
 * Deixou de ser a forma de guardar embed na onda 3; continua existindo para os
 * lugares sem renderizador — ver "Onde o texto achatado ainda é usado" em
 * `docs/CONTRATO-ONDA-3.md`.
 */
export function achatarEmbeds(embeds: readonly unknown[], limite = MAX_MESSAGE_LENGTH): string {
  const partes: string[] = [];
  for (const cru of embeds) {
    const embed = objeto(cru);
    if (!embed) continue;

    const titulo = texto(embed.title);
    const url = texto(embed.url);
    if (titulo) partes.push(url ? `[${titulo}](${url})` : `**${titulo}**`);
    else if (url) partes.push(url);

    const descricao = texto(embed.description);
    if (descricao) partes.push(descricao);

    for (const campoCru of Array.isArray(embed.fields) ? embed.fields : []) {
      const campo = objeto(campoCru);
      const nome = campo && texto(campo.name);
      const valor = campo && texto(campo.value);
      if (nome && valor) partes.push(`**${nome}**: ${valor}`);
      else if (valor) partes.push(valor);
    }

    const rodape = objeto(embed.footer);
    const textoDoRodape = rodape && texto(rodape.text);
    if (textoDoRodape) partes.push(textoDoRodape);

    const imagem = objeto(embed.image);
    const urlDaImagem = imagem && texto(imagem.url);
    if (urlDaImagem) partes.push(urlDaImagem);
  }
  const inteiro = partes.join("\n");
  return inteiro.length > limite ? inteiro.slice(0, limite) : inteiro;
}

/**
 * O texto de busca e de prévia de uma mensagem de bot: o `content`, os embeds
 * achatados e os text displays, separados por quebra de linha. É o que vai para
 * `MessageBotPayload.flatText` (e o que a busca procura).
 */
export function achatarPayloadDeBot(p: {
  content?: string;
  embeds?: readonly Embed[];
  components?: readonly ComponenteDeMensagem[];
}): string {
  const partes: string[] = [];
  const conteudo = (p.content ?? "").trim();
  if (conteudo) partes.push(conteudo);
  const doEmbed = achatarEmbeds(p.embeds ?? [], Number.POSITIVE_INFINITY);
  if (doEmbed) partes.push(doEmbed);
  const textos: string[] = [];
  percorrer(p.components ?? [], [], (c) => {
    if (c.type === 10) textos.push(c.content.trim());
  });
  if (textos.length > 0) partes.push(textos.join("\n"));
  return partes.join("\n");
}

/**
 * O texto de uma mensagem para quem não tem renderizador de embed/componente:
 * notificação de desktop, prévia da lista de conversas, trecho de resposta.
 * Mensagem de humano devolve o próprio `content`.
 */
export function textoAchatadoDaMensagem(m: {
  content: string;
  embeds?: readonly Embed[];
  components?: readonly ComponenteDeMensagem[];
}): string {
  if (!m.embeds?.length && !m.components?.length) return m.content;
  return achatarPayloadDeBot(m);
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

// ── web → API: as rotas internas das interações de componente ─

const nonceSchema = z.string().min(1).max(64);

/**
 * `POST /api/channels/:channelId/interactions/componente` — clicar num botão ou
 * escolher num select de uma mensagem (normal **ou** efêmera).
 *
 * `values` só em select: para o 3, os `value` das opções; para 5/6/7/8, os
 * **cuids** de usuário/cargo/canal (a API traduz para snowflake e monta o
 * `resolved`). Botão manda sem `values`. Link e premium nunca chamam a rota.
 */
export const cliqueEmComponenteSchema = z.object({
  messageId: idSchema,
  customId: customIdSchema,
  componentType: z.union([
    z.literal(2),
    z.literal(3),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
  ]),
  values: z.array(z.string().min(1).max(100)).max(LIMITES_DE_COMPONENTE.VALORES_DO_SELECT).optional(),
  /** gerado pelo navegador; volta em todo evento da interação (ver `interaction.*`). */
  nonce: nonceSchema,
});
export type CliqueEmComponenteInput = z.infer<typeof cliqueEmComponenteSchema>;

/** Um componente respondido dentro de um `Label` (o `data.components[].component` do MODAL_SUBMIT). */
export const respostaDeCampoDeModalSchema = z.union([
  z.object({ type: z.literal(4), id: z.number().int(), custom_id: customIdSchema, value: z.string().max(LIMITES_DE_COMPONENTE.VALOR_DO_TEXT_INPUT) }),
  z.object({
    type: z.union([z.literal(3), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
    id: z.number().int(),
    custom_id: customIdSchema,
    /** 3: os `value`; 5/6/7/8: cuids. */
    values: z.array(z.string().min(1).max(100)).max(LIMITES_DE_COMPONENTE.VALORES_DO_SELECT),
  }),
  z.object({
    type: z.literal(19),
    id: z.number().int(),
    custom_id: customIdSchema,
    /** cuids de `Attachment` já enviados por `POST /uploads`. */
    values: z.array(idSchema).max(LIMITES_DE_COMPONENTE.ARQUIVOS_DO_UPLOAD),
  }),
  z.object({ type: z.literal(21), id: z.number().int(), custom_id: customIdSchema, value: z.string().max(100).nullable() }),
  z.object({ type: z.literal(22), id: z.number().int(), custom_id: customIdSchema, values: z.array(z.string().max(100)).max(LIMITES_DE_COMPONENTE.OPCOES_DE_CHECKBOX) }),
  z.object({ type: z.literal(23), id: z.number().int(), custom_id: customIdSchema, value: z.boolean() }),
]);
export type RespostaDeCampoDeModal = z.infer<typeof respostaDeCampoDeModalSchema>;

/** Primeiro nível da resposta: `Label`, action row antiga com um text input, ou text display. */
export const respostaDeComponenteDeModalSchema = z.union([
  z.object({ type: z.literal(18), id: z.number().int(), component: respostaDeCampoDeModalSchema }),
  z.object({
    type: z.literal(1),
    id: z.number().int(),
    components: z
      .array(z.object({ type: z.literal(4), id: z.number().int(), custom_id: customIdSchema, value: z.string().max(LIMITES_DE_COMPONENTE.VALOR_DO_TEXT_INPUT) }))
      .length(1),
  }),
  z.object({ type: z.literal(10), id: z.number().int() }),
]);
export type RespostaDeComponenteDeModal = z.infer<typeof respostaDeComponenteDeModalSchema>;

/**
 * `POST /api/channels/:channelId/interactions/modal` — enviar o modal que um bot
 * abriu (callback 9). `interactionId` é o cuid da interação que **recebeu** o
 * modal (vem no `interaction.modal`); a API confere que o modal existe, é deste
 * usuário, não venceu e tem este `custom_id`.
 */
export const envioDeModalSchema = z.object({
  interactionId: idSchema,
  customId: customIdSchema,
  components: z.array(respostaDeComponenteDeModalSchema).min(1).max(LIMITES_DE_COMPONENTE.COMPONENTES_DO_MODAL),
  nonce: nonceSchema,
});
export type EnvioDeModalInput = z.infer<typeof envioDeModalSchema>;

/**
 * `POST /api/channels/:channelId/interactions/autocomplete` — o composer pede
 * sugestões para a opção em foco de um comando de barra (`autocomplete: true`).
 * Exatamente uma opção vem com `focused: true`; o `value` dela é o que está
 * digitado, **sempre texto**, como no Discord.
 */
export const pedidoDeAutocompleteSchema = z
  .object({
    commandId: idSchema,
    options: z
      .array(
        z.object({
          name: z.string().min(1).max(32),
          type: z.number().int(),
          value: z.union([z.string().max(6000), z.number(), z.boolean()]),
          focused: z.boolean().optional(),
        }),
      )
      .max(25),
    nonce: nonceSchema,
  })
  .refine((p) => p.options.filter((o) => o.focused).length === 1, {
    message: "exatamente uma opção precisa estar em foco",
    path: ["options"],
  });
export type PedidoDeAutocompleteInput = z.infer<typeof pedidoDeAutocompleteSchema>;

/**
 * A resposta **imediata** das três rotas acima (200). A resposta do bot nunca
 * vem aqui: chega pelo socket (`interaction.*`, `message.*`). O `nonce` é o
 * mesmo que o navegador mandou — é por ele, e não pelo `id`, que a store casa
 * os eventos, porque o evento pode chegar antes desta resposta.
 */
export interface InteracaoDeBotCriada {
  /** cuid da `Interaction`. */
  id: string;
  nonce: string;
  /** ISO. `createdAt + 15 min`. */
  expiresAt: string;
}

// ── API → web: os eventos (sala `user:<quem disparou>`) ──────

/**
 * `interaction.success` — o bot respondeu a tempo (callback 4, 5, 6, 7 ou 9).
 * Tira o "carregando" do botão/select. Não traz a mensagem: ela chega pelo
 * `message.new`/`message.updated` de sempre.
 */
export interface InteracaoConcluidaEvent {
  interactionId: string;
  nonce: string;
  channelId: string;
  /** mensagem de origem do componente; null em autocomplete/comando. */
  messageId: string | null;
  customId: string | null;
}

/** Por que a interação falhou. */
export type MotivoDaFalhaDeInteracao =
  /** passaram `PRAZO_DA_RESPOSTA_DO_BOT_MS` sem callback. */
  | "sem_resposta"
  /** o bot não tem sessão de gateway aberta: falha na hora, sem esperar os 3 s. */
  | "bot_offline";

/**
 * `interaction.failed` — o "Esta interação falhou" do Discord, embaixo da
 * fileira do componente. Só para quem clicou.
 */
export interface InteracaoFalhouEvent {
  interactionId: string;
  nonce: string;
  channelId: string;
  messageId: string | null;
  customId: string | null;
  motivo: MotivoDaFalhaDeInteracao;
}

/**
 * `interaction.modal` — o bot respondeu com callback 9. Só a pessoa que clicou
 * (ou digitou o comando) recebe, em todas as sessões dela; a store abre o modal
 * na sessão que tem o `nonce` pendente, e as outras ignoram.
 */
export interface ModalDeBotAbertoEvent {
  /** cuid da interação que recebeu o modal — vai de volta no `envioDeModalSchema`. */
  interactionId: string;
  nonce: string;
  channelId: string;
  applicationId: string;
  /** o usuário-bot (nome e avatar do aviso "Isto será enviado para <app>"). */
  bot: PublicUser;
  modal: ModalDeBot;
}

/** `interaction.autocomplete` — as sugestões do callback 8. */
export interface AutocompleteDeBotEvent {
  interactionId: string;
  nonce: string;
  choices: EscolhaDeAutocomplete[];
}
