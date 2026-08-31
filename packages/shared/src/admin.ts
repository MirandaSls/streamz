// Administrador da instância (ADR-0008) — outro eixo, não é permissão de servidor.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── j-painel-admin ───────────────────────────────────────────
//
// Painel do administrador **da instância** — não confundir com a moderação de
// servidor (`h-moderacao`), que é por servidor e sai de bitfield de permissão.
// Aqui a pergunta é outra: quem manda na instância inteira enxerga todas as
// contas, todas as chamadas abertas e todas as mensagens sem precisar entrar
// em servidor nenhum. Quem é admin da instância vem do ambiente da API
// (`PLATFORM_ADMIN_EMAILS`), nunca do banco — ver `platform-admin.service.ts`.

import { conteudoNaoVazioSchema } from "./internos";

import { z } from "zod";
import type { VoiceFlags } from "./canais";
import { displayNameOf } from "./dominio";
import type { ChannelType, PublicUser } from "./dominio";
import type { Message } from "./midia";

/** Resposta de `GET /admin/me`: toda conta pode perguntar, só uma responde true. */
export interface AdminMe {
  admin: boolean;
}

/** Quantos itens uma página do painel traz. */
export const ADMIN_PAGE_SIZE = 50;

/** Contadores da aba "Visão geral". */
export interface AdminOverview {
  usuarios: {
    total: number;
    /** presença efetiva ONLINE/IDLE/DND — quem está com o app aberto. */
    online: number;
    desativados: number;
    excluidos: number;
  };
  servidores: number;
  canais: {
    texto: number;
    voz: number;
    /** DM 1-a-1 + grupos. */
    conversas: number;
  };
  mensagens: number;
  chamadasAtivas: number;
  pessoasEmChamada: number;
}

/**
 * **Onde** uma chamada acontece — a resposta de "está no privado com alguém ou
 * num servidor?". É união discriminada, e não um par de campos nuláveis, porque
 * os dois casos não têm os mesmos dados: canal de servidor tem servidor e nome
 * de canal; conversa tem participantes e nome derivado deles (ADR-0001).
 */
export type AdminCallLocation =
  | {
      tipo: "guild";
      channelId: string;
      channelName: string;
      guildId: string;
      guildName: string;
    }
  | {
      tipo: "dm" | "grupo";
      channelId: string;
      /** nome do grupo, ou os participantes separados por vírgula numa DM. */
      nome: string;
      /** todos os participantes da conversa, inclusive quem não está na chamada. */
      participantes: PublicUser[];
    };

/** Uma pessoa dentro de uma chamada aberta, com o estado do microfone e da câmera. */
export interface AdminCallParticipant extends VoiceFlags {
  user: PublicUser;
  /** o socket caiu e a carência está correndo (o mesmo do `voice.state`). */
  reconnecting: boolean;
  /** epoch em ms de quando entrou na sala; null em estado gravado antes do campo. */
  entrouEm: number | null;
}

/** Uma chamada aberta agora — o item da aba "Chamadas". */
export interface AdminCall {
  local: AdminCallLocation;
  participantes: AdminCallParticipant[];
  /** epoch em ms da entrada mais antiga: desde quando a chamada existe. */
  desde: number | null;
}

/** Uma conta na aba "Usuários". */
export interface AdminUserView {
  user: PublicUser;
  /** null em conta sem e-mail (contas antigas) ou já excluída. */
  email: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  /** última desconexão; null em quem nunca se conectou. */
  lastSeenAt: string | null;
  /** conta desativada pelo dono (dá para reativar entrando). */
  disabledAt: string | null;
  /** conta excluída: anonimizada, sem volta. */
  deletedAt: string | null;
  /** em quantos servidores é membro. */
  servidores: number;
  mensagens: number;
  /** true quando o e-mail está em `PLATFORM_ADMIN_EMAILS`. */
  admin: boolean;
  /** onde está falando agora; null quando não está em chamada nenhuma. */
  chamada: AdminCallLocation | null;
}

export interface AdminUsersPage {
  itens: AdminUserView[];
  /** id do último item; ausente quando a página é a última. */
  proximoCursor: string | null;
  /** total de contas que casam com a busca (a lista é paginada). */
  total: number;
}

/** Um canal na aba "Mensagens" — de servidor ou conversa, na mesma lista. */
export interface AdminChannelView {
  id: string;
  type: ChannelType;
  /** nome do canal; em DM 1-a-1 vem derivado dos participantes. */
  nome: string;
  /** null em conversa (ADR-0001: `guildId` nulo é o que define conversa). */
  guildId: string | null;
  guildName: string | null;
  privado: boolean;
  mensagens: number;
  ultimaMensagemEm: string | null;
  /** participantes da conversa; vazio em canal de servidor. */
  participantes: PublicUser[];
}

export interface AdminChannelsPage {
  itens: AdminChannelView[];
  proximoCursor: string | null;
  total: number;
}

/** Uma página do histórico de um canal, lida sem ser membro dele. */
export interface AdminMessagesPage {
  canal: AdminChannelView;
  /** em ordem cronológica, como a timeline. */
  itens: Message[];
  /** id da mensagem mais antiga da página; passe de volta para paginar. */
  proximoCursor: string | null;
}

/** Um servidor na aba "Servidores". */
export interface AdminGuildView {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  owner: PublicUser | null;
  membros: number;
  canais: number;
  mensagens: number;
  createdAt: string;
}

/** Nome de exibição de uma conversa vista de fora (ninguém é "o outro"). */
export function nomeDaConversa(
  tipo: ChannelType,
  nome: string | null,
  participantes: PublicUser[],
): string {
  if (nome) return nome;
  const nomes = participantes.map((p) => displayNameOf(p));
  if (nomes.length === 0) return "Conversa vazia";
  return nomes.join(", ");
}

/**
 * Corpo de `POST /admin/users/:id/message` — a **única** escrita do painel.
 *
 * Só texto: o painel não manda anexo, figurinha, resposta nem thread. Quem
 * precisa disso abre a conversa no app, que é onde essas coisas moram; aqui a
 * pergunta é outra — "falar com esta pessoa agora, sem sair da listagem".
 */
export const adminMensagemSchema = z.object({ content: conteudoNaoVazioSchema });
export type AdminMensagemInput = z.infer<typeof adminMensagemSchema>;

/** Resposta do envio: a conversa usada (nova ou reaproveitada) e a mensagem. */
export interface AdminMensagemEnviada {
  channelId: string;
  mensagem: Message;
}
