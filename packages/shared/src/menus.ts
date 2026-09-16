// Menus de clique direito idênticos ao Discord: o que eles pedem de dado.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.
//
// Contrato inteiro (rotas, eventos, quem implementa) em
// `docs/CONTRATO-MENUS.md`. Os campos novos que moram em tipos já existentes
// estão nos arquivos deles, marcados com `── menus de contexto ──`:
// `DMChannelView.fixadaEm` e `GuildMemberView.nickname` (midia.ts),
// `FriendLists.apelidos/ignored` e `UserProfile.nota/apelidoDeAmigo/ignorado`
// (social.ts), `GuildMembership.nickname/permitirDmsDoServidor`
// (comunidade.ts), `MemberUpdatedEvent.nickname` e os `WS_EVENTS` novos
// (eventos.ts), `ComandoDeApp.tipo` e `interacaoCriarSchema.targetId`
// (aplicativos.ts).

import { z } from "zod";
import type { PublicUser } from "./dominio";
import { idSchema } from "./internos";

// ── 1. Fixar conversa de DM ──────────────────────────────────

/**
 * Resposta de `PUT`/`DELETE /dms/:id/pin` e payload de `dm.pinUpdated`.
 * `fixadaEm: null` = desafixada.
 */
export interface ConversaFixadaEvent {
  channelId: string;
  fixadaEm: string | null;
}

/**
 * A ordem da lista de Mensagens diretas — a mesma nas duas pontas, para a
 * lista não pular quando chega `dm.pinUpdated` ou `message.new`.
 *
 * 1. Fixadas primeiro, **na ordem em que foram fixadas** (`fixadaEm`
 *    crescente): fixar uma conversa nova a põe no fim do bloco das fixadas,
 *    que é o que o Discord faz.
 * 2. Depois as outras, pela última atividade (`lastMessageAt`, ou `criadaEm`
 *    quando a conversa ainda não tem mensagem), mais recente primeiro.
 *
 * `criadaEm` é opcional porque o DTO não carrega a data de criação do canal;
 * a API passa a sua, a web pode omitir (conversa sem mensagem vai para o fim
 * do bloco dela).
 */
export function compararConversas(
  a: { id: string; lastMessageAt: string | null; fixadaEm?: string | null },
  b: { id: string; lastMessageAt: string | null; fixadaEm?: string | null },
  criadaEm?: (id: string) => string | undefined,
): number {
  const fa = a.fixadaEm ?? null;
  const fb = b.fixadaEm ?? null;
  if (fa && fb) return fa.localeCompare(fb);
  if (fa) return -1;
  if (fb) return 1;
  const atividade = (c: typeof a) => c.lastMessageAt ?? criadaEm?.(c.id) ?? "";
  return atividade(b).localeCompare(atividade(a));
}

// ── 2. Nota de usuário ───────────────────────────────────────

/** Teto da nota privada (Discord: 256). */
export const MAX_NOTA_DE_USUARIO = 256;

/**
 * `PUT /users/:id/note`. Texto aparado; **vazio apaga** a nota (a API remove a
 * linha e responde `nota: null`).
 */
export const notaDeUsuarioSchema = z.object({
  nota: z
    .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
    .trim()
    .max(MAX_NOTA_DE_USUARIO, `Nota acima de ${MAX_NOTA_DE_USUARIO} caracteres`),
});
export type NotaDeUsuarioInput = z.infer<typeof notaDeUsuarioSchema>;

/**
 * Resposta de `GET`/`PUT /users/:id/note` e payload de `user.noteUpdated`.
 * `nota: null` = sem nota.
 */
export interface NotaDeUsuario {
  userId: string;
  nota: string | null;
}

/** `GET /users/me/notes`: todas as minhas notas, por id do alvo. Só as não vazias. */
export type NotasDeUsuario = Record<string, string>;

// ── 3. Apelido de amigo ──────────────────────────────────────

/** Teto do apelido de amigo (Discord: 32). */
export const MAX_APELIDO_DE_AMIGO = 32;

/**
 * `PUT /friends/:userId/nickname`. Aparado e não vazio — para apagar, use
 * `DELETE /friends/:userId/nickname`.
 */
export const apelidoDeAmigoSchema = z.object({
  apelido: z
    .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
    .trim()
    .min(1, "Apelido vazio")
    .max(MAX_APELIDO_DE_AMIGO, `Apelido acima de ${MAX_APELIDO_DE_AMIGO} caracteres`),
});
export type ApelidoDeAmigoInput = z.infer<typeof apelidoDeAmigoSchema>;

/**
 * Resposta de `PUT`/`DELETE /friends/:userId/nickname` e payload de
 * `friend.nicknameUpdated`. `apelido: null` = removido.
 */
export interface ApelidoDeAmigoEvent {
  userId: string;
  apelido: string | null;
}

/**
 * O nome a mostrar para um usuário na **minha** tela, na precedência do
 * Discord: apelido de amigo > apelido no servidor > nome de exibição >
 * nome de usuário.
 *
 * `apelidoNoServidor` só entra em contexto de servidor (lista de membros,
 * mensagem de canal de servidor); em DM passe `undefined`.
 */
