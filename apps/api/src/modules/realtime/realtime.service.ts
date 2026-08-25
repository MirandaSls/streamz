import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

/**
 * Ponte fina para emitir eventos WebSocket de fora do gateway (ex.: serviços
 * HTTP como moderação). O gateway registra o `Server` no boot via `bind()`;
 * quem precisar emitir injeta este serviço. Evita a dependência circular que
 * surgiria se um serviço importasse o próprio ChatGateway.
 *
 * Salas: `user:<id>` (todas as conexões de um usuário), `channel:<id>` (quem
 * pode ver o canal) e `guild:<id>` (membros do servidor — eventos de estrutura:
 * canal criado/renomeado/apagado, papel alterado).
 */
@Injectable()
export class RealtimeService {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  /** Emite para todo mundo conectado (presença, perfil). */
  emitAll(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }

  /** Emite para a sala pessoal do usuário (`user:<id>`). */
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  /** Emite para vários usuários de uma vez. */
  emitToUsers(userIds: string[], event: string, payload: unknown) {
    if (!this.server || userIds.length === 0) return;
    this.server.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
  }

  /** Emite para a sala de um canal (`channel:<id>`). */
  emitToChannel(channelId: string, event: string, payload: unknown) {
    this.server?.to(`channel:${channelId}`).emit(event, payload);
  }

  /** Emite para os membros de um servidor (`guild:<id>`). */
  emitToGuild(guildId: string, event: string, payload: unknown) {
    this.server?.to(`guild:${guildId}`).emit(event, payload);
  }

  /**
   * Tira todos os sockets do usuário das salas dos canais informados.
   *
   * Sem isto, perder o acesso (kick, ban, saída da allowlist de canal privado)
   * não interrompia nada: o socket seguia na sala `channel:<id>` e continuava
   * recebendo as mensagens ao vivo até recarregar a página.
   */
  leaveChannelRooms(userId: string, channelIds: string[]) {
    if (!this.server || channelIds.length === 0) return;
    this.server
      .in(`user:${userId}`)
      .socketsLeave(channelIds.map((id) => `channel:${id}`));
  }

  /** Tira todos os sockets do usuário da sala do servidor. */
  leaveGuildRoom(userId: string, guildId: string) {
    this.server?.in(`user:${userId}`).socketsLeave(`guild:${guildId}`);
  }

  /** Põe todos os sockets do usuário na sala do servidor (entrou por convite). */
  joinGuildRoom(userId: string, guildId: string) {
    this.server?.in(`user:${userId}`).socketsJoin(`guild:${guildId}`);
  }

  /**
   * Põe todos os sockets dos usuários na sala do canal. Usado quando um canal
   * nasce ou alguém ganha acesso: quem já está conectado passa a receber
   * `message.new` dele na hora, sem depender do join do connect.
   */
  joinChannelRooms(userIds: string[], channelId: string) {
    if (!this.server || userIds.length === 0) return;
    for (const userId of userIds) {
      this.server.in(`user:${userId}`).socketsJoin(`channel:${channelId}`);
    }
  }

  /** Esvazia a sala de um canal apagado. */
  closeChannelRoom(channelId: string) {
    this.server?.in(`channel:${channelId}`).socketsLeave(`channel:${channelId}`);
  }
}
