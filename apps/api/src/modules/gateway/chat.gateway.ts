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
import { HttpException, Logger, type OnModuleInit } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import {
  WS_EVENTS,
  channelIdSchema,
  messageCreateSchema,
  messageDeleteSchema,
  messageEditSchema,
  parseWsPayload,
  reactionSchema,
  typingSchema,
} from "@newdisc/shared";
import type { UserStatus, WsErrorEvent } from "@newdisc/shared";
import {
  newBucket,
  takeToken,
  type BucketLimit,
  type BucketState,
} from "./rate-limit";
import { MemoryPresenceStore, RedisPresenceStore, type PresenceStore } from "./presence.store";
import { MessagesService } from "../messages/messages.service";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { redisClient, redisSubscriber } from "../realtime/redis";
import { CORS_OPTIONS } from "../../common/cors";

interface SocketUser {
  id: string;
  username: string;
}

/**
 * Tetos por socket dos comandos que geram escrita ou broadcast. `capacity` é a
 * rajada tolerada (colar uma sequência rápida de mensagens) e `refillPerSecond`
 * a taxa sustentada. O balde vive no socket — e um socket vive numa instância
 * só —, então este limite é correto mesmo com várias instâncias.
 */
const WS_LIMITS: Record<string, BucketLimit> = {
  [WS_EVENTS.MESSAGE_CREATE]: { capacity: 10, refillPerSecond: 1 },
  [WS_EVENTS.TYPING]: { capacity: 8, refillPerSecond: 2 },
};

@WebSocketGateway({ cors: CORS_OPTIONS })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /** Conexões por usuário: em memória ou no Redis (várias instâncias). */
  private readonly presence: PresenceStore = (() => {
    const redis = redisClient();
    return redis ? new RedisPresenceStore(redis) : new MemoryPresenceStore();
  })();

  constructor(
    private readonly jwt: JwtService,
    private readonly messages: MessagesService,
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Presença não sobrevive a uma queda: se a API cair, quem estava ONLINE
   * ficaria ONLINE no banco até reconectar. No boot, sem nenhuma conexão viva
   * registrada (nenhuma outra instância), zera todo mundo para OFFLINE.
   */
  async onModuleInit() {
    if (await this.presence.isEmpty()) {
      const r = await this.prisma.user.updateMany({
        where: { status: { not: "OFFLINE" } },
        data: { status: "OFFLINE" },
      });
      if (r.count > 0) {
        this.logger.log(`Presença zerada no boot: ${r.count} usuário(s) → OFFLINE`);
      }
    }
  }

  /** Registra o Server (e o adapter Redis, se houver) para os serviços HTTP emitirem. */
  afterInit(server: Server) {
    const pub = redisClient();
    if (pub) {
      const sub = redisSubscriber()!;
      server.adapter(createAdapter(pub, sub));
      this.logger.log("Socket.IO com adapter Redis (várias instâncias)");
    }
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
      // sala pessoal: eventos de usuário (guild.removed) e alvo de socketsJoin/Leave
      client.join(`user:${payload.sub}`);
      // Entra já no connect em tudo que pode ver: os canais de todos os seus
      // servidores (para "não lido" e notificação de canal fechado), as
      // conversas diretas e a sala de cada servidor (eventos de estrutura).
      // O CHANNEL_JOIN do cliente vira idempotente.
      const [canais, guilds] = await Promise.all([
        this.guilds.visibleChannelsForUser(payload.sub),
        this.prisma.guildMember.findMany({
          where: { userId: payload.sub },
          select: { guildId: true },
        }),
      ]);
      client.join(canais.map((c) => this.room(c.id)));
      client.join(guilds.map((g) => `guild:${g.guildId}`));
      await this.markOnline(payload.sub);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    if (user) void this.markOffline(user.id);
  }

  /** Primeira conexão do usuário → status escolhido (ou ONLINE) + broadcast. */
  private async markOnline(userId: string) {
    const total = await this.presence.connect(userId);
    if (total === 1) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { manualStatus: true },
      });
      await this.setStatus(userId, u?.manualStatus ?? "ONLINE");
    }
  }

  /** Última conexão fechada → OFFLINE + broadcast. */
  private async markOffline(userId: string) {
    const total = await this.presence.disconnect(userId);
    if (total === 0) await this.setStatus(userId, "OFFLINE");
  }

  private async setStatus(userId: string, status: UserStatus) {
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
        { replyToId: payload.replyToId, replyMention: payload.replyMention },
      );
      // eco do nonce: o autor usa para trocar a mensagem otimista pela real.
      // Não é persistido — só viaja de volta neste evento.
      this.server
        .to(this.room(payload.channelId))
        .emit(WS_EVENTS.MESSAGE_NEW, payload.nonce ? { ...message, nonce: payload.nonce } : message);
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

  /**
   * Só a mensagem de uma `HttpException` (que os services escrevem para o
   * usuário: "Canal privado", "Mensagem não encontrada") volta ao cliente.
   * Qualquer outra coisa — erro do Prisma, TypeError — descreveria a entranha
   * do servidor para quem está do outro lado do socket, então vira "Erro
   * interno" e o detalhe fica no log.
   */
  private emitError(client: Socket, e: unknown) {
    if (e instanceof HttpException) {
      const body = e.getResponse();
      const detail =
        typeof body === "string"
          ? body
          : ((body as { message?: string | string[] })?.message ?? e.message);
      const message = Array.isArray(detail) ? detail.join("; ") : String(detail);
      client.emit(WS_EVENTS.ERROR, { message } satisfies WsErrorEvent);
      return;
    }
    this.logger.error(
      `Falha em comando WS (socket ${client.id})`,
      e instanceof Error ? e.stack : String(e),
    );
    client.emit(WS_EVENTS.ERROR, { message: "Erro interno" } satisfies WsErrorEvent);
  }

  @SubscribeMessage(WS_EVENTS.TYPING)
  onTyping(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    if (!this.allow(client, WS_EVENTS.TYPING)) return;
    const payload = this.parse(client, typingSchema, body);
    if (!user || !payload) return;

    // Autorização sem ida ao banco: só está na sala `channel:<id>` quem passou
    // por assertCanViewChannel (no connect ou no channel.join) — e kick/ban/
    // remoção da allowlist tiram o socket da sala (RealtimeService). "typing"
    // é evento de alta frequência; um assert por tecla não se paga.
    const room = this.room(payload.channelId);
    if (!client.rooms.has(room)) return;

    client.to(room).emit(WS_EVENTS.TYPING, { channelId: payload.channelId, user });
  }

  private room(channelId: string) {
    return `channel:${channelId}`;
  }
}
