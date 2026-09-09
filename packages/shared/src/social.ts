// Amigos, status, perfil, presença e grupos de conversa direta.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── d-social ────────────────────────────────────────────────
// Amizades, bloqueio, status personalizado, perfil rico e o que é específico
// de grupo de DM. Tudo o que a API e o cliente trocam sobre "gente" (e não
// sobre "canal") mora nesta seção.

// ── Amigos ───────────────────────────────────────────────────

import { z } from "zod";
import type { MemberRole, PublicUser } from "./dominio";
import { replySnippet } from "./mensagens";
import type { MessageType } from "./mensagens";
import type { Attachment, Message } from "./midia";

/** Estado de uma amizade. `PENDING` = pedido enviado e ainda não respondido. */
export type FriendshipStatus = "PENDING" | "ACCEPTED";

/**
 * Um pedido de amizade na visão de quem lista: o outro lado já resolvido em
 * `user`, mais quem pediu — a UI precisa saber se o pedido é recebido (aceitar
 * / recusar) ou enviado (cancelar).
 */
export interface FriendRequest {
  id: string;
  requesterId: string;
  addresseeId: string;
  user: PublicUser;
  createdAt: string;
}

/** As listas da página Amigos numa chamada só (`GET /friends`). */
export interface FriendLists {
  friends: PublicUser[];
  /** pedidos que me mandaram (aceitar/recusar). */
  incoming: FriendRequest[];
  /** pedidos que eu mandei (cancelar). */
  outgoing: FriendRequest[];
  /** quem eu bloqueei. */
  blocked: PublicUser[];
}

/**
 * Minha relação com outro usuário — o que decide as ações do popover e do
 * modal de perfil. "Ele me bloqueou" não é revelado ao cliente: a API responde
 * `none` para não vazar o bloqueio, como o Discord.
 */
export type RelationshipKind = "self" | "none" | "friend" | "incoming" | "outgoing" | "blocked";

/** Pedido de amizade por nome de usuário (é assim que o Discord adiciona). */
export const friendRequestSchema = z.object({
  username: z
    .string({ required_error: "obrigatório", invalid_type_error: "deve ser texto" })
    .trim()
    .min(3, "Nome de usuário muito curto")
    .max(32, "Nome de usuário muito longo"),
});
export type FriendRequestInput = z.infer<typeof friendRequestSchema>;

/**
 * Evento: um pedido de amizade nasceu.
 *
 * Vai para as salas `user:<id>` dos **dois** lados, e `direcao` diz de quem é a
 * visão de quem recebe: `incoming` para quem foi pedido (a aba "Pendentes"
 * ganha uma linha e um toast), `outgoing` para as outras conexões de quem
 * pediu — sem isso, mandar o pedido no desktop deixava o site sem a linha em
 * "Enviados" até recarregar. `request.user` é sempre **o outro lado**.
 */
export interface FriendRequestEvent {
  request: FriendRequest;
  direcao: "incoming" | "outgoing";
}

/** Evento: um pedido virou amizade (chega aos dois lados). */
export interface FriendAcceptedEvent {
  user: PublicUser;
}

/**
 * Evento: a relação acabou — recusa, cancelamento, remoção de amigo ou
 * bloqueio. `userId` é o outro lado, na visão de quem recebe o evento.
 */
export interface FriendRemovedEvent {
  userId: string;
}

/**
 * Evento: eu bloqueei/desbloqueei alguém (só as minhas conexões recebem).
 *
 * `user` vem junto para o cliente aplicar o delta sem uma volta ao
 * `GET /friends`: bloquear tira das listas de amigos/pedidos e põe em
 * "Bloqueados", desbloquear só tira de lá.
 */
export interface UserBlockedEvent {
  userId: string;
  blocked: boolean;
  user: PublicUser;
}

// ── Status personalizado ─────────────────────────────────────

export const MAX_CUSTOM_STATUS = 128;

/** Prazos que o Discord oferece para o status personalizado expirar. */
export type CustomStatusDuration = "never" | "1h" | "4h" | "today" | "week";

export const CUSTOM_STATUS_DURATIONS: { value: CustomStatusDuration; label: string }[] = [
  { value: "never", label: "Não limpar" },
  { value: "1h", label: "1 hora" },
  { value: "4h", label: "4 horas" },
  { value: "today", label: "Hoje" },
  { value: "week", label: "Esta semana" },
];

export const customStatusSchema = z.object({
  text: z
    .string()
    .trim()
    .max(MAX_CUSTOM_STATUS, `Status acima de ${MAX_CUSTOM_STATUS} caracteres`)
    .nullable(),
  /** o emoji é conteúdo do usuário; o teto só evita usar a coluna como blob. */
  emoji: z.string().max(64, "Emoji inválido").nullable(),
  duration: z.enum(["never", "1h", "4h", "today", "week"]),
});
export type CustomStatusUpdate = z.infer<typeof customStatusSchema>;

