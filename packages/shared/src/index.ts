import { z } from "zod";

/**
 * Contratos compartilhados entre a API (NestJS) e o cliente (Next.js).
 * Um único lugar para os tipos de payload e os schemas de validação.
 */

// ── Auth ─────────────────────────────────────────────────────
export const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(6).max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ── Domínio ──────────────────────────────────────────────────
export type UserStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";
/**
 * Tipo do canal. TEXT/VOICE vivem num servidor; DM/GROUP são conversas sem
 * servidor (`guildId` null) cujo acesso é ser participante — ver ADR-0001.
 */
export type ChannelType = "TEXT" | "VOICE" | "DM" | "GROUP";
/** Só os tipos que um usuário cria dentro de um servidor. */
export type GuildChannelType = Extract<ChannelType, "TEXT" | "VOICE">;
export const GUILD_CHANNEL_TYPES: readonly GuildChannelType[] = ["TEXT", "VOICE"];
export type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

export interface PublicUser {
  id: string;
  username: string;
  /** nome de exibição escolhido pelo usuário; null = mostrar o username. */
  displayName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
}

/** Nome a mostrar na tela: displayName, senão username. */
export function displayNameOf(u: Pick<PublicUser, "username" | "displayName">): string {
  return u.displayName?.trim() || u.username;
}

export const MAX_DISPLAY_NAME = 32;
export const MAX_AVATAR_SIZE = 4 * 1024 * 1024; // 4 MB

/** Campos editáveis do próprio perfil (PATCH /users/me). */
export interface ProfileUpdate {
  displayName?: string | null;
}

/** Status escolhido pelo usuário (PATCH /users/me/status). null = automático. */
export interface StatusUpdate {
  manualStatus: UserStatus | null;
}

export interface Guild {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  /** há mensagem nova em algum canal visível (por espectador). */
  unread: boolean;
  /** menções a mim não lidas, somadas nos canais visíveis (por espectador). */
  mentionCount: number;
}

export interface Channel {
  id: string;
  /** null em DM/GROUP: a conversa não pertence a servidor nenhum. */
  guildId: string | null;
  /** null em DM (o título é derivado dos participantes); opcional em GROUP. */
  name: string | null;
  type: ChannelType;
  position: number;
  private: boolean;
  readOnly: boolean;
  /** quando chegou a última mensagem (null = canal vazio). */
  lastMessageAt: string | null;
  /** até onde eu li (null = nunca abri). Por espectador. */
  lastReadAt: string | null;
  /** menções a mim depois de lastReadAt. Por espectador. */
  mentionCount: number;
}

/** Não lido = existe mensagem depois do que eu li (ou nunca li e há mensagem). */
export function isUnread(c: Pick<Channel, "lastMessageAt" | "lastReadAt">): boolean {
  if (!c.lastMessageAt) return false;
  if (!c.lastReadAt) return true;
  return new Date(c.lastMessageAt).getTime() > new Date(c.lastReadAt).getTime();
}

