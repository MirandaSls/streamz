// Moderação: auditoria, castigo, remoção em lote e denúncias.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── h-moderacao ──────────────────────────────────────────────
// Moderação, registro de auditoria, convites, enquetes, denúncias, onboarding
// e servidores públicos. Tudo o que a api e a web trocam sobre esses assuntos
// mora aqui — inclusive as listas de presets que a UI desenha, para que os dois
// lados nunca discordem sobre o que é "1 semana de castigo" ou "10 usos".

import type { PublicUser } from "./dominio";

/** Teto do motivo escrito por um moderador (castigo, expulsão, banimento). */
export const MAX_MODERATION_REASON = 512;

// ── Registro de auditoria ────────────────────────────────────

/**
 * O que um registro de auditoria descreve. Um valor por ação *moderável*: se
 * uma ação nova precisa aparecer no registro, ela entra aqui, no enum do banco
 * e em `AUDIT_ACTION_LABELS` — os três travados pelo typecheck.
 */
export type AuditAction =
  | "MEMBER_KICK"
  | "MEMBER_BAN"
  | "MEMBER_UNBAN"
  | "MEMBER_TIMEOUT"
  | "MEMBER_TIMEOUT_REMOVE"
  | "MEMBER_ROLE_UPDATE"
  | "CHANNEL_CREATE"
  | "CHANNEL_UPDATE"
  | "CHANNEL_DELETE"
  | "ROLE_CREATE"
  | "ROLE_UPDATE"
  | "ROLE_DELETE"
  | "INVITE_CREATE"
  | "INVITE_REVOKE"
  | "MESSAGE_DELETE"
  | "MESSAGE_BULK_DELETE"
  | "GUILD_UPDATE"
  | "EMOJI_CREATE"
  | "STICKER_CREATE";

/** Que tipo de coisa o `targetId` de um registro aponta. */
export type AuditTargetType =
  | "USER"
  | "CHANNEL"
  | "ROLE"
  | "INVITE"
  | "MESSAGE"
  | "GUILD"
  | "EMOJI"
  | "STICKER";

/** Rótulo em pt-BR de cada ação, para o filtro e a linha do registro. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  MEMBER_KICK: "Membro expulso",
  MEMBER_BAN: "Membro banido",
  MEMBER_UNBAN: "Banimento removido",
  MEMBER_TIMEOUT: "Membro de castigo",
  MEMBER_TIMEOUT_REMOVE: "Castigo removido",
  MEMBER_ROLE_UPDATE: "Cargo alterado",
  CHANNEL_CREATE: "Canal criado",
  CHANNEL_UPDATE: "Canal editado",
  CHANNEL_DELETE: "Canal apagado",
  ROLE_CREATE: "Cargo criado",
  ROLE_UPDATE: "Cargo editado",
  ROLE_DELETE: "Cargo apagado",
  INVITE_CREATE: "Convite criado",
  INVITE_REVOKE: "Convite revogado",
  MESSAGE_DELETE: "Mensagem apagada",
  MESSAGE_BULK_DELETE: "Mensagens apagadas em lote",
  GUILD_UPDATE: "Servidor editado",
  EMOJI_CREATE: "Emoji criado",
  STICKER_CREATE: "Figurinha criada",
};

/** Todas as ações, na ordem em que o filtro as lista. */
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];

/** Um campo que mudou, do jeito que o registro guarda (antes → depois). */
export interface AuditLogChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditLogEntry {
  id: string;
  guildId: string;
  /** quem agiu; null quando a conta já não existe. */
  actor: PublicUser | null;
  action: AuditAction;
  targetId: string | null;
  targetType: AuditTargetType | null;
  /**
   * Nome do alvo *no momento do registro*. Guardado junto porque o alvo pode
   * deixar de existir (canal apagado, convite revogado) e o registro continua
   * precisando dizer sobre o quê ele fala.
   */
  targetName: string | null;
  changes: AuditLogChange[];
  reason: string | null;
  createdAt: string;
}

/** Página do registro; `nextCursor` null = acabou. */
export interface AuditLogPage {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}

export const AUDIT_PAGE_SIZE = 50;

// ── Castigo (timeout) ────────────────────────────────────────

/** Durações que a UI oferece, como no Discord. */
export const TIMEOUT_PRESETS: readonly { label: string; minutes: number }[] = [
  { label: "60 segundos", minutes: 1 },
  { label: "5 minutos", minutes: 5 },
  { label: "10 minutos", minutes: 10 },
  { label: "1 hora", minutes: 60 },
  { label: "1 dia", minutes: 60 * 24 },
  { label: "1 semana", minutes: 60 * 24 * 7 },
];

/** Teto de um castigo (o Discord também para em 28 dias). */
export const MAX_TIMEOUT_MINUTES = 60 * 24 * 28;

/**
 * O castigo está valendo agora? Um `timeoutUntil` no passado é lixo histórico —
 * quem lê nunca deve tratar "tem data" como "está de castigo".
 */
export function isTimedOut(until: string | null | undefined, now: number = Date.now()): boolean {
  if (!until) return false;
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > now;
}

// ── Remoção em lote ──────────────────────────────────────────

/** Máximo de mensagens por chamada de remoção em lote (o Discord usa 100). */
export const MAX_BULK_DELETE = 100;

/** Janelas de limpeza oferecidas no modal de banimento. */
export const PURGE_WINDOWS: readonly { label: string; hours: number }[] = [
  { label: "Não apagar mensagens", hours: 0 },
  { label: "Última hora", hours: 1 },
  { label: "Últimas 24 horas", hours: 24 },
  { label: "Últimos 7 dias", hours: 24 * 7 },
];

/** Várias mensagens sumiram de um canal de uma vez (moderação). */
export interface MessagesBulkDeletedEvent {
  channelId: string;
  messageIds: string[];
}

// ── Mensagens de sistema ─────────────────────────────────────

/**
 * Mensagem que o servidor escreve sozinho. `SYSTEM_JOIN` é o "X entrou no
 * servidor" do canal de sistema; `SYSTEM_MOD_NOTICE` é o aviso que a moderação
 * manda na DM de quem foi expulso ou banido.
 */


// ── Denúncias ────────────────────────────────────────────────

export type ReportReason =
  | "SPAM"
  | "HARASSMENT"
  | "HATE"
  | "VIOLENCE"
  | "NSFW"
  | "SELF_HARM"
  | "OTHER";

export const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam ou propaganda" },
  { value: "HARASSMENT", label: "Assédio ou perseguição" },
  { value: "HATE", label: "Discurso de ódio" },
  { value: "VIOLENCE", label: "Violência ou ameaça" },
  { value: "NSFW", label: "Conteúdo adulto" },
  { value: "SELF_HARM", label: "Automutilação ou suicídio" },
  { value: "OTHER", label: "Outro motivo" },
];

export const MAX_REPORT_DETAILS = 500;

export interface ReportView {
  id: string;
  guildId: string;
  channelId: string;
  channelName: string | null;
  messageId: string | null;
  /** conteúdo da mensagem no momento da denúncia (ela pode sumir depois). */
  messageContent: string | null;
  reporter: PublicUser | null;
  /** autor da mensagem denunciada. */
  target: PublicUser | null;
  reason: ReportReason;
  details: string | null;
  resolved: boolean;
  resolvedBy: PublicUser | null;
  resolvedAt: string | null;
  createdAt: string;
}
