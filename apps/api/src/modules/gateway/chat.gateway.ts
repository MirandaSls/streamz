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
  pollCloseSchema,
  pollCreateSchema,
  pollOptionEmojisSchema,
  pollVoteSchema,
  reactionSchema,
  suppressEmbedsSchema,
  typingSchema,
  // ── f-voz ──
  callSchema,
  voiceJoinSchema,
  voiceUpdateSchema,
  VOICE_RECONNECT_GRACE_MS,
} from "@streamz/shared";
import type { PollAck, UserStatus, WsErrorEvent } from "@streamz/shared";
import {
  newBucket,
  takeToken,
  type BucketLimit,
  type BucketState,
} from "./rate-limit";
import { avisoDeVersao, politicaDoAmbiente } from "./politica-versao-cliente";
import { conexoesAExpulsar } from "./voz-em-um-lugar-so";
import { saidaFoiIntencional } from "./saida-de-voz";
import { anunciarReacao } from "../messages/eventos-de-reacao";
import { MessagesService } from "../messages/messages.service";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { PollsService } from "../polls/polls.service";
import { RealtimeService } from "../realtime/realtime.service";
import { AccountStatusService } from "../auth/account-status.service";
import { PresenceService } from "../realtime/presence.service";
import { redisClient, redisSubscriber } from "../realtime/redis";
import { CORS_OPTIONS } from "../../common/cors";
import { VoiceService } from "../voice/voice.service";
import { CallsService } from "../voice/calls.service";

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
  // f-voz: o cliente já coalesce o voice.update (máximo um a cada 300 ms), então 5/s
  // sustentados nunca descartam o estado final de quem alterna mudo/desmudo em rajada.
  // Com o teto anterior, o excesso era descartado e o ícone ficava preso no estado antigo.
  [WS_EVENTS.VOICE_UPDATE]: { capacity: 20, refillPerSecond: 5 },
  [WS_EVENTS.VOICE_JOIN]: { capacity: 5, refillPerSecond: 1 },
  // h-moderacao: enquete nasce como mensagem — mesmo teto do envio
  [WS_EVENTS.POLL_CREATE]: { capacity: 5, refillPerSecond: 0.5 },
  [WS_EVENTS.POLL_VOTE]: { capacity: 10, refillPerSecond: 2 },
};

/** Resposta de ack quando o balde do comando esvaziou. */
const AVISO_DE_RAJADA = { ok: false, error: "Devagar: muitos comandos seguidos" } as const;

/**
 * Intervalo mínimo entre dois `warn` de rajada do mesmo socket. Quem estoura o
 * balde costuma estourar várias vezes seguidas (é o que é uma rajada); uma
 * linha a cada 10 s já diz quem e em que comando, sem enterrar o resto do log.
 */
const INTERVALO_DO_AVISO_DE_RAJADA_MS = 10_000;

/**
 * Texto vindo do cliente pronto para ir ao log: só ASCII imprimível e sem aspas,
 * cortado em `max`. Handshake é controlado por quem conecta — sem o filtro, uma
 * quebra de linha no user-agent forjaria uma linha de log inteira. Vazio →
 * `undefined`, para o chamador escolher o texto padrão.
 */