/** true se o texto menciona `@username` (limite de palavra dos dois lados). */
export function mentionsUser(content: string, username: string): boolean {
  const esc = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w.])@${esc}(?![\\w.-])`, "i").test(content);
}

/** Primeira URL http(s) do texto — a que vira embed. */
export function extractFirstUrl(content: string): string | null {
  const m = content.match(/https?:\/\/[^\s<>"')\]]+/i);
  return m ? m[0] : null;
}

/** Prévia de link (Open Graph) que a API monta para a primeira URL da mensagem. */
export interface LinkEmbed {
  url: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
}

/** Servidor com os canais que o usuário pode ver (GET /guilds/:id, POST /guilds). */
export interface GuildWithChannels extends Guild {
  channels: Channel[];
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
}

// ── Anexos ───────────────────────────────────────────────────
/** Teto de tamanho por arquivo (bytes). Espelhado na validação da API. */
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB
/** Máximo de anexos por mensagem. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
/**
 * Validade (segundos) da URL de leitura de um anexo. A API devolve URL assinada
 * do R2 (ou do seu próprio proxy) que expira — não há URL pública permanente.
 * O cliente deve rebuscar a mensagem se a URL vencer.
 */
export const ATTACHMENT_URL_TTL_SECONDS = 60 * 60; // 1 h

export interface Attachment {
  id: string;
  /** URL pronta para <img>/download (bucket público ou proxy da API). */
  url: string;
  filename: string;
  contentType: string;
  size: number;
  /** dimensões da imagem, quando o arquivo é uma imagem reconhecida. */
  width: number | null;
  height: number | null;
}

/** true se o content-type indica uma imagem que renderizamos inline. */
export function isImageAttachment(a: Pick<Attachment, "contentType">): boolean {
  return a.contentType.startsWith("image/");
}

export interface Message {
  id: string;
  channelId: string;
  /** servidor do canal (null em conversa direta) — o rail usa para "não lido". */
  guildId: string | null;
  author: PublicUser;
  content: string;
  createdAt: string;
  editedAt: string | null;
  reactions: ReactionGroup[];
  /** null = mensagem raiz; preenchido = resposta dentro de uma thread. */
  parentId: string | null;
  /** nº de respostas (só relevante em mensagens raiz). */
  replyCount: number;
  /** anexos vinculados (imagens/arquivos). */
  attachments: Attachment[];
  /**
   * Eco do nonce que o cliente mandou no `message.create`. Só aparece no evento
   * `message.new`; nunca é persistido nem volta no histórico REST. Serve para o
   * autor casar a mensagem real com a versão otimista que já está na tela.
   */
  nonce?: string;
}

export interface GuildMemberView {
  user: PublicUser;
  role: MemberRole;
}

export interface InviteInfo {
  code: string;
  guildId: string;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
}

export interface InvitePreview {
  code: string;
  guild: { id: string; name: string; iconUrl: string | null };
  valid: boolean;
  reason?: string;
}

/**
 * Projeção de uma conversa (DM ou GROUP) para quem está olhando: o canal mais os
 * participantes *exceto* o espectador — informação por usuário, que não cabe na
 * tabela. Mensagens, histórico e busca são os de qualquer `Channel`.
 */
export interface DMChannelView extends Channel {
  /** participantes exceto o próprio usuário. */
  others: PublicUser[];
}

/** true para conversa de grupo (3+); false para DM 1-a-1. */
export function isGroupChannel(c: Pick<Channel, "type">): boolean {
  return c.type === "GROUP";
}

/** true para conversa sem servidor (DM ou grupo). */
export function isDirectChannel(c: Pick<Channel, "type">): boolean {
  return c.type === "DM" || c.type === "GROUP";
}

/** Máximo de convidados num grupo de DM, além de quem cria. */
export const MAX_DM_GROUP_INVITEES = 10;

/** Resultado de sair de um grupo de DM. */
export interface DMLeaveResult {
  channelId: string;
  /** true quando o grupo ficou sem ninguém e a conversa foi apagada. */
  deleted: boolean;
}

// ── Eventos do WebSocket (Socket.IO) ─────────────────────────
export const WS_EVENTS = {
  // cliente → servidor
  MESSAGE_CREATE: "message.create",
  MESSAGE_EDIT: "message.edit",
  MESSAGE_DELETE: "message.delete",
  REACTION_ADD: "reaction.add",
  REACTION_REMOVE: "reaction.remove",
  TYPING: "typing",
  CHANNEL_JOIN: "channel.join",
  CHANNEL_LEAVE: "channel.leave",
  // servidor → cliente
  ERROR: "ws.error",
  MESSAGE_NEW: "message.new",
  MESSAGE_UPDATED: "message.updated",
  MESSAGE_DELETED: "message.deleted",
  PRESENCE_UPDATE: "presence.update",
  GUILD_REMOVED: "guild.removed",
  CHANNEL_CREATED: "channel.created",
  CHANNEL_UPDATED: "channel.updated",
  CHANNEL_DELETED: "channel.deleted",
  MEMBER_UPDATED: "member.updated",
  MEMBER_JOINED: "member.joined",
  MEMBER_LEFT: "member.left",
  USER_UPDATED: "user.updated",
  // ── i-conta ──
  /** a minha conta mudou (e-mail verificado, 2FA ligado/desligado). */
  ACCOUNT_UPDATED: "account.updated",
  /** sessões encerradas: as abas atingidas caem para o login na hora. */
  SESSIONS_REVOKED: "sessions.revoked",
} as const;

/** Teto de caracteres de uma mensagem (canal ou DM). */
export const MAX_MESSAGE_LENGTH = 2000;

/** id opaco (cuid) — só precisamos rejeitar vazio e string absurda. */
const idSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .min(1, "id ausente")
  .max(64, "id inválido");

/** Corpo de mensagem: texto dentro do teto. `min` fica a cargo de quem usa. */
const conteudoSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .max(MAX_MESSAGE_LENGTH, `Mensagem acima de ${MAX_MESSAGE_LENGTH} caracteres`);

/** Idem, mas rejeitando mensagem só de espaço. */
const conteudoNaoVazioSchema = conteudoSchema.refine((c) => c.trim().length > 0, {
  message: "Mensagem vazia",
});

export const messageCreateSchema = z
  .object({
    channelId: idSchema,
    content: conteudoSchema,
    /** quando presente, cria a mensagem como resposta na thread desse id. */
    parentId: idSchema.optional(),
    /** ids de anexos já enviados (POST /uploads) a vincular nesta mensagem. */
    attachmentIds: z
      .array(idSchema)
      .max(MAX_ATTACHMENTS_PER_MESSAGE, `Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos`)
      .optional(),
    /**
     * Identificador efêmero gerado pelo cliente. O servidor devolve o mesmo valor
     * em `message.new` para que o autor substitua a mensagem otimista pela real.
     */
    nonce: z.string().max(64).optional(),
  })
  // uma mensagem vazia sem anexo não é mensagem
  .refine((m) => m.content.trim().length > 0 || (m.attachmentIds?.length ?? 0) > 0, {
    message: "Mensagem vazia",
  });
export type MessageCreatePayload = z.infer<typeof messageCreateSchema>;

export const messageEditSchema = z.object({
  messageId: idSchema,
  content: conteudoNaoVazioSchema,
});
export type MessageEditPayload = z.infer<typeof messageEditSchema>;

export const messageDeleteSchema = z.object({ messageId: idSchema });
export type MessageDeletePayload = z.infer<typeof messageDeleteSchema>;

export const reactionSchema = z.object({
  messageId: idSchema,
  // emoji é texto curto vindo do cliente; o teto evita usar a coluna como blob
  emoji: z
    .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
    .min(1, "Emoji ausente")
    .max(64, "Emoji inválido"),
});
export type ReactionPayload = z.infer<typeof reactionSchema>;

export const typingSchema = z.object({ channelId: idSchema });
export type TypingPayload = z.infer<typeof typingSchema>;

/** `channel.join` / `channel.leave` mandam o id do canal cru, sem envelope. */
export const channelIdSchema = idSchema;

export interface MessageDeletedEvent {
  messageId: string;
  channelId: string;
  /** id da mensagem raiz, se a apagada era uma resposta de thread. */
  parentId: string | null;
}

/** Erro de um comando WS, devolvido ao cliente que o enviou. */
export interface WsErrorEvent {
  message: string;
}

/** Resultado da validação de um payload WS. */
export type WsParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * Helper único de validação dos comandos WS (cliente→servidor). Mora aqui, e
 * não na API, para que o contrato e a mensagem de erro sejam os mesmos dos dois
 * lados — e para a API não precisar depender de zod diretamente.
 */
export function parseWsPayload<S extends z.ZodTypeAny>(
  schema: S,
  body: unknown,
): WsParseResult<z.infer<S>> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  const path = issue.path.join(".");
  return { ok: false, message: path ? `${path}: ${issue.message}` : issue.message };
}

export interface PresenceUpdatePayload {
  userId: string;
  status: UserStatus;
}

/** Emitido ao usuário que saiu/perdeu acesso a um servidor. */
export interface GuildRemovedEvent {
  guildId: string;
  reason: "kicked" | "banned" | "left" | "deleted";
}

/** Canal apagado (guildId null = conversa direta). */
export interface ChannelDeletedEvent {
  channelId: string;
  guildId: string | null;
}

/** Papel de um membro mudou. */
export interface MemberUpdatedEvent {
  guildId: string;
  userId: string;
  role: MemberRole;
}

/** Alguém entrou no servidor (convite). */
export interface MemberJoinedEvent {
  guildId: string;
  member: GuildMemberView;
}

/** Alguém saiu do servidor (saiu, foi expulso ou banido). */
export interface MemberLeftEvent {
  guildId: string;
  userId: string;
}

// ── Voz (LiveKit) ────────────────────────────────────────────
export interface VoiceTokenResponse {
  token: string;
  url: string;
  room: string;
}

// ── i-conta ──────────────────────────────────────────────────
// Conta e segurança: e-mail, senha, 2FA (TOTP), sessões, exclusão e OAuth.
// Tudo o que a API e a web precisam falar sobre "a minha conta" mora aqui.

/** Regras de senha. O mínimo subiu de 6 para 8 — vale para senha *nova*. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Idade mínima para criar conta, como no Discord. */
export const MIN_ACCOUNT_AGE_YEARS = 13;

/** Teto do e-mail: o que a RFC 5321 permite no caminho de retorno. */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Força de uma senha, em 0–4.
 *
 * Não é um estimador de entropia: é o que o medidor da tela mostra e o que a
 * API recusa (`pontuacao === 0` = inválida). Fica no contrato para que a barra
 * do cliente e a recusa do servidor nunca discordem.
 */
export interface ForcaDeSenha {
  pontuacao: 0 | 1 | 2 | 3 | 4;
  rotulo: "Muito fraca" | "Fraca" | "Razoável" | "Boa" | "Forte";
  /** o que falta para melhorar; null quando já está no topo. */
  dica: string | null;
}

const ROTULOS_DE_FORCA = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"] as const;

/** Sequências óbvias que qualquer lista de senhas vazadas tem no topo. */
const SENHAS_OBVIAS = [
  "senha",
  "password",
  "123456",
  "12345678",
  "qwerty",
  "abc123",
  "111111",
  "iloveyou",
  "admin",
  "newdisc",
];

export function forcaDeSenha(senha: string): ForcaDeSenha {
  if (senha.length < MIN_PASSWORD_LENGTH) {
    return {
      pontuacao: 0,
      rotulo: "Muito fraca",
      dica: `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }
  const minuscula = senha.toLowerCase();
  if (SENHAS_OBVIAS.some((s) => minuscula.includes(s))) {
    return { pontuacao: 0, rotulo: "Muito fraca", dica: "Evite palavras e sequências comuns." };
  }
  // um caractere só repetido passa no teste de comprimento, mas não é senha
  if (new Set(senha).size <= 3) {
    return { pontuacao: 0, rotulo: "Muito fraca", dica: "Varie os caracteres." };
  }

  let pontos = 0;
  if (senha.length >= 12) pontos += 1;
  if (senha.length >= 16) pontos += 1;
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos += 1;
  if (/\d/.test(senha)) pontos += 1;
  if (/[^A-Za-z0-9]/.test(senha)) pontos += 1;

  const pontuacao = Math.min(4, Math.max(1, pontos)) as 1 | 2 | 3 | 4;
  const dica =
    pontuacao === 4
      ? null
      : senha.length < 12
        ? "Senhas longas (12+) são mais seguras que senhas complicadas."
        : "Misture maiúsculas, números e símbolos.";
  return { pontuacao, rotulo: ROTULOS_DE_FORCA[pontuacao], dica };
}

