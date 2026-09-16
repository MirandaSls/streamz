// Conta e segurança: perfil, e-mail, senha, 2FA, sessões e preferências.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── e-configuracoes ──────────────────────────────────────────

import { idSchema } from "./internos";

import { z } from "zod";
import type { AuthTokens } from "./auth";
import type { PublicUser } from "./dominio";

/** Quanto um escopo (canal, servidor ou o padrão global) notifica. */
export type NotificationLevel = "ALL" | "MENTIONS" | "NONE";
export const NOTIFICATION_LEVELS: readonly NotificationLevel[] = ["ALL", "MENTIONS", "NONE"];

/**
 * Escopo canônico de uma preferência de notificação.
 *
 * É uma string ("global" | "guild:<id>" | "channel:<id>") e não um par de
 * colunas nuláveis porque no Postgres dois NULLs são distintos: um índice único
 * sobre (userId, guildId, channelId) deixaria passar duplicata do mesmo escopo.
 */
export type NotificationScope = string;
export const GLOBAL_NOTIFICATION_SCOPE = "global";
export function guildNotificationScope(guildId: string): NotificationScope {
  return `guild:${guildId}`;
}
export function channelNotificationScope(channelId: string): NotificationScope {
  return `channel:${channelId}`;
}

/**
 * Preferência de notificação de um escopo. `muted` é independente de `level`
 * (como no Discord): silenciar não apaga a escolha "só menções" por baixo.
 * `mutedUntil` null com `muted` true = silenciado "até eu reativar".
 */
export interface NotificationSetting {
  scope: NotificationScope;
  /** preenchido quando o escopo é um servidor. */
  guildId: string | null;
  /** preenchido quando o escopo é um canal (de servidor ou conversa). */
  channelId: string | null;
  level: NotificationLevel;
  muted: boolean;
  mutedUntil: string | null;
}

/** Durações do "silenciar por…" (minutos). `null` = até eu reativar. */
export const MUTE_PRESETS_MINUTES: readonly number[] = [15, 60, 3 * 60, 8 * 60, 24 * 60];

/** true se o escopo está silenciado no instante `now`. */
export function isMuted(
  setting: Pick<NotificationSetting, "muted" | "mutedUntil"> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!setting?.muted) return false;
  if (!setting.mutedUntil) return true; // até eu reativar
  return new Date(setting.mutedUntil).getTime() > now;
}

/**
 * Nível efetivo de um canal: o mais específico ganha (canal > servidor >
 * padrão global) e qualquer escopo silenciado zera tudo — silenciar o servidor
 * cala os canais dele, como no Discord.
 */
export function effectiveNotificationLevel(
  channel: NotificationSetting | null | undefined,
  guild: NotificationSetting | null | undefined,
  global: NotificationSetting | null | undefined,
  now: number = Date.now(),
): NotificationLevel {
  if (isMuted(channel, now) || isMuted(guild, now)) return "NONE";
  return channel?.level ?? guild?.level ?? global?.level ?? "ALL";
}

/** Decide se uma mensagem que chegou deve virar notificação. */
export function shouldNotifyMessage(
  level: NotificationLevel,
  mention: boolean,
  doNotDisturb = false,
): boolean {
  if (doNotDisturb || level === "NONE") return false;
  return level === "ALL" || mention;
}

/** Corpo do `PATCH /me/notifications`. */
export const notificationSettingSchema = z
  .object({
    guildId: idSchema.nullish(),
    channelId: idSchema.nullish(),
    level: z.enum(["ALL", "MENTIONS", "NONE"]).optional(),
    muted: z.boolean().optional(),
    /** ISO; null limpa a expiração (silêncio "até eu reativar"). */
    mutedUntil: z.string().datetime().nullish(),
  })
  .refine((s) => !(s.guildId && s.channelId), {
    message: "Informe guildId ou channelId, nunca os dois",
  })
  .refine((s) => s.level !== undefined || s.muted !== undefined || s.mutedUntil !== undefined, {
    message: "Nada a alterar",
  });
export type NotificationSettingUpdate = z.infer<typeof notificationSettingSchema>;

