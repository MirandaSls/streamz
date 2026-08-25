import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import { WS_EVENTS } from "@newdisc/shared";
import type {
  MessageCreatePayload,
  MessageEditPayload,
  MessageDeletePayload,
  ReactionPayload,
  TypingPayload,
  DMCreatePayload,
} from "@newdisc/shared";
import { MessagesService } from "../messages/messages.service";
import { PrismaService } from "../../prisma/prisma.service";
import { DMsService } from "../dms/dms.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";

interface SocketUser {
  id: string;
  username: string;
}

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(",") ?? "*", credentials: true },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  /** userId → nº de conexões abertas (suporta múltiplas abas/dispositivos). */
  private readonly online = new Map<string, number>();

  constructor(
    private readonly jwt: JwtService,
    private readonly messages: MessagesService,
    private readonly prisma: PrismaService,
    private readonly dms: DMsService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Registra o Server para que serviços HTTP possam emitir eventos WS. */
  afterInit(server: Server) {
    this.realtime.bind(server);
  }

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
      client.join(`user:${payload.sub}`); // sala pessoal para DMs
      await this.markOnline(payload.sub);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    if (user) void this.markOffline(user.id);
  }

  /** Primeira conexão do usuário → ONLINE + broadcast. */
  private async markOnline(userId: string) {
    const next = (this.online.get(userId) ?? 0) + 1;
    this.online.set(userId, next);
    if (next === 1) {
      await this.setStatus(userId, "ONLINE");
    }
  }

  /** Última conexão fechada → OFFLINE + broadcast. */
  private async markOffline(userId: string) {
    const next = (this.online.get(userId) ?? 1) - 1;
    if (next <= 0) {
      this.online.delete(userId);
      await this.setStatus(userId, "OFFLINE");
    } else {
      this.online.set(userId, next);
    }
  }

  private async setStatus(userId: string, status: "ONLINE" | "OFFLINE") {
    await this.prisma.user.update({ where: { id: userId }, data: { status } }).catch(() => {});
    this.server.emit(WS_EVENTS.PRESENCE_UPDATE, { userId, status });
  }

  @SubscribeMessage(WS_EVENTS.CHANNEL_JOIN)
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !channelId) return;
    try {
      // só entra na sala (e recebe mensagens ao vivo) se puder ver o canal
      await this.guilds.assertCanViewChannel(user.id, channelId);
      client.join(this.room(channelId));
    } catch (e) {
      this.emitError(client, e);
    }
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
    if (!user) return;
    const content = body?.content?.trim() ?? "";
    const attachmentIds = body?.attachmentIds ?? [];
    // precisa de texto OU pelo menos um anexo
    if (!content && attachmentIds.length === 0) return;
    // eco do nonce: o autor usa para trocar a mensagem otimista pela real.
    // Não é persistido — só viaja de volta neste evento.
    const nonce =
      typeof body?.nonce === "string" ? body.nonce.slice(0, 64) : undefined;

    try {
      // create() valida a associação do autor ao servidor do canal
      const message = await this.messages.create(
        body.channelId,
        user.id,
        content.slice(0, 2000),
        body.parentId,
        attachmentIds,
      );
      this.server
        .to(this.room(body.channelId))
        .emit(WS_EVENTS.MESSAGE_NEW, nonce ? { ...message, nonce } : message);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.MESSAGE_EDIT)
  async onEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: MessageEditPayload,
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.content?.trim()) return;
    try {
      const message = await this.messages.edit(
        body.messageId,
        user.id,
        body.content.trim().slice(0, 2000),
      );
      this.server.to(this.room(message.channelId)).emit(WS_EVENTS.MESSAGE_UPDATED, message);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.MESSAGE_DELETE)
  async onDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: MessageDeletePayload,
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.messageId) return;
    try {
      const { channelId, parentId } = await this.messages.remove(body.messageId, user.id);
      this.server
        .to(this.room(channelId))
        .emit(WS_EVENTS.MESSAGE_DELETED, { messageId: body.messageId, channelId, parentId });
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.REACTION_ADD)
  async onReactionAdd(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ReactionPayload,
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.messageId || !body?.emoji) return;
    try {
      const message = await this.messages.addReaction(body.messageId, user.id, body.emoji);
      this.server.to(this.room(message.channelId)).emit(WS_EVENTS.MESSAGE_UPDATED, message);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.REACTION_REMOVE)
  async onReactionRemove(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ReactionPayload,
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.messageId || !body?.emoji) return;
    try {
      const message = await this.messages.removeReaction(body.messageId, user.id, body.emoji);
      this.server.to(this.room(message.channelId)).emit(WS_EVENTS.MESSAGE_UPDATED, message);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.DM_CREATE)
  async onDM(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: DMCreatePayload,
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.dmChannelId || !body?.content?.trim()) return;
    try {
      const { message, participants } = await this.dms.createMessage(
        user.id,
        body.dmChannelId,
        body.content.trim().slice(0, 2000),
      );
      for (const uid of participants) {
        this.server.to(`user:${uid}`).emit(WS_EVENTS.DM_NEW, message);
      }
    } catch (e) {
      this.emitError(client, e);
    }
  }

  private emitError(client: Socket, e: unknown) {
    const message = e instanceof Error ? e.message : "Erro";
    client.emit("ws.error", { message });
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
