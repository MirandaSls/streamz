// Enquetes, convites, onboarding, descoberta e download do app.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── Enquetes ─────────────────────────────────────────────────

import { z } from "zod";
import type { PublicUser } from "./dominio";
import type { InviteInfo, InvitePreview } from "./midia";

export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 10;
export const MAX_POLL_QUESTION = 300;
export const MAX_POLL_OPTION = 55;

/** Durações de enquete oferecidas na UI. */
export const POLL_DURATIONS: readonly { label: string; hours: number }[] = [
  { label: "1 hora", hours: 1 },
  { label: "4 horas", hours: 4 },
  { label: "8 horas", hours: 8 },
  { label: "1 dia", hours: 24 },
  { label: "3 dias", hours: 24 * 3 },
  { label: "1 semana", hours: 24 * 7 },
  { label: "2 semanas", hours: 24 * 14 },
];

export interface PollOption {
  /** posição da opção na enquete; é ela que o voto referencia. */
  index: number;
  text: string;
  votes: number;
  /** o espectador votou nesta opção. */
  me: boolean;
}

export interface Poll {
  /** a enquete é uma face da mensagem — o id dela é a chave. */
  messageId: string;
  question: string;
  options: PollOption[];
  /** aceita marcar mais de uma opção. */
  multi: boolean;
  expiresAt: string | null;
  /** encerrada à mão pelo autor ou pela moderação. */
  closedAt: string | null;
  /** votos somados (com `multi`, uma pessoa pode contar mais de uma vez). */
  totalVotes: number;
}

/** Não aceita mais voto: encerrada à mão ou vencida. */
export function isPollClosed(
  poll: Pick<Poll, "expiresAt" | "closedAt">,
  now: number = Date.now(),
): boolean {
  if (poll.closedAt) return true;
  if (!poll.expiresAt) return false;
  const t = new Date(poll.expiresAt).getTime();
  return Number.isFinite(t) && t <= now;
}

/**
 * Porcentagem inteira de uma opção. Arredonda para baixo de propósito: a soma
 * nunca passa de 100%, que é o que estragaria as barras.
 */
export function pollPercent(votes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((votes / total) * 100);
}

/** Contagem da enquete mudou (voto, desvoto ou encerramento). */
export interface PollUpdatedEvent {
  channelId: string;
  poll: Poll;
}

/** Quem votou em cada opção (só moderação enxerga). */
export interface PollVoters {
  messageId: string;
  /** por índice de opção, os usuários que a marcaram. */
  byOption: { index: number; users: PublicUser[] }[];
}

// ── Convites ─────────────────────────────────────────────────

/** Expirações oferecidas na UI; `minutes: 0` = nunca expira. */
export const INVITE_EXPIRY_OPTIONS: readonly { label: string; minutes: number }[] = [
  { label: "30 minutos", minutes: 30 },
  { label: "1 hora", minutes: 60 },
  { label: "6 horas", minutes: 360 },
  { label: "12 horas", minutes: 720 },
  { label: "1 dia", minutes: 1440 },
  { label: "7 dias", minutes: 10080 },
  { label: "Nunca", minutes: 0 },
];

/** Limites de uso oferecidos na UI; `uses: 0` = sem limite. */
export const INVITE_USES_OPTIONS: readonly { label: string; uses: number }[] = [
  { label: "1 uso", uses: 1 },
  { label: "5 usos", uses: 5 },
  { label: "10 usos", uses: 10 },
  { label: "25 usos", uses: 25 },
  { label: "50 usos", uses: 50 },
  { label: "100 usos", uses: 100 },
  { label: "Sem limite", uses: 0 },
];

/** Opções de criação de convite (0 = "sem limite"/"nunca", como na UI). */
export interface InviteOptions {
  expiresInMinutes?: number;
  maxUses?: number;
  /** convidado só continua no servidor enquanto estiver conectado. */
  temporary?: boolean;
  /** canal para onde o convite leva; null = canal de sistema ou o primeiro. */
  channelId?: string | null;
}

/** Convite na lista de moderação: o `InviteInfo` mais o contexto. */
export interface InviteDetail extends InviteInfo {
  creator: PublicUser | null;
  temporary: boolean;
  channelId: string | null;
  channelName: string | null;
  createdAt: string;
}

/** Prévia pública, com o que a página `/invite/:code` mostra antes do login. */
export interface InviteFullPreview extends InvitePreview {
  memberCount: number;
  onlineCount: number;
  description: string | null;
  channelName: string | null;
  inviter: PublicUser | null;
  /** já sou membro deste servidor (só vale para quem está logado). */
  member: boolean;
}

// ── Onboarding, regras e boas-vindas ─────────────────────────

export const MAX_WELCOME_DESCRIPTION = 300;
export const MAX_WELCOME_CHANNELS = 5;

