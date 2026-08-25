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
import {
  WS_EVENTS,
  channelIdSchema,
  dmCreateSchema,
  messageCreateSchema,
  messageDeleteSchema,
  messageEditSchema,
  parseWsPayload,
  reactionSchema,
  typingSchema,
} from "@newdisc/shared";
import type { WsErrorEvent } from "@newdisc/shared";
import {
  newBucket,
  takeToken,
  type BucketLimit,
  type BucketState,
} from "./rate-limit";
import { MessagesService } from "../messages/messages.service";
import { PrismaService } from "../../prisma/prisma.service";
import { DMsService } from "../dms/dms.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CORS_OPTIONS } from "../../common/cors";

interface SocketUser {
  id: string;
  username: string;
}

/**
 * Tetos por socket dos comandos que geram escrita ou broadcast. `capacity` é a
 * rajada tolerada (colar uma sequência rápida de mensagens) e `refillPerSecond`
 * a taxa sustentada. Ver rate-limit.ts: é limite single-process.
 */
const WS_LIMITS: Record<string, BucketLimit> = {
  [WS_EVENTS.MESSAGE_CREATE]: { capacity: 10, refillPerSecond: 1 },
  [WS_EVENTS.DM_CREATE]: { capacity: 10, refillPerSecond: 1 },
  [WS_EVENTS.TYPING]: { capacity: 8, refillPerSecond: 2 },
};

@WebSocketGateway({ cors: CORS_OPTIONS })
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
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    const channelId = this.parse(client, channelIdSchema, body);
    if (!user || channelId === null) return;
    try {
      // só entra na sala (e recebe mensagens ao vivo) se puder ver o canal
      await this.guilds.assertCanViewChannel(user.id, channelId);
      client.join(this.room(channelId));
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.CHANNEL_LEAVE)
  onLeave(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const channelId = this.parse(client, channelIdSchema, body);
    if (channelId === null) return;
    client.leave(this.room(channelId));
  }

  @SubscribeMessage(WS_EVENTS.MESSAGE_CREATE)
  async onMessage(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    if (!this.allow(client, WS_EVENTS.MESSAGE_CREATE)) return;
    const payload = this.parse(client, messageCreateSchema, body);
    if (!user || !payload) return;

    try {
      // create() valida a associação do autor ao servidor do canal
      const message = await this.messages.create(
        payload.channelId,
        user.id,
        payload.content.trim(),
        payload.parentId,
        payload.attachmentIds ?? [],
      );
      this.server.to(this.room(payload.channelId)).emit(WS_EVENTS.MESSAGE_NEW, message);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.MESSAGE_EDIT)
  async onEdit(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    const payload = this.parse(client, messageEditSchema, body);
    if (!user || !payload) return;
    try {
      const message = await this.messages.edit(
        payload.messageId,
        user.id,
        payload.content.trim(),
      );
      this.server.to(this.room(message.channelId)).emit(WS_EVENTS.MESSAGE_UPDATED, message);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.MESSAGE_DELETE)
  async onDelete(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    const payload = this.parse(client, messageDeleteSchema, body);
    if (!user || !payload) return;
    try {
      const { channelId, parentId } = await this.messages.remove(payload.messageId, user.id);
      this.server.to(this.room(channelId)).emit(WS_EVENTS.MESSAGE_DELETED, {
        messageId: payload.messageId,
        channelId,
        parentId,
      });
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.REACTION_ADD)
  async onReactionAdd(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    const payload = this.parse(client, reactionSchema, body);
    if (!user || !payload) return;
    try {
      const message = await this.messages.addReaction(
        payload.messageId,
        user.id,
        payload.emoji,
      );
      this.server.to(this.room(message.channelId)).emit(WS_EVENTS.MESSAGE_UPDATED, message);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.REACTION_REMOVE)
  async onReactionRemove(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    const payload = this.parse(client, reactionSchema, body);
    if (!user || !payload) return;
    try {
      const message = await this.messages.removeReaction(
        payload.messageId,
        user.id,
        payload.emoji,
      );
      this.server.to(this.room(message.channelId)).emit(WS_EVENTS.MESSAGE_UPDATED, message);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.DM_CREATE)
  async onDM(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    if (!this.allow(client, WS_EVENTS.DM_CREATE)) return;
    const payload = this.parse(client, dmCreateSchema, body);
    if (!user || !payload) return;
    try {
      const { message, participants } = await this.dms.createMessage(
        user.id,
        payload.dmChannelId,
        payload.content.trim(),
      );
      for (const uid of participants) {
        this.server.to(`user:${uid}`).emit(WS_EVENTS.DM_NEW, message);
      }
    } catch (e) {
      this.emitError(client, e);
    }
  }

  private userOf(client: Socket): SocketUser | undefined {
    return client.data.user as SocketUser | undefined;
  }

  /**
   * Consome um token do balde daquele comando. Os baldes ficam no próprio
   * socket, então somem junto com a conexão — não há mapa global a limpar.
   */
  private allow(client: Socket, event: keyof typeof WS_LIMITS): boolean {
    const limit = WS_LIMITS[event];
    const buckets = (client.data.buckets ??= {} as Record<string, BucketState>);
    const now = Date.now();
    const state = (buckets[event] ??= newBucket(limit, now));
    if (takeToken(state, limit, now)) return true;
    client.emit(WS_EVENTS.ERROR, {
      message: "Devagar: muitos comandos seguidos",
    } satisfies WsErrorEvent);
    return false;
  }

  /**
   * Valida o payload de um comando WS. Devolve `null` e avisa o cliente por
   * `ws.error` quando não bate — nada de truncar ou ignorar em silêncio, que
   * fazia o cliente achar que a mensagem tinha ido inteira.
   */
  private parse<S extends Parameters<typeof parseWsPayload>[0]>(
    client: Socket,
    schema: S,
    body: unknown,
  ) {
    const result = parseWsPayload(schema, body);
    if (result.ok) return result.data;
    client.emit(WS_EVENTS.ERROR, { message: result.message } satisfies WsErrorEvent);
    return null;
  }

  private emitError(client: Socket, e: unknown) {
    const message = e instanceof Error ? e.message : "Erro";
    client.emit(WS_EVENTS.ERROR, { message });
  }

  @SubscribeMessage(WS_EVENTS.TYPING)
  onTyping(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    if (!this.allow(client, WS_EVENTS.TYPING)) return;
    const payload = this.parse(client, typingSchema, body);
    if (!user || !payload) return;

    // Autorização sem ida ao banco: só está na sala `channel:<id>` quem passou
    // por assertCanViewChannel no channel.join — e kick/ban/remoção da
    // allowlist tiram o socket da sala (RealtimeService). "typing" é evento de
    // alta frequência; um assert por tecla não se paga.
    const room = this.room(payload.channelId);
    if (!client.rooms.has(room)) return;

    client.to(room).emit(WS_EVENTS.TYPING, { channelId: payload.channelId, user });
  }

  private room(channelId: string) {
    return `channel:${channelId}`;
  }
}