/**
 * Quando o status personalizado deixa de valer. Fica no contrato (e não na API)
 * porque a tela mostra o mesmo prazo que o servidor vai gravar — e porque é
 * lógica pura, testável dos dois lados. "Hoje" = meia-noite seguinte; "esta
 * semana" = meia-noite do próximo domingo.
 */
export function customStatusExpiry(duration: CustomStatusDuration, agora: Date): Date | null {
  switch (duration) {
    case "never":
      return null;
    case "1h":
      return new Date(agora.getTime() + 60 * 60 * 1000);
    case "4h":
      return new Date(agora.getTime() + 4 * 60 * 60 * 1000);
    case "today": {
      const d = new Date(agora);
      d.setHours(24, 0, 0, 0);
      return d;
    }
    case "week": {
      const d = new Date(agora);
      // 0 = domingo; sempre avança ao menos um dia para não expirar na hora
      const faltam = 7 - d.getDay() || 7;
      d.setDate(d.getDate() + faltam);
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
}

/** Texto do status personalizado com o emoji, ou null quando não há status. */
export function customStatusOf(
  u: Pick<PublicUser, "customStatusText" | "customStatusEmoji">,
): string | null {
  const partes = [u.customStatusEmoji, u.customStatusText].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  return partes.length > 0 ? partes.join(" ") : null;
}

// ── Perfil rico ──────────────────────────────────────────────

export const MAX_ABOUT_ME = 190;
export const MAX_PRONOUNS = 40;
/** Teto do banner do perfil (bytes) — mesma ordem de grandeza do avatar. */
export const MAX_BANNER_SIZE = 6 * 1024 * 1024;

/** `#rrggbb`. Hex de 3 dígitos é recusado para o valor gravado ser sempre igual. */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Perfil completo de um usuário (`GET /users/:id/profile`), na visão de quem
 * pede: os "em comum" e a `relationship` mudam por espectador, por isso não
 * cabem no `PublicUser`.
 */
export interface UserProfile {
  user: PublicUser;
  aboutMe: string | null;
  pronouns: string | null;
  bannerColor: string | null;
  bannerUrl: string | null;
  /** "Membro desde" — quando a conta foi criada. */
  createdAt: string;
  /** última desconexão; null = nunca esteve online ou está online agora. */
  lastSeenAt: string | null;
  relationship: RelationshipKind;
  mutualFriends: PublicUser[];
  mutualGuilds: { id: string; name: string; iconUrl: string | null }[];
  /**
   * Papel no servidor passado em `?guildId=` (null fora desse contexto). Os
   * cargos coloridos entram aqui quando o agente C entregar `Permission`.
   */
  guildRole: MemberRole | null;
}

// ── Presença rica ────────────────────────────────────────────

/**
 * Silêncio na aba que faz o cliente se declarar ausente (Discord: 10 min). É o
 * cliente quem detecta — o servidor só recebe o `PATCH /users/me/status`.
 */
export const IDLE_APOS_MS = 10 * 60 * 1000;

// ── Grupos de DM ─────────────────────────────────────────────

export const MAX_DM_GROUP_NAME = 64;
/** Teto do ícone do grupo (bytes). */
export const MAX_GROUP_ICON_SIZE = 4 * 1024 * 1024;

export const dmGroupUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_DM_GROUP_NAME, `Nome acima de ${MAX_DM_GROUP_NAME} caracteres`)
    .nullable(),
});
export type DMGroupUpdate = z.infer<typeof dmGroupUpdateSchema>;

/** Linha de uma mensagem de sistema, montada a partir do tipo e do conteúdo. */
export function systemMessageText(m: Pick<Message, "type" | "content">, autor: string): string {
  switch (m.type) {
    case "SYSTEM_PIN":
      return `${autor} fixou uma mensagem neste canal.`;
    case "SYSTEM_JOIN":
      return `${autor} entrou no servidor.`;
    case "SYSTEM_MOD_NOTICE":
      // o texto do aviso da moderação já vem pronto no conteúdo
      return m.content;
    case "SYSTEM_MEMBER_ADDED":
      return `${autor} adicionou ${m.content} ao grupo.`;
    case "SYSTEM_MEMBER_REMOVED":
      return `${autor} removeu ${m.content} do grupo.`;
    case "SYSTEM_MEMBER_LEFT":
      return `${autor} saiu do grupo.`;
    case "SYSTEM_GROUP_RENAMED":
      return m.content
        ? `${autor} mudou o nome do grupo para ${m.content}.`
        : `${autor} removeu o nome do grupo.`;
    case "SYSTEM_GROUP_ICON":
      return `${autor} mudou o ícone do grupo.`;
    default:
      return m.content;
  }
}

