import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

/**
 * Ponte fina para emitir eventos WebSocket de fora do gateway (ex.: serviços
 * HTTP como moderação). O gateway registra o `Server` no boot via `bind()`;
 * quem precisar emitir injeta este serviço. Evita a dependência circular que
 * surgiria se um serviço importasse o próprio ChatGateway.
 */
@Injectable()
export class RealtimeService {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  /** Emite para a sala pessoal do usuário (`user:<id>`). */
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  /** Emite para a sala de um canal (`channel:<id>`). */
  emitToChannel(channelId: string, event: string, payload: unknown) {
    this.server?.to(`channel:${channelId}`).emit(event, payload);
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

  /**
   * Põe todos os sockets dos usuários na sala do canal. Usado quando uma
   * conversa direta nasce: quem já está conectado passa a receber `message.new`
   * dela na hora, sem depender do join que o gateway faz só no connect.
   */
  joinChannelRooms(userIds: string[], channelId: string) {
    if (!this.server || userIds.length === 0) return;
    for (const userId of userIds) {
      this.server.in(`user:${userId}`).socketsJoin(`channel:${channelId}`);
    }
  }
}