/** Mensagem de recusa de uma senha nova, ou `null` quando ela serve. */
export function validarSenhaNova(senha: string): string | null {
  if (senha.length > MAX_PASSWORD_LENGTH) {
    return `A senha precisa ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  const forca = forcaDeSenha(senha);
  return forca.pontuacao === 0 ? (forca.dica ?? "Senha fraca demais.") : null;
}

/**
 * Idade completa em anos na data `hoje`, ou `null` se a data não for legível.
 * Aceita `YYYY-MM-DD` (o que o `<input type="date">` manda).
 */
export function idadeEm(nascimento: string, hoje: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nascimento.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  // rejeita 2026-02-31 e afins: o UTC normaliza a data e o dia deixa de bater
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return null;
  }
  if (data.getTime() > hoje.getTime()) return null;

  let idade = hoje.getUTCFullYear() - ano;
  const mesAtual = hoje.getUTCMonth() + 1;
  const diaAtual = hoje.getUTCDate();
  if (mesAtual < mes || (mesAtual === mes && diaAtual < dia)) idade -= 1;
  return idade;
}

/** Mensagem de recusa da data de nascimento, ou `null` quando ela serve. */
export function validarNascimento(nascimento: string, hoje: Date = new Date()): string | null {
  const idade = idadeEm(nascimento, hoje);
  if (idade === null) return "Informe uma data de nascimento válida.";
  if (idade < MIN_ACCOUNT_AGE_YEARS) {
    return `É preciso ter ao menos ${MIN_ACCOUNT_AGE_YEARS} anos para criar uma conta.`;
  }
  if (idade > 120) return "Informe uma data de nascimento válida.";
  return null;
}

/** E-mail normalizado: sem espaços nas pontas e em minúsculas (o índice é único). */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

const emailSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .trim()
  .max(MAX_EMAIL_LENGTH, `E-mail acima de ${MAX_EMAIL_LENGTH} caracteres`)
  .email("E-mail inválido");

const usuarioSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .min(3, "O usuário precisa de ao menos 3 caracteres")
  .max(32, "O usuário precisa de no máximo 32 caracteres")
  .regex(/^[a-zA-Z0-9_.-]+$/, "O usuário aceita apenas letras, números, _ . e -");

const senhaNovaSchema = z
  .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
  .max(MAX_PASSWORD_LENGTH)
  .superRefine((senha, ctx) => {
    const problema = validarSenhaNova(senha);
    if (problema) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problema });
  });

/** Registro: e-mail + usuário + senha (+ nascimento, como no Discord). */
export const contaRegistroSchema = z.object({
  email: emailSchema,
  username: usuarioSchema,
  password: senhaNovaSchema,
  /** `YYYY-MM-DD`. Opcional; quando vem, precisa de ≥ 13 anos. */
  birthDate: z
    .string()
    .refine((d) => validarNascimento(d) === null, {
      message: `É preciso ter ao menos ${MIN_ACCOUNT_AGE_YEARS} anos para criar uma conta.`,
    })
    .optional(),
});
export type ContaRegistroInput = z.infer<typeof contaRegistroSchema>;

/** Login por **e-mail ou usuário** — um campo só, como no Discord. */
export const contaLoginSchema = z.object({
  identificador: z
    .string({ required_error: "obrigatório" })
    .trim()
    .min(3, "Informe seu e-mail ou usuário")
    .max(MAX_EMAIL_LENGTH),
  password: z.string({ required_error: "obrigatório" }).min(1, "Informe sua senha"),
});
export type ContaLoginInput = z.infer<typeof contaLoginSchema>;

/** true quando o texto digitado no login parece um e-mail (e não um usuário). */
export function pareceEmail(identificador: string): boolean {
  return identificador.includes("@");
}

/** Sessão criada: usuário + par de tokens. */
export interface AuthSession {
  user: PublicUser;
  tokens: AuthTokens;
}

/**
 * Desafio de 2FA: o login parou no primeiro fator. O `ticket` é de curta
 * duração e só serve para `POST /auth/mfa` — nunca autentica nada sozinho.
 */
export interface MfaDesafio {
  mfaRequired: true;
  ticket: string;
}

/** `POST /auth/login` devolve a sessão **ou** o desafio de 2FA. */
export type LoginResult = AuthSession | MfaDesafio;

/** Estreita `LoginResult` para o ramo do desafio. */
export function exigeMfa(r: LoginResult): r is MfaDesafio {
  return (r as MfaDesafio).mfaRequired === true;
}

/** A minha conta (`GET /me/account`) — o que só o dono enxerga. */
export interface MinhaConta {
  id: string;
  username: string;
  displayName: string | null;
  /** null em conta antiga, criada antes de o e-mail existir. */
  email: string | null;
  emailVerified: boolean;
  /** `YYYY-MM-DD`, quando informada no registro. */
  birthDate: string | null;
  mfaEnabled: boolean;
  /** quantos códigos de recuperação ainda não foram usados. */
  recoveryCodesLeft: number;
  createdAt: string;
  /** provedores OAuth já vinculados. */
  linkedProviders: OAuthProvider[];
}

/** Uma sessão ativa (refresh token vivo) — contrato de `GET /me/sessions`. */
export interface SessaoView {
  id: string;
  /** true na sessão que fez a requisição. */
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  /** último uso do refresh token (null = nunca renovou desde o login). */
  lastUsedAt: string | null;
  expiresAt: string;
}

/** Quantos códigos de recuperação são gerados ao ativar o 2FA. */
export const RECOVERY_CODE_COUNT = 10;

/** Tamanho (em caracteres, sem o hífen) de um código de recuperação. */
export const RECOVERY_CODE_LENGTH = 10;

/** Passo do TOTP em segundos e nº de dígitos — o padrão que os apps assumem. */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** Início da ativação de 2FA (`POST /me/mfa/setup`). */
export interface MfaSetup {
  /** segredo em base32, para digitar à mão no app autenticador. */
  secret: string;
  /** `otpauth://` — o conteúdo do QR. */
  otpauthUrl: string;
  /** QR pronto para `<img src>` (data URL PNG). */
  qrDataUrl: string;
}

/** Ativação confirmada: os códigos de recuperação só aparecem aqui, uma vez. */
export interface MfaAtivado {
  recoveryCodes: string[];
}

/** true se o texto tem cara de código TOTP (6 dígitos). */
export function pareceCodigoTotp(codigo: string): boolean {
  return new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(codigo.replace(/\s/g, ""));
}

/** Normaliza o que o usuário digita: sem espaços/hífens, em maiúsculas. */
export function normalizarCodigoMfa(codigo: string): string {
  return codigo.replace(/[\s-]/g, "").toUpperCase();
}

export const OAUTH_PROVIDERS = ["google", "github", "discord"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Um provedor social na tela de login: só clicável quando configurado. */
export interface OAuthProviderInfo {
  provider: OAuthProvider;
  label: string;
  /** false = faltam `OAUTH_<PROVIDER>_CLIENT_ID/SECRET` no ambiente. */
  configured: boolean;
  /** para onde mandar o navegador; null quando não configurado. */
  authorizeUrl: string | null;
}

/** Resultado de `POST /me/delete` e `POST /me/disable`. */
export interface ContaEncerrada {
  /** "deleted" = anonimizada e sem volta; "disabled" = volta ao entrar de novo. */
  outcome: "deleted" | "disabled";
}

/** Username que sobra no lugar de quem excluiu a conta. */
export const USUARIO_EXCLUIDO_PREFIXO = "usuario_excluido_";

/** Nome mostrado no lugar de quem excluiu a conta. */
export const NOME_USUARIO_EXCLUIDO = "Usuário excluído";

/** Evento na sala `user:<id>`: algo mudou na conta (e-mail verificado, 2FA…). */
export interface AccountUpdatedEvent {
  account: MinhaConta;
}

/**
 * Evento na sala `user:<id>`: sessões foram encerradas. Quem estiver com um dos
 * `sessionIds` (ou `all`) precisa cair para o login — sem isso a aba continuaria
 * viva até o access token vencer.
 */
export interface SessionsRevokedEvent {
  /** true = todas as outras sessões do usuário. */
  all: boolean;
  sessionIds: string[];
  motivo: "senha" | "logout" | "mfa" | "conta";
}
