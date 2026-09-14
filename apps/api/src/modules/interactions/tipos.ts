// Vocabulário da F3: as formas que atravessam os lotes A (domínio), B (REST
// compat) e C (web).
//
// Este arquivo é **escrito pelo coordenador e ninguém o edita durante a fase**:
// mudar uma forma aqui quebra duas branches ao mesmo tempo. Quem precisar de um
// campo novo relata no PR; não acrescenta.
//
// Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9 (D6) e §10, e o
// `CONTRATO-F3.md` deste diretório.

import type { JsonDoDiscord } from "../discord-compat/tipos";

// ── constantes do protocolo ──────────────────────────────────

/**
 * Quanto tempo um token de interação vale. É o número do Discord, e as libs
 * contam com ele: o `deferReply()` do discord.js existe justamente porque a
 * janela de resposta *imediata* é de 3 s e a de followup é esta.
 */
export const VALIDADE_DA_INTERACAO_MS = 15 * 60_000;

/**
 * Quantos bytes de aleatório o token de interação tem.
 *
 * 64 bytes → 86 caracteres em base64url. O §10 do documento diz "64 bytes em
 * base64url", e é isto: 64 bytes **de entropia**, não 64 caracteres. O token
 * viaja no **caminho** da URL (`/webhooks/:app/:token`), então a codificação
 * tem que ser segura para path — base64url é.
 */
export const BYTES_DO_TOKEN_DE_INTERACAO = 64;

/** Tipos de interação do Discord. A F3 só cria o 2. */
export const TIPO_DE_INTERACAO = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

/**
 * Tipos de resposta ao callback.
 *
 * A F3 implementou **4** e **5**. ── onda 3 (cartão 3a) ── **6**, **7**, **8** e
 * **9** passaram a existir; qual vale para qual tipo de interação está em
 * `callbackPermitido` (`componentes.ts`). O `PONG` (1) só existe no modelo de
 * webhook HTTP, que o Streamz não tem: leva 50035.
 */
export const TIPO_DE_CALLBACK = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
} as const;

/** `flags: 64` — a mensagem efêmera. Ver `EFEMERA` no `CONTRATO-F3.md`. */
export const FLAG_EFEMERA = 64;

// ── entrada: o que o web manda ───────────────────────────────

/**
 * Uma opção preenchida por quem digitou o comando.
 *
 * `valor` já vem no tipo do Discord. Para 6 (user), 7 (channel) e 8 (role) o
 * valor é o **cuid** do alvo: quem traduz para snowflake é a montagem do
 * `INTERACTION_CREATE`, porque só ela sabe que o número é para o bot ler.
 */
export interface OpcaoPreenchida {
  nome: string;
  /** 3 string, 4 integer, 5 boolean, 6 user, 7 channel, 8 role, 10 number. */
  tipo: number;
  valor: string | number | boolean;
}

/** O que `criarInteracao` recebe. Tudo em cuid: é a moeda dos services. */
export interface EntradaDeInteracao {
  /** cuid do canal onde o comando foi digitado. */
  canalId: string;
  /** cuid de quem digitou. */
  usuarioId: string;
  /** cuid do `ApplicationCommand` escolhido no autocomplete. */
  commandId: string;
  opcoes: OpcaoPreenchida[];
}

/** O que `criarInteracao` devolve para o controller interno. */
export interface InteracaoEmVoo {
  /** cuid da linha `Interaction`. */
  id: string;
  snowflake: bigint;
  /** o credencial das rotas de callback e followup. Nunca sai para o web. */
  token: string;
  /** nome do comando, para a resposta do `POST` interno. */
  nome: string;
  expiraEm: Date;
  /** cuid da `Application` dona do comando. */
  applicationId: string;
  /** cuid do usuário-bot que vai responder. */
  botUserId: string;
}

// ── o outro lado: o que o bot manda de volta ─────────────────

/**
 * O corpo de uma resposta ou followup, já normalizado.
 *
 * ── onda 3 ── `content`, `embeds`, `components` e `flags` são materializados:
 * o `InteractionsService` os valida com `validarPayloadDeBot` (`@streamz/shared`)
 * e os guarda (`MessageBotPayload` ou as colunas da `EphemeralMessage`). Só
 * `attachments` segue descartado com aviso — não há upload nestas rotas. Ver
 * `docs/CONTRATO-ONDA-3.md`.
 */
export interface CorpoDeResposta {
  content?: string;
  flags?: number;
  embeds?: JsonDoDiscord[];
  components?: JsonDoDiscord[];
  allowed_mentions?: JsonDoDiscord;
  tts?: boolean;
  attachments?: JsonDoDiscord[];
}

/**
 * A interação recuperada pelo token, com tudo que as rotas de compat precisam
 * para agir em nome do bot **sem** um `Authorization` (o token do caminho é o
 * único credencial — ver o `CONTRATO-F3.md`, §3).
 */
export interface InteracaoAutenticada {
  id: string;
  snowflake: bigint;
  applicationId: string;
  applicationSnowflake: bigint;
  botUserId: string;
  canalId: string;
  usuarioId: string;
  guildId: string | null;
  /** cuid da mensagem criada pelo callback 4/5; null enquanto não respondeu. */
  responseMessageId: string | null;
  respondedAt: Date | null;
  expiresAt: Date;
  // ── onda 3 (cartão 3a) ── o que a interação de componente, de autocomplete e
  // de envio de modal acrescentam. `porToken` sempre os preenche; são opcionais
  // só porque os testes das rotas de compat montam este objeto à mão, e
  // ausente vale o mesmo que a F3: comando (`tipo` 2) sem mensagem de origem.
  /** `type` da interação do Discord: 2 comando, 3 componente, 4 autocomplete, 5 envio de modal. */
  tipo?: number;
  /** `custom_id` do componente (3) ou do modal (5). */
  customId?: string | null;
  /** cuid da mensagem de origem (normal) — alvo do callback 7 e do `@original` sem resposta própria. */
  messageId?: string | null;
  /** cuid da mensagem de origem quando ela é efêmera. */
  ephemeralMessageId?: string | null;
  /** o `nonce` do navegador; volta em todo `interaction.*`. */
  nonce?: string | null;
}
