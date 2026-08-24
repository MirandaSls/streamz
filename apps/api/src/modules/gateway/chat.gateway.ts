import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import { WS_EVENTS } from "@newdisc/shared";
import type {
  MessageCreatePayload,
  TypingPayload,
} from "@newdisc/shared";
import { MessagesService } from "../messages/messages.service";

interface SocketUser {
  id: string;
  username: string;
}

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(",") ?? "*", credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly messages: MessagesService,
  ) {}

  /** Autentica pelo token passado no handshake: auth.token ou ?token= */
  async handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; username: string }>(
        token,
        { secret: process.env.JWT_SECRET },
      );
      client.data.user = { id: payload.sub, username: payload.username } satisfies SocketUser;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    // presença simplificada no MVP; hook para broadcast de saída aqui
  }

  @SubscribeMessage(WS_EVENTS.CHANNEL_JOIN)
  onJoin(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    client.join(this.room(channelId));
  }

  @SubscribeMessage(WS_EVENTS.CHANNEL_LEAVE)
  onLeave(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    client.leave(this.room(channelId));
  }

  @SubscribeMessage(WS_EVENTS.MESSAGE_CREATE)
  async onMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: MessageCreatePayload,
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.content?.trim()) return;

    const message = await this.messages.create(
      body.channelId,
      user.id,
      body.content.trim().slice(0, 2000),
    );
    this.server.to(this.room(body.channelId)).emit(WS_EVENTS.MESSAGE_NEW, message);
  }

  @SubscribeMessage(WS_EVENTS.TYPING)
  onTyping(@ConnectedSocket() client: Socket, @MessageBody() body: TypingPayload) {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return;
    client.to(this.room(body.channelId)).emit(WS_EVENTS.TYPING, {
      channelId: body.channelId,
      user,
    });
  }

  private room(channelId: string) {
    return `channel:${channelId}`;
  }
}