export function nomeParaMim(
  u: Pick<PublicUser, "username" | "displayName">,
  opcoes: { apelidoDeAmigo?: string | null; apelidoNoServidor?: string | null } = {},
): string {
  return (
    opcoes.apelidoDeAmigo?.trim() ||
    opcoes.apelidoNoServidor?.trim() ||
    u.displayName?.trim() ||
    u.username
  );
}

// ── 4. Ignorar usuário ───────────────────────────────────────

/** `POST /friends/ignores`. */
export const ignorarUsuarioSchema = z.object({ userId: idSchema });
export type IgnorarUsuarioInput = z.infer<typeof ignorarUsuarioSchema>;

/**
 * Payload de `user.ignored` (só as minhas conexões). `user` vem junto para a
 * lista de ignorados aplicar o delta sem voltar ao `GET /friends`.
 */
export interface UsuarioIgnoradoEvent {
  userId: string;
  ignorado: boolean;
  user: PublicUser;
}

/** Texto do marcador que substitui a mensagem de quem eu ignorei. */
export const TEXTO_MENSAGEM_IGNORADA = "Mensagem ignorada";

// ── 5 e 6. Apelido e privacidade por servidor ────────────────

/** Teto do apelido no servidor (Discord: 32). */
export const MAX_APELIDO_NO_SERVIDOR = 32;

/**
 * `PATCH /guilds/:guildId/membership` — o que **eu** edito sobre mim neste
 * servidor. Só o que vier é escrito. `nickname: null` (ou texto só de espaço)
 * apaga o apelido.
 */
export const minhaAssociacaoEditarSchema = z
  .object({
    nickname: z
      .string({ invalid_type_error: "deve ser texto" })
      .trim()
      .max(MAX_APELIDO_NO_SERVIDOR, `Apelido acima de ${MAX_APELIDO_NO_SERVIDOR} caracteres`)
      .nullable(),
    permitirDmsDoServidor: z.boolean({ invalid_type_error: "deve ser verdadeiro ou falso" }),
  })
  .partial()
  .refine((o) => o.nickname !== undefined || o.permitirDmsDoServidor !== undefined, {
    message: "Nada para editar",
  });
export type MinhaAssociacaoEditarInput = z.infer<typeof minhaAssociacaoEditarSchema>;

/** Apelido como a API grava: aparado, vazio vira null. */
export function normalizarApelido(apelido: string | null | undefined): string | null {
  const t = apelido?.trim() ?? "";
  return t.length > 0 ? t : null;
}

/**
 * Quem não é amigo pode abrir DM comigo?
 *
 * Regra (Discord, "Permitir mensagens diretas de membros do servidor"):
 * - amigo sempre pode;
 * - sem servidor em comum, nada muda em relação ao que já valia (pode);
 * - com servidor em comum, pode se **algum** deles tem a opção ligada do meu
 *   lado (`permitirDmsDoServidor` da **minha** associação).
 *
 * Quem aplica é a API (`POST /dms`, 403 com `ERRO_DM_NAO_PERMITIDA`); a web
 * não conhece a preferência do outro lado e só mostra o erro. Função pura aqui
 * para ser testável sem banco.
 */
export function aceitaDmDeMembro(opcoes: {
  amigos: boolean;
  /** `permitirDmsDoServidor` do destinatário em cada servidor em comum. */
  permissoesNosServidoresEmComum: readonly boolean[];
}): boolean {
  if (opcoes.amigos) return true;
  if (opcoes.permissoesNosServidoresEmComum.length === 0) return true;
  return opcoes.permissoesNosServidoresEmComum.some(Boolean);
}

/** Mensagem do 403 de `POST /dms` quando `aceitaDmDeMembro` é falso. */
export const ERRO_DM_NAO_PERMITIDA =
  "Esta pessoa não aceita mensagens diretas de membros dos servidores em comum.";

// ── 7. Comandos de app de contexto ───────────────────────────

/** O `type` de um comando de aplicativo, com os números do Discord. */
export const TIPO_DE_COMANDO_DE_APP = {
  /** comando de barra — o composer. */
  CHAT_INPUT: 1,
  /** "Apps >" no menu de um usuário. */
  USER: 2,
  /** "Apps >" no menu de uma mensagem. */
  MESSAGE: 3,
} as const;
export type TipoDeComandoDeApp = (typeof TIPO_DE_COMANDO_DE_APP)[keyof typeof TIPO_DE_COMANDO_DE_APP];

/** `true` para os comandos que aparecem em "Apps >" e não no composer. */
export function ehComandoDeContexto(c: { tipo?: TipoDeComandoDeApp }): boolean {
  return c.tipo === TIPO_DE_COMANDO_DE_APP.USER || c.tipo === TIPO_DE_COMANDO_DE_APP.MESSAGE;
}

/**
 * Nome de comando de contexto: o Discord aceita maiúsculas e espaço
 * ("Traduzir mensagem"), 1–32 caracteres. O de barra continua com a regra
 * antiga (minúsculo, sem espaço) no `corpos-f3.ts` da compat.
 */
export const NOME_DE_COMANDO_DE_CONTEXTO = /^[^\n\r\t]{1,32}$/u;