// ── Prévia da última mensagem na lista de conversas ──────────
//
// A coluna "Mensagens" do Discord mostra, embaixo do nome da conversa, o que
// foi dito por último ("graggle: Can someone explain #4?"). Medido em
// `docs/Reference/mobile/discord-mobile-dms-2024.png` (1,9707 px/pt): nome de
// ~16pt em cima, prévia de ~14pt embaixo, 4,5pt entre as duas, e a mesma cor
// nas duas linhas — o que muda com o "não lido" é a cor da linha inteira
// (#878997 lida → #FDFDFD não lida) e o peso do nome.
//
// Mora aqui, no contrato, porque a API preenche o campo e o cliente refaz a
// prévia quando chega `message.new`/`message.updated`: se as duas pontas não
// aparassem igual, a linha piscaria com outro texto a cada mensagem.

/** Comprimento do trecho que a linha da conversa mostra (cabe numa linha só). */
export const MAX_PREVIA_DM = 80;

/** A última mensagem de uma conversa, do jeito que a lista de conversas mostra. */
export interface PreviaDeMensagem {
  /**
   * Id da mensagem. É ele que diz se um `message.updated`/`message.deleted`
   * acertou *esta* prévia ou uma mensagem antiga que não está na linha.
   */
  id: string;
  /** quem escreveu — o nome sai de `others` (ou é "Você"), nunca do servidor. */
  authorId: string;
  /** já achatado, sem marcação e cortado em `MAX_PREVIA_DM`. */
  content: string;
  createdAt: string;
  /**
   * `DEFAULT` vira "autor: texto"; as `SYSTEM_*` viram a narração inteira
   * (`systemMessageText`), sem o prefixo do autor — é o que o Discord faz com
   * "Fulano adicionou Beltrano ao grupo".
   */
  tipo: MessageType;
}

/**
 * Tira a marcação do Discord e achata em uma linha só.
 *
 * Não é o parser de `markdown-core` ao contrário: a prévia não precisa saber
 * onde cada trecho começa, só entregar o texto que o usuário digitou. Bloco de
 * código vira espaço (não cabe), spoiler é revelado (a linha é curta demais
 * para o gesto de revelar) e a menção a cargo vira `@cargo`, porque o id cru
 * (`<@&ckx…>`) não diz nada a ninguém.
 */
function semMarcacao(texto: string): string {
  return texto
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<:([a-z0-9_]{2,32}):[A-Za-z0-9_-]{1,64}>/g, ":$1:")
    .replace(/<@&[A-Za-z0-9_-]{1,64}>/g, "@cargo")
    .replace(/^[ \t]{0,3}(?:>\s?|#{1,3}[ \t]+)/gm, "")
    .replace(/(?<!\\)(\*\*|__|~~|\|\||\*|_)/g, "")
    .replace(/\\([*_~`|>#\\])/g, "$1");
}

/** Uma mensagem vista pela prévia — o mínimo que a API e o cliente têm em mãos. */
export interface MensagemParaPrevia {
  content: string;
  type: MessageType;
  attachments?: readonly Pick<Attachment, "contentType">[] | null;
  /** figurinha no lugar do texto (g-emojis-midia). */
  temFigurinha?: boolean;
}

/**
 * O texto de uma mensagem na lista de conversas. Vazio só quando não há nada
 * que valha uma linha (mensagem em branco sem anexo).
 */
export function textoDaPrevia(m: MensagemParaPrevia, limite = MAX_PREVIA_DM): string {
  const texto = replySnippet(semMarcacao(m.content), limite);
  if (texto) return texto;
  if (m.temFigurinha) return "Enviou uma figurinha";
  const anexo = m.attachments?.[0];
  if (!anexo) return "";
  return anexo.contentType.toLowerCase() === "image/gif" ? "Enviou um GIF" : "Enviou um anexo";
}

/** A prévia de uma mensagem inteira (o caminho do cliente, no `message.new`). */
export function previaDaMensagem(
  m: Pick<Message, "id" | "author" | "content" | "createdAt" | "type" | "attachments" | "sticker">,
): PreviaDeMensagem {
  return {
    id: m.id,
    authorId: m.author.id,
    content: textoDaPrevia({
      content: m.content,
      type: m.type,
      attachments: m.attachments,
      temFigurinha: !!m.sticker,
    }),
    createdAt: m.createdAt,
    tipo: m.type,
  };
}

/**
 * A linha que a lista desenha embaixo do nome da conversa.
 *
 * `emChamada` ganha de tudo: enquanto o telefone toca ou a chamada corre, a
 * linha é "Chamada de voz" — a chamada não deixa mensagem no histórico, então
 * é o único lugar onde ela pode aparecer.
 */
export function linhaDaPrevia(
  previa: PreviaDeMensagem | null | undefined,
  opcoes: { autor: string; emChamada?: boolean },
): string {
  if (opcoes.emChamada) return "Chamada de voz";
  if (!previa) return "";
  if (previa.tipo !== "DEFAULT") {
    return systemMessageText({ type: previa.tipo, content: previa.content }, opcoes.autor);
  }
  return previa.content ? `${opcoes.autor}: ${previa.content}` : "";
}