/** Sessão ativa do usuário (contrato do agente I: `GET/DELETE /me/sessions`). */
export interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  /** true para a sessão que está fazendo a requisição. */
  current: boolean;
  userAgent?: string;
}

// ── i-conta ──────────────────────────────────────────────────
// Conta e segurança: e-mail, senha, 2FA (TOTP), sessões, exclusão e OAuth.
// Tudo o que a API e a web precisam falar sobre "a minha conta" mora aqui.

/**
 * Regras de senha: só comprimento. Não há medidor de força nem lista de senhas
 * óbvias — a única recusa é a de tamanho, igual na tela e na API.
 */
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

/** Teto do e-mail: o que a RFC 5321 permite no caminho de retorno. */
export const MAX_EMAIL_LENGTH = 254;

/** Mensagem de recusa de uma senha nova, ou `null` quando ela serve. */
export function validarSenhaNova(senha: string): string | null {
  if (senha.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (senha.length > MAX_PASSWORD_LENGTH) {
    return `A senha precisa ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
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

/** Registro: e-mail + usuário + senha. */
export const contaRegistroSchema = z.object({
  email: emailSchema,
  username: usuarioSchema,
  password: senhaNovaSchema,
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
  mfaEnabled: boolean;
  /** quantos códigos de recuperação ainda não foram usados. */
  recoveryCodesLeft: number;
  createdAt: string;
  /** provedores OAuth já vinculados. */
  linkedProviders: OAuthProvider[];
}

/**
 * Uma sessão ativa (refresh token vivo) — contrato de `GET /me/sessions`.
 *
 * Os campos do dispositivo são **opcionais e nunca `null`**: a aba de
 * configurações declara a mesma sessão com `userAgent?: string`, e um `null`
 * aqui deixaria de ser atribuível lá. Ausente = desconhecido (sessão criada
 * antes de a coluna existir, ou requisição sem `User-Agent`).
 *
 * `dispositivo` é a exceção: vem sempre, porque a API sempre consegue chegar a
 * um valor (no pior caso `"desconhecido"`) e a tela precisa dele para escolher
 * o ícone.
 */
export interface SessaoView {
  id: string;
  /** true na sessão que fez a requisição. */
  current: boolean;
  userAgent?: string;
  ip?: string;
  /** como o usuário entrou; ver `classificarDispositivo`. */
  dispositivo: TipoDeDispositivo;
  createdAt: string;
  /** último uso do refresh token (ausente = nunca renovou desde o login). */
  lastUsedAt?: string;
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

// ── i-conta · payloads das rotas de conta e segurança ────────
// A API valida estes schemas na borda (`ZodValidationPipe`) e a web usa os
// mesmos para recusar antes do round-trip. Uma regra, um lugar.

/** Falhas de login seguidas que trancam a conta, e por quanto tempo. */
export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 15;

/** Validade dos links enviados por e-mail. */
export const EMAIL_VERIFY_TTL_HOURS = 24;
export const PASSWORD_RESET_TTL_HOURS = 1;

const tokenDeEmailSchema = z
  .string({ required_error: "obrigatório" })
  .trim()
  .min(16, "Link inválido ou incompleto")
  .max(200);

/** Código do app autenticador **ou** código de recuperação — um campo só. */
const codigoMfaSchema = z
  .string({ required_error: "obrigatório" })
  .trim()
  .min(TOTP_DIGITS, "Informe o código de 6 dígitos")
  .max(32);

const senhaAtualSchema = z
  .string({ required_error: "obrigatório" })
  .min(1, "Informe sua senha atual")
  .max(MAX_PASSWORD_LENGTH);

/** `POST /auth/verify-email` — o token que veio no link. */
export const verificarEmailSchema = z.object({ token: tokenDeEmailSchema });
export type VerificarEmailInput = z.infer<typeof verificarEmailSchema>;

/** `POST /auth/resend-verification` e `POST /auth/forgot-password`. */
export const pedidoPorEmailSchema = z.object({ email: emailSchema });
export type PedidoPorEmailInput = z.infer<typeof pedidoPorEmailSchema>;

/** `POST /auth/reset-password` — token do link + senha nova. */
export const redefinirSenhaSchema = z.object({
  token: tokenDeEmailSchema,
  password: senhaNovaSchema,
});
export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;

/** `POST /auth/mfa` — fecha o login que parou no desafio de 2FA. */
export const mfaLoginSchema = z.object({
  ticket: z.string({ required_error: "obrigatório" }).min(16, "Desafio inválido").max(4096),
  code: codigoMfaSchema,
});
export type MfaLoginInput = z.infer<typeof mfaLoginSchema>;

/** `POST /me/mfa/enable` — confirma que o app autenticador já lê o segredo. */
export const mfaAtivarSchema = z.object({ code: codigoMfaSchema });
export type MfaAtivarInput = z.infer<typeof mfaAtivarSchema>;

/** `POST /me/mfa/disable` — desligar 2FA exige senha **e** código. */
export const mfaDesativarSchema = z.object({
  password: senhaAtualSchema,
  code: codigoMfaSchema,
});
export type MfaDesativarInput = z.infer<typeof mfaDesativarSchema>;

/** `PATCH /me/password`. */
export const alterarSenhaSchema = z
  .object({ currentPassword: senhaAtualSchema, newPassword: senhaNovaSchema })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "A nova senha precisa ser diferente da atual.",
    path: ["newPassword"],
  });
export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>;

/** `PATCH /me/email` — trocar o e-mail pede a senha (evita sequestro de aba). */
export const alterarEmailSchema = z.object({
  email: emailSchema,
  password: senhaAtualSchema,
});
export type AlterarEmailInput = z.infer<typeof alterarEmailSchema>;

/** `DELETE /me` — exclusão pede senha e, com 2FA ligado, o código. */
export const excluirContaSchema = z.object({
  password: senhaAtualSchema,
  code: codigoMfaSchema.optional(),
});
export type ExcluirContaInput = z.infer<typeof excluirContaSchema>;

/** Resposta das rotas que só confirmam que algo foi feito. */
export interface ContaOk {
  ok: true;
}

/** `POST /auth/verify-email`: o e-mail confirmado, para a tela dizer qual foi. */
export interface EmailVerificado {
  email: string;
  /** já estava verificado (o usuário clicou no link duas vezes). */
  alreadyVerified: boolean;
}

/**
 * Estado do envio de e-mail (`GET /me/account` embute; a UI usa para explicar).
 * Sem SMTP a API responde 503 nas rotas que dependem de e-mail — menos em dev,
 * onde o provedor `console` imprime o link no log e o fluxo roda inteiro.
 */
export type ProvedorDeEmail = "smtp" | "console";

/**
 * Cabeçalho com que os **nossos** clientes se apresentam: `desktop/0.0.14`,
 * `celular/1.2.0`. Existe porque o `User-Agent` não resolve — o app de desktop
 * é Tauri 2 com WebView2, e o WebView2 manda o `User-Agent` do Edge, letra por
 * letra igual ao de quem abriu o site no navegador. Sem um sinal explícito do
 * cliente, "app instalado" e "aba do Edge" são a mesma string.
 */
export const HEADER_CLIENTE = "X-Streamz-Client";

/** Como o usuário entrou. É o que escolhe o ícone na aba "Dispositivos". */
export type TipoDeDispositivo = "desktop" | "navegador" | "celular" | "desconhecido";

/** O dispositivo de uma sessão, já legível. */
export interface DispositivoDaSessao {
  tipo: TipoDeDispositivo;
  /** "Streamz para Windows", "Firefox no Windows", "Chrome no Android". */
  rotulo: string;
  /** "Windows", "macOS", "Linux", "Android", "iOS" — `null` se não deu para saber. */
  sistema: string | null;
  /** Nome do navegador; `null` no app de desktop e no que não deu para saber. */
  navegador: string | null;
  /** Versão do app, quando o cliente a mandou no cabeçalho. */
  versaoDoApp: string | null;
}

/** O que se sabe sobre quem fez a requisição (ou sobre a linha guardada). */
export interface EntradaDeDispositivo {
  /** Valor cru do `X-Streamz-Client` da requisição. */
  cliente?: string | null;
  userAgent?: string | null;
  /** `tipo` já gravado na sessão — vence o palpite pelo `User-Agent`. */
  tipoSalvo?: string | null;
}

/**
 * Classifica a sessão em {desktop, navegador, celular} e monta o rótulo.
 *
 * Mora no contrato porque os dois lados precisam: a API classifica na hora do
 * login e do refresh (é a única hora em que o `X-Streamz-Client` existe) e
 * guarda o `tipo`; a tela lê o que foi guardado e monta o rótulo. A ordem das
 * fontes é a ordem da confiança:
 *
 * 1. **o cliente**, que se declarou — só ele distingue WebView2 de Edge;
 * 2. **o tipo salvo** na sessão, escrito por um login/refresh que viu o (1);
 * 3. **o `User-Agent`**, que ainda separa celular de computador e é tudo o que
 *    sessões antigas têm.
 *
 * A ordem dos testes de navegador também importa — Edge e Opera se anunciam
 * como Chrome, e o Chrome se anuncia como Safari. Quem casa primeiro vence.
 */
export function classificarDispositivo(entrada: EntradaDeDispositivo): DispositivoDaSessao {
  const ua = entrada.userAgent ?? "";
  const doCliente = lerCliente(entrada.cliente);
  const sistema = sistemaDe(ua);
  const navegador = navegadorDe(ua);

  const tipo =
    doCliente?.tipo ??
    tipoValido(entrada.tipoSalvo) ??
    tipoPeloUserAgent(ua);

  return {
    tipo,
    rotulo: rotuloDe(tipo, sistema, navegador),
    sistema,
    navegador: tipo === "desktop" ? null : navegador,
    versaoDoApp: doCliente?.versao ?? null,
  };
}

/**
 * `X-Streamz-Client: desktop/0.0.14` → `{ tipo: "desktop", versao: "0.0.14" }`.
 * Cabeçalho ausente, vazio ou com um tipo que não conhecemos devolve `null` —
 * o valor é livre e vem do cliente; nada aqui pode confiar nele às cegas.
 */
function lerCliente(
  cliente: string | null | undefined,
): { tipo: TipoDeDispositivo; versao: string | null } | null {
  if (!cliente) return null;
  const [bruto, versao] = cliente.trim().split("/", 2);
  const tipo = tipoValido(bruto);
  if (!tipo || tipo === "desconhecido") return null;
  return { tipo, versao: versao?.trim() || null };
}

/** O texto vira `TipoDeDispositivo` só se for um dos quatro que existem. */
function tipoValido(valor: string | null | undefined): TipoDeDispositivo | null {
  const limpo = valor?.trim().toLowerCase();
  return limpo === "desktop" || limpo === "navegador" || limpo === "celular" ||
    limpo === "desconhecido"
    ? limpo
    : null;
}

/**
 * Palpite pelo `User-Agent` sozinho: serve para sessões criadas antes de o
 * cliente se identificar e para clientes que não são nossos. `Tauri`/`Electron`
 * aparecem em webview de desktop fora do Windows (o WebKit não esconde),
 * então continuam valendo como desktop.
 */
function tipoPeloUserAgent(ua: string): TipoDeDispositivo {
  if (!ua) return "desconhecido";
  if (/Streamz|Tauri|Electron/i.test(ua)) return "desktop";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return "celular";
  return "navegador";
}

function rotuloDe(
  tipo: TipoDeDispositivo,
  sistema: string | null,
  navegador: string | null,
): string {
  if (tipo === "desktop") return sistema ? `Streamz para ${sistema}` : "Streamz para computador";
  if (tipo === "desconhecido") return "Dispositivo desconhecido";
  if (navegador && sistema) return `${navegador} no ${sistema}`;
  if (navegador) return navegador;
  if (sistema) return `Navegador no ${sistema}`;
  return "Dispositivo desconhecido";
}

function navegadorDe(ua: string): string | null {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return null;
}

function sistemaDe(ua: string): string | null {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}