function textoDeLog(valor: unknown, max: number): string | undefined {
  if (typeof valor !== "string") return undefined;
  const limpo = valor.replace(/[^\x20-\x7E]/g, "").replace(/"/g, "'").trim().slice(0, max);
  return limpo || undefined;
}

/**
 * Heartbeat folgado de propósito.
 *
 * Os padrões do Socket.IO (25s/20s) derrubam a conexão depois de ~45s sem
 * pong, e o Chromium estrangula os timers de uma aba em segundo plano para
 * ~1/min — minimizar a janela por um minuto bastava para cair da chamada.
 * Quem compartilha a tela e vai usar outro aplicativo é exatamente esse caso.
 *
 * Os dois valores viajam no handshake, então valem para os dois lados: subir
 * aqui conserta o cliente junto. O preço é demorar mais para perceber uma
 * conexão de fato morta — o que a carência da voz e a presença absorvem.
 */
@WebSocketGateway({
  cors: CORS_OPTIONS,
  pingInterval: 25_000,
  pingTimeout: 120_000,
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /**
   * Saídas de voz que a carência agendou, por `userId:channelId`.
   *
   * Vive em memória, como o próprio estado de voz (`voice-state.store.ts`):
   * com `REDIS_URL` vazio há uma instância só e isso basta. **Com várias
   * instâncias isto precisa de store compartilhado** — o socket pode cair numa
   * e voltar em outra, e a carência agendada aqui não seria cancelada lá,
   * derrubando da chamada quem reconectou. É a mesma ressalva do balde de rate
   * limit do WS, logo acima.
   */
  private readonly saidasDeVozPendentes = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly messages: MessagesService,
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
    private readonly voice: VoiceService,
    private readonly calls: CallsService,
    // h-moderacao: enquete é escrita de mensagem, logo passa pelo gateway
    private readonly polls: PollsService,
    private readonly contas: AccountStatusService,
    // presença compartilhada com o gateway compat dos bots (ver PresenceService)
    private readonly presence: PresenceService,
  ) {}

  /** Presença não sobrevive a uma queda: ver `PresenceService.zerarNoBoot`. */
  async onModuleInit() {
    await this.presence.zerarNoBoot();
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
    // Toda recusa de connect vai ao log com o motivo: antes o catch desconectava
    // calado, e um usuário com erro recorrente não deixava linha nenhuma na API.
    if (!token) {
      this.logger.warn(`ws: connect recusado socket=${client.id} motivo=token-ausente`);
      client.disconnect(true);
      return;
    }
    let payload: { sub: string; username: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; username: string }>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch (e) {
      // Token expirado é rotina (o cliente renova o access token a cada 15 min
      // e reconecta): em `warn` inundaria o log. Assinatura ruim ou token
      // malformado não é rotina — esse fica visível.
      if (e instanceof Error && e.name === "TokenExpiredError") {
        this.logger.debug(`ws: connect recusado socket=${client.id} motivo=token-expirado`);
      } else {
        this.logger.warn(
          `ws: connect recusado socket=${client.id} motivo=token-invalido erro=${this.msgDeErro(e)}`,
        );
      }
      client.disconnect(true);
      return;
    }
    try {
      // conta desativada/excluída não conecta, mesmo com access token válido:
      // sem isto o socket sobreviveria os 15 min de validade do token
      const estado = await this.contas.estado(payload.sub);
      if (!estado.existe || estado.excluida || estado.desativada) {
        const motivo = !estado.existe
          ? "conta-inexistente"
          : estado.excluida
            ? "conta-excluida"
            : "conta-desativada";
        this.logger.warn(
          `ws: connect recusado user=${payload.sub} socket=${client.id} motivo=${motivo}`,
        );
        client.disconnect(true);
        return;
      }
      client.data.user = { id: payload.sub, username: payload.username } satisfies SocketUser;
      // Com que cliente cada conexão chega. `auth.cliente` é o que a web manda
      // ("desktop/1.3.16"); sem ele é o navegador. O user-agent vai junto porque
      // é o que distingue o app desktop no Windows — o WebView2 se apresenta como
      // Edge ("Edg/126…") — e foi exatamente esse dado que revelou o problema do
      // usuário que tinha erros recorrentes sem nenhuma linha no log.
      const cliente = textoDeLog(client.handshake.auth?.cliente, 40) ?? "navegador";
      const ua = textoDeLog(client.handshake.headers["user-agent"], 160) ?? "";
      this.logger.log(
        `ws: connect user=${payload.sub} socket=${client.id} cliente=${cliente} ua="${ua}"`,
      );
      // Versão do app desktop: a web empacotada não se atualiza sozinha, então a
      // instância pode avisar (`WARN_CLIENT_VERSION`) ou barrar
      // (`MIN_CLIENT_VERSION`). Vem ANTES de qualquer `join` e do `markOnline`:
      // quem é barrado não pode receber mensagem nem aparecer online.
      const defasagem = avisoDeVersao(client.handshake.auth?.cliente, politicaDoAmbiente());
      if (defasagem) {
        client.emit(WS_EVENTS.CLIENT_OUTDATED, defasagem);
        if (defasagem.nivel === "bloqueado") {
          this.logger.warn(
            `ws: connect recusado user=${payload.sub} socket=${client.id} motivo=cliente-desatualizado cliente=${cliente} minima=${defasagem.versaoMinima}`,
          );
          // Sem `data.user`, o `handleDisconnect` sai cedo: este socket nunca foi
          // marcado online e não pode derrubar a presença de outra aba do usuário.
          client.data.user = undefined;
          // Adiado de propósito: `disconnect(true)` fecha o transporte na hora e
          // o evento recém-emitido pode ainda estar no buffer de escrita. 250 ms
          // é folgado para o flush e curto o bastante para não importar.
          setTimeout(() => client.disconnect(true), 250);
          return;
        }
      }
      // O motivo da desconexão só existe no evento `disconnecting`, que o
      // Socket.IO dispara **antes** do `disconnect` — e é o `disconnect` que
      // chama o nosso `handleDisconnect`. Guardar aqui é o que permite lá
      // distinguir "fechei o app" de "a rede caiu" (ver `saida-de-voz.ts`).
      client.on("disconnecting", (motivo: string) => {
        client.data.motivoDaDesconexao = motivo;
      });
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
    } catch (e) {
      // banco ou Redis fora do ar no meio do connect: não é recusa, é defeito
      this.logger.error(
        `ws: connect falhou user=${payload.sub} socket=${client.id} motivo=falha-inesperada`,
        e instanceof Error ? e.stack : String(e),
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    // sem usuário o connect foi recusado, e a recusa já tem a sua linha
    if (!user) return;
    void this.markOffline(user.id);
    // Toda desconexão vai ao log, não só as de voz: junto com o `ws: connect`
    // é o que reconstrói a sessão de um usuário (quantas quedas, com que
    // motivo) quando ele reclama de erro recorrente. Uma linha por queda é
    // barato perto de não ter nada para investigar. A linha `voz: disconnect`
    // continua à parte porque já é usada em grep e traz o canal.
    const motivo = client.data.motivoDaDesconexao as string | undefined;
    this.logger.log(
      `ws: disconnect user=${user.id} socket=${client.id} motivo=${motivo ?? "desconhecido"}`,
    );
    const channelId = client.data.voiceChannelId as string | undefined;
    if (channelId) {
      this.logger.log(
        `voz: disconnect user=${user.id} canal=${channelId} socket=${client.id} motivo=${motivo ?? "desconhecido"}`,
      );
    }
    // f-voz: queda de socket não é sair da chamada — a saída fica agendada e
    // pode ser cancelada por uma reconexão (ver `agendarSaidaDaVoz`)
    void this.agendarSaidaDaVoz(client, user);
  }

  /** Primeira conexão do usuário → online + broadcast (ver `PresenceService`). */
  private markOnline(userId: string) {
    return this.presence.markOnline(userId);
  }

  /** Última conexão fechada → OFFLINE + broadcast. */
  private markOffline(userId: string) {
    return this.presence.markOffline(userId);
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
        payload.stickerId,
      );
      // eco do nonce: o autor usa para trocar a mensagem otimista pela real.
      // Não é persistido — só viaja de volta neste evento.
      this.realtime.emitToChannel(
        payload.channelId,
        WS_EVENTS.MESSAGE_NEW,
        payload.nonce ? { ...message, nonce: payload.nonce } : message,
      );
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
      this.realtime.emitToChannel(message.channelId, WS_EVENTS.MESSAGE_UPDATED, message);
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
      this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_DELETED, {
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
      // ── j-bots ── `message.updated` (para o navegador) + `reaction.added`
      // (para a ponte dos bots), sempre pelo mesmo par. Ver
      // `messages/eventos-de-reacao.ts`.
      anunciarReacao(this.realtime, "add", message, user.id, payload.emoji);
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
      anunciarReacao(this.realtime, "remove", message, user.id, payload.emoji);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  /**
   * "Remover prévia" do menu da mensagem (g-emojis-midia). Como toda escrita de
   * mensagem, entra pelo gateway e o resultado volta em `message.updated` para
   * a sala do canal — quem já estava lendo vê o card sumir sem recarregar.
   */
  @SubscribeMessage(WS_EVENTS.MESSAGE_SUPPRESS_EMBEDS)
  async onSuppressEmbeds(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    const payload = this.parse(client, suppressEmbedsSchema, body);
    if (!user || !payload) return;
    try {
      const message = await this.messages.setSuppressEmbeds(
        payload.messageId,
        user.id,
        payload.suppress,
      );
      this.realtime.emitToChannel(message.channelId, WS_EVENTS.MESSAGE_UPDATED, message);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  // ── h-moderacao: enquetes ──────────────────────────────────

  // Os três comandos de enquete respondem com ack (`PollAck`): o valor devolvido
  // por um `@SubscribeMessage` é o que o adaptador do Nest entrega ao callback
  // do `emit` do cliente — e retorno `undefined` é filtrado, o callback nunca
  // roda. Antes eles não devolviam nada, e a falha só chegava como `ws.error`
  // solto: a tela não sabia QUAL voto desfazer e o otimista ficava aceso. Por
  // isso as falhas daqui voltam no ack e **não** repetem o `ws.error` (o
  // cliente mostraria dois toasts para o mesmo erro).

  @SubscribeMessage(WS_EVENTS.POLL_CREATE)
  async onPollCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<PollAck> {
    const user = this.userOf(client);
    if (!user) return { ok: false, error: "Sessão expirada" };
    if (!this.allow(client, WS_EVENTS.POLL_CREATE, false)) return AVISO_DE_RAJADA;
    const payload = parseWsPayload(pollCreateSchema, body);
    if (!payload.ok) {
      this.avisarPayloadInvalido(client, payload.message, WS_EVENTS.POLL_CREATE);
      return { ok: false, error: payload.message };
    }
    // `optionEmojis` fica fora do `pollCreateSchema` (ver `pollOptionEmojisSchema`
    // em `comunidade.ts`); o zod daquele descarta a chave, então lê-se do corpo cru
    const emojis = parseWsPayload(pollOptionEmojisSchema, body);
    if (!emojis.ok) {
      this.avisarPayloadInvalido(client, emojis.message, WS_EVENTS.POLL_CREATE);
      return { ok: false, error: emojis.message };
    }
    try {
      const message = await this.polls.create(user.id, {
        ...payload.data,
        optionEmojis: emojis.data.optionEmojis,
      });
      this.realtime.emitToChannel(
        payload.data.channelId,
        WS_EVENTS.MESSAGE_NEW,
        payload.data.nonce ? { ...message, nonce: payload.data.nonce } : message,
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.mensagemDeErro(client, e) };
    }
  }

  @SubscribeMessage(WS_EVENTS.POLL_VOTE)
  async onPollVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<PollAck> {
    const user = this.userOf(client);
    if (!user) return { ok: false, error: "Sessão expirada" };
    if (!this.allow(client, WS_EVENTS.POLL_VOTE, false)) return AVISO_DE_RAJADA;
    const payload = parseWsPayload(pollVoteSchema, body);
    if (!payload.ok) {
      this.avisarPayloadInvalido(client, payload.message, WS_EVENTS.POLL_VOTE);
      return { ok: false, error: payload.message };
    }
    try {
      // o próprio serviço faz o broadcast do `poll.updated` para a sala
      await this.polls.vote(user.id, payload.data.messageId, payload.data.optionIndex);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.mensagemDeErro(client, e) };
    }
  }

  @SubscribeMessage(WS_EVENTS.POLL_CLOSE)
  async onPollClose(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<PollAck> {
    const user = this.userOf(client);
    if (!user) return { ok: false, error: "Sessão expirada" };
    const payload = parseWsPayload(pollCloseSchema, body);
    if (!payload.ok) {
      this.avisarPayloadInvalido(client, payload.message, WS_EVENTS.POLL_CLOSE);
      return { ok: false, error: payload.message };
    }
    try {
      await this.polls.close(user.id, payload.data.messageId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: this.mensagemDeErro(client, e) };
    }
  }

  private userOf(client: Socket): SocketUser | undefined {
    return client.data.user as SocketUser | undefined;
  }

  /**
   * Consome um token do balde daquele comando. Os baldes ficam no próprio
   * socket, então somem junto com a conexão — não há mapa global a limpar.
   */
  private allow(client: Socket, event: keyof typeof WS_LIMITS, avisar = true): boolean {
    const limit = WS_LIMITS[event];
    const buckets = (client.data.buckets ??= {} as Record<string, BucketState>);
    const now = Date.now();
    const state = (buckets[event] ??= newBucket(limit, now));
    if (takeToken(state, limit, now)) return true;
    // Descartar comando sem rastro era o que escondia um cliente em laço. O
    // carimbo no socket segura o log numa linha a cada 10 s por conexão.
    const ultimo = client.data.ultimoAvisoDeRajada as number | undefined;
    if (ultimo === undefined || now - ultimo >= INTERVALO_DO_AVISO_DE_RAJADA_MS) {
      client.data.ultimoAvisoDeRajada = now;
      this.logger.warn(
        `ws: rajada user=${this.userOf(client)?.id ?? "?"} socket=${client.id} evento=${event}`,
      );
    }
    // `avisar = false`: o comando responde por ack e o aviso vai nele
    if (avisar) {
      client.emit(WS_EVENTS.ERROR, { message: AVISO_DE_RAJADA.error } satisfies WsErrorEvent);
    }
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
    this.avisarPayloadInvalido(client, result.message);
    client.emit(WS_EVENTS.ERROR, { message: result.message } satisfies WsErrorEvent);
    return null;
  }

  /**
   * Payload recusado pelo contrato. Cliente atualizado não manda payload
   * inválido, então isto aponta versão velha ou bug de cliente — e é por isso
   * que precisa de linha no log. `parse` não recebe o nome do evento (os
   * handlers não o passam); os comandos de enquete, que validam por conta
   * própria, informam.
   */
  private avisarPayloadInvalido(client: Socket, motivo: string, evento?: string) {
    this.logger.warn(
      `ws: payload inválido user=${this.userOf(client)?.id ?? "?"} socket=${client.id}${evento ? ` evento=${evento}` : ""} motivo=${motivo}`,
    );
  }

  /**
   * Só a mensagem de uma `HttpException` (que os services escrevem para o
   * usuário: "Canal privado", "Mensagem não encontrada") volta ao cliente.
   * Qualquer outra coisa — erro do Prisma, TypeError — descreveria a entranha
   * do servidor para quem está do outro lado do socket, então vira "Erro
   * interno" e o detalhe fica no log.
   */
  private emitError(client: Socket, e: unknown) {
    client.emit(WS_EVENTS.ERROR, { message: this.mensagemDeErro(client, e) } satisfies WsErrorEvent);
  }

  /**
   * Texto legível de uma falha de comando: a mensagem da `HttpException`, ou
   * "Erro interno" (com log) para o resto. Serve ao `ws.error` e ao ack.
   */
  private mensagemDeErro(client: Socket, e: unknown): string {
    const userId = this.userOf(client)?.id ?? "?";
    if (e instanceof HttpException) {
      const body = e.getResponse();
      const detail =
        typeof body === "string"
          ? body
          : ((body as { message?: string | string[] })?.message ?? e.message);
      const texto = Array.isArray(detail) ? detail.join("; ") : String(detail);
      // Recusa esperada (sem permissão, não encontrado) não é defeito do
      // servidor, mas é justamente o que o usuário vê como "erro": sem esta
      // linha, investigar a reclamação dele não achava nada no log.
      this.logger.warn(
        `ws: recusa user=${userId} socket=${client.id} status=${e.getStatus()} motivo=${texto}`,
      );
      return texto;
    }
    this.logger.error(
      `Falha em comando WS user=${userId} (socket ${client.id})`,
      e instanceof Error ? e.stack : String(e),
    );
    return "Erro interno";
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

    const evento = { channelId: payload.channelId, user };
    // `client.to` e não `emitToChannel`: quem está digitando não pode receber o
    // próprio "está digitando". O gateway dos bots, que não tem esse problema,
    // é avisado à parte — ver `RealtimeService.notificarOuvintes`.
    client.to(room).emit(WS_EVENTS.TYPING, evento);
    this.realtime.notificarOuvintes(
      { tipo: "canal", id: payload.channelId },
      WS_EVENTS.TYPING,
      evento,
    );
  }

  private room(channelId: string) {
    return `channel:${channelId}`;
  }

  // ── f-voz ────────────────────────────────────────────────
  //
  // Voz é estado efêmero, não mensagem: quem entra numa sala fica registrado no
  // `VoiceService` enquanto o socket viver. Por isso o socket lembra em que
  // canal de voz está (`client.data.voiceChannelId`) — é o que permite limpar
  // tudo no disconnect sem perguntar ao banco.

  @SubscribeMessage(WS_EVENTS.VOICE_JOIN)
  async onVoiceJoin(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    if (!this.allow(client, WS_EVENTS.VOICE_JOIN)) return;
    const payload = this.parse(client, voiceJoinSchema, body);
    if (!user || !payload) return;
    try {
      // o join valida o acesso ao canal (assertCanViewChannel) e o tipo
      await this.voice.join(user.id, payload.channelId);
      // ── voz em um lugar só ──
      // A conta entrou daqui: qualquer outra conexão dela sai da voz agora.
      // Tem que ser **antes** de marcar este socket, senão ele se expulsaria.
      await this.expulsarOutrasConexoesDaVoz(user.id, client.id, payload.channelId);
      client.data.voiceChannelId = payload.channelId;
      // reentrou dentro da carência (reconexão do cliente): a saída agendada
      // perde o efeito e o estado de voz segue intacto
      const cancelou = this.cancelarSaidaDaVoz(user.id, payload.channelId);
      this.logger.log(
        `voz: join user=${user.id} canal=${payload.channelId} socket=${client.id}${cancelou ? " (cancelou saída pendente, reentrou na carência)" : ""}`,
      );
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.VOICE_LEAVE)
  async onVoiceLeave(@ConnectedSocket() client: Socket) {
    const user = this.userOf(client);
    if (!user) return;
    const lembrado = client.data.voiceChannelId as string | undefined;
    client.data.voiceChannelId = undefined;
    // Expulso por outra conexão: este socket já não manda na voz da conta. Sem
    // isso, o cliente antigo desligando levaria junto a sessão que acabou de
    // entrar — o estado de voz é por usuário, não por conexão.
    if (client.data.expulsoDaVoz) {
      client.data.expulsoDaVoz = false;
      this.logger.log(
        `voz: leave ignorado (expulsoDaVoz) user=${user.id} socket=${client.id}`,
      );
      return;
    }
    try {
      // a chamada em DM entra pela rota REST, que não passa por este socket:
      // sem o fallback, sair de uma chamada assim não teria efeito nenhum
      const canais = lembrado ? [lembrado] : await this.voice.channelsOf(user.id);
      this.logger.log(
        `voz: leave user=${user.id} socket=${client.id} canais=${canais.join(",") || "nenhum"}`,
      );
      for (const channelId of canais) {
        // saiu por vontade própria: não faz sentido a carência ainda mirar nele
        this.cancelarSaidaDaVoz(user.id, channelId);
        await this.voice.leave(user.id, channelId);
        await this.calls.onDisconnect(user.id, channelId);
      }
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.VOICE_UPDATE)
  async onVoiceUpdate(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    if (!this.allow(client, WS_EVENTS.VOICE_UPDATE)) return;
    const payload = this.parse(client, voiceUpdateSchema, body);
    const channelId = client.data.voiceChannelId as string | undefined;
    if (!user || !payload || !channelId) return;
    try {
      await this.voice.update(user.id, channelId, payload);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.CALL_ACCEPT)
  async onCallAccept(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    const payload = this.parse(client, callSchema, body);
    if (!user || !payload) return;
    try {
      await this.calls.accept(user.id, payload.channelId);
      client.data.voiceChannelId = payload.channelId;
      this.cancelarSaidaDaVoz(user.id, payload.channelId);
      this.logger.log(`voz: call.accept user=${user.id} canal=${payload.channelId} socket=${client.id}`);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.CALL_DECLINE)
  async onCallDecline(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    const payload = this.parse(client, callSchema, body);
    if (!user || !payload) return;
    try {
      await this.calls.decline(user.id, payload.channelId);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  @SubscribeMessage(WS_EVENTS.CALL_END)
  async onCallEnd(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const user = this.userOf(client);
    const payload = this.parse(client, callSchema, body);
    if (!user || !payload) return;
    client.data.voiceChannelId = undefined;
    try {
      await this.calls.end(user.id, payload.channelId);
      this.logger.log(`voz: call.end user=${user.id} canal=${payload.channelId} socket=${client.id}`);
    } catch (e) {
      this.emitError(client, e);
    }
  }

  /**
   * Aba fechada ou conexão perdida: agenda a saída da sala de voz, **não** a
   * executa.
   *
   * Só a queda do socket não distingue "fechei a aba" de "o navegador
   * estrangulou a aba" ou "o wi-fi oscilou" — e tratar tudo como saída era o
   * que expulsava da chamada quem só minimizou a janela. Durante a carência o
   * usuário continua na sala, marcado como `reconnecting` para a UI poder
   * esmaecê-lo; se voltar, `cancelarSaidaDaVoz` desfaz o agendamento.
   *
   * Quem fechou a aba de verdade sai ao fim da janela: um fantasma de
   * `VOICE_RECONNECT_GRACE_MS` custa menos que derrubar quem estava só de
   * passagem por outro aplicativo.
   *
   * Nada é feito quando outra conexão do mesmo usuário segue na sala — duas
   * abas no mesmo canal não podem derrubar uma à outra.
   */
  private async agendarSaidaDaVoz(client: Socket, user: SocketUser) {
    const channelId = client.data.voiceChannelId as string | undefined;
    if (!channelId) return;
    if (await this.temSocketNaVoz(user.id, channelId, client.id)) {
      this.logger.log(
        `voz: agendarSaida ignorado (outra conexão segue na sala) user=${user.id} canal=${channelId} socket=${client.id}`,
      );
      return;
    }

    const chave = this.chaveDeVoz(user.id, channelId);
    clearTimeout(this.saidasDeVozPendentes.get(chave));
    this.saidasDeVozPendentes.delete(chave);

    const motivo = client.data.motivoDaDesconexao as string | undefined;
    // Quem clicou em "Sair" (na bandeja, na aba, no Cmd+Q) não vai voltar: a
    // carência só o deixaria 45 s na sala, para todo mundo, marcado como
    // "reconectando". Sai agora — e sem a marca, que descreveria algo falso.
    if (saidaFoiIntencional(motivo)) {
      this.logger.log(
        `voz: saída imediata (motivo intencional) user=${user.id} canal=${channelId} socket=${client.id} motivo=${motivo}`,
      );
      await this.removerDaVoz(user.id, channelId);
      return;
    }

    this.logger.log(
      `voz: carência agendada user=${user.id} canal=${channelId} socket=${client.id} motivo=${motivo ?? "desconhecido"} graceMs=${VOICE_RECONNECT_GRACE_MS}`,
    );
    await this.voice.marcarReconectando(user.id, channelId, true).catch(() => {});
    this.saidasDeVozPendentes.set(
      chave,
      setTimeout(() => {
        this.saidasDeVozPendentes.delete(chave);
        this.logger.log(`voz: carência expirada user=${user.id} canal=${channelId}`);
        void this.removerDaVoz(user.id, channelId);
      }, VOICE_RECONNECT_GRACE_MS),
    );
  }

  /**
   * Voltou a tempo (ou saiu de propósito): a saída agendada perde o efeito.
   * Devolve se de fato havia uma saída pendente e ela foi cancelada — usado
   * pelo log de `onVoiceJoin` para dizer se a reentrada aconteceu dentro da
   * carência.
   */
  private cancelarSaidaDaVoz(userId: string, channelId: string): boolean {
    const chave = this.chaveDeVoz(userId, channelId);
    const agendada = this.saidasDeVozPendentes.get(chave);
    if (!agendada) return false;
    clearTimeout(agendada);
    this.saidasDeVozPendentes.delete(chave);
    this.logger.log(`voz: saída pendente cancelada user=${userId} canal=${channelId}`);
    return true;
  }

  /**
   * Fim da carência. Confere de novo antes de remover: entre o agendamento e
   * agora o usuário pode ter voltado por outra aba, e aí o que estava errado
   * era só a marca de "reconectando".
   */
  private async removerDaVoz(userId: string, channelId: string) {
    if (await this.temSocketNaVoz(userId, channelId)) {
      this.logger.log(
        `voz: não removido, outra conexão segue na sala — só desmarcou reconectando user=${userId} canal=${channelId}`,
      );
      await this.voice
        .marcarReconectando(userId, channelId, false)
        .catch((e) => this.logger.warn(`voz: falha ao desmarcar reconectando user=${userId} canal=${channelId}: ${this.msgDeErro(e)}`));
      return;
    }
    this.logger.log(`voz: removido da voz user=${userId} canal=${channelId}`);
    await this.voice
      .leave(userId, channelId)
      .catch((e) => this.logger.warn(`voz: falha ao sair (leave) user=${userId} canal=${channelId}: ${this.msgDeErro(e)}`));
    await this.calls
      .onDisconnect(userId, channelId)
      .catch((e) => this.logger.warn(`voz: falha em calls.onDisconnect user=${userId} canal=${channelId}: ${this.msgDeErro(e)}`));
  }

  /** Texto curto de um erro qualquer, para os `warn` de limpeza de voz. */
  private msgDeErro(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  private chaveDeVoz(userId: string, channelId: string) {
    return `${userId}:${channelId}`;
  }

  /**
   * Tira da voz todas as outras conexões da mesma conta.
   *
   * O estado de voz é por **usuário**: o `VoiceService` guarda "fulano está no
   * canal X", sem saber de qual aparelho. Enquanto isso o LiveKit é por
   * **identidade**, e não aceita duas iguais na mesma sala — ele derruba a
   * conexão mais antiga por conta própria. O resultado, antes disto, era o
   * navegador ser expulso pelo app e mostrar "a conexão de voz caiu", como se
   * fosse queda de rede.
   *
   * Aqui a expulsão passa a ser explícita e anunciada. O socket antigo perde a
   * marca de voz e recebe `VOICE_EVICTED`, para dizer ao usuário o que de fato
   * aconteceu. `expulsoDaVoz` é o que impede que o `VOICE_LEAVE` dele, que vem
   * logo em seguida, apague a sessão que acabou de entrar.
   *
   * Não mexe no `VoiceService`: a conta continua na voz, só que agora pela
   * conexão nova. Trocar de canal já é tratado pelo `leaveAllExcept` do join.
   */
  private async expulsarOutrasConexoesDaVoz(userId: string, manter: string, novoCanalId: string) {
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    const alvos = conexoesAExpulsar(
      sockets.map((s) => ({ id: s.id, voiceChannelId: s.data.voiceChannelId as string | undefined, s })),
      manter,
    );
    for (const { s, voiceChannelId } of alvos) {
      s.data.voiceChannelId = undefined;
      s.data.expulsoDaVoz = true;
      this.cancelarSaidaDaVoz(userId, voiceChannelId!);
      s.emit(WS_EVENTS.VOICE_EVICTED, { channelId: voiceChannelId, novoCanalId });
    }
    if (alvos.length > 0) {
      this.logger.log(
        `voz: expulsão user=${userId} canal=${novoCanalId} socket=${manter} conexõesExpulsas=${alvos.length}`,
      );
    }
  }

  /** Alguma conexão viva do usuário está nesta sala de voz? */
  private async temSocketNaVoz(userId: string, channelId: string, ignorar?: string) {
    const sockets = await this.server.in(`user:${userId}`).fetchSockets();
    return sockets.some((s) => s.id !== ignorar && s.data.voiceChannelId === channelId);
  }
}