/** Configuração do servidor que governa entrada, regras e descoberta. */
export interface GuildOnboarding {
  /** canal onde entram as mensagens "X entrou no servidor"; null = desligado. */
  systemChannelId: string | null;
  /** canal de regras; quando existe, postar exige aceite. */
  rulesChannelId: string | null;
  welcomeDescription: string | null;
  /** canais em destaque na tela de boas-vindas, na ordem escolhida. */
  welcomeChannelIds: string[];
  /** aparece em "Descobrir". */
  discoverable: boolean;
  description: string | null;
}

export type GuildOnboardingUpdate = Partial<GuildOnboarding>;

/** O que o cliente precisa saber sobre *mim* neste servidor. */
export interface GuildMembership {
  guildId: string;
  onboarding: GuildOnboarding;
  /** canais em destaque já resolvidos (id + nome), na ordem escolhida. */
  welcomeChannels: { id: string; name: string | null }[];
  acceptedRulesAt: string | null;
  timeoutUntil: string | null;
  /** o servidor tem canal de regras e eu ainda não aceitei. */
  mustAcceptRules: boolean;
  /** nunca vi a tela de boas-vindas deste servidor (e há o que mostrar). */
  showWelcome: boolean;
}

/**
 * Mudou algo que altera o que eu vejo ao entrar neste servidor.
 *
 * Duas origens, um tratador só ("releia a sua associação neste servidor"):
 * a configuração de onboarding/descoberta mudou para todo mundo (vai para
 * `guild:<id>`, com `onboarding`), ou o **meu** estado de membro mudou —
 * aceitei as regras, vi as boas-vindas — e o aviso vai só para as minhas
 * conexões (`user:<id>`, sem `onboarding`, porque nada mudou no servidor).
 */
export interface GuildSettingsUpdatedEvent {
  guildId: string;
  onboarding?: GuildOnboarding;
}

// ── Descobrir servidores ─────────────────────────────────────

export interface DiscoverableGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  memberCount: number;
  onlineCount: number;
  /** já sou membro — o card mostra "Abrir" em vez de "Entrar". */
  joined: boolean;
}

// ── Download do app ──────────────────────────────────────────

/**
 * Plataformas do instalador.
 *
 * O cliente escolhe uma destas strings e a API resolve **ela** para um arquivo.
 * O caminho nunca vem do cliente: um `?arquivo=` seria travessia de diretório
 * disfarçada de parâmetro, e a lista fechada elimina a categoria inteira de
 * ataque em vez de tentar filtrá-la.
 */
export const DOWNLOAD_PLATAFORMAS = ["windows", "macos", "linux"] as const;
export type DownloadPlataforma = (typeof DOWNLOAD_PLATAFORMAS)[number];

/**
 * Validade do token que autoriza UM download.
 *
 * Curto de propósito: o token viaja na URL, porque o browser não manda
 * `Authorization` numa navegação de download — e URL vaza em histórico, em
 * `Referer` e em log de proxy. Ele vale o tempo de *começar* a baixar; uma
 * transferência já iniciada não é interrompida quando ele expira.
 */
export const DOWNLOAD_TOKEN_TTL_SECONDS = 120;

/** Corpo de `POST /downloads/token`: a senha única e a plataforma escolhida. */
export const downloadTokenSchema = z.object({
  senha: z.string().min(1, "Informe a senha").max(200),
  plataforma: z.enum(DOWNLOAD_PLATAFORMAS),
});
export type DownloadTokenInput = z.infer<typeof downloadTokenSchema>;

/**
 * O que a página pode saber **antes** da senha: para quais sistemas existe
 * instalador e o peso de cada um, para o seletor não oferecer uma opção que vai
 * falhar. Sem o nome do arquivo — ele carrega o número da versão, e a build
 * ainda é privada; o nome vem junto do token, para quem acertou a senha.
 */
export interface DownloadDisponivel {
  plataforma: DownloadPlataforma;
  /** bytes */
  tamanho: number;
  /** ISO 8601 — data de modificação do arquivo no servidor */
  atualizadoEm: string;
}

export interface DownloadCatalogo {
  /** false = sem `DOWNLOAD_PASSWORD`; a página explica em vez de pedir senha. */
  configurado: boolean;
  disponiveis: DownloadDisponivel[];
}

/** Senha aceita: a URL que baixa o arquivo, com o token curto já embutido. */
export interface DownloadAutorizado {
  url: string;
  filename: string;
  tamanho: number;
  /** epoch em ms; a página avisa quando o link esfriou antes do clique. */
  expiraEm: number;
}

/** Rótulo de plataforma para a UI (o seletor e as mensagens de erro). */
export function rotuloPlataforma(plataforma: DownloadPlataforma): string {
  return { windows: "Windows", macos: "macOS", linux: "Linux" }[plataforma];
}
