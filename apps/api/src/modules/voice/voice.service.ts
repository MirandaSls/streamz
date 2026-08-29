import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AccessToken } from "livekit-server-sdk";
import {
  VOICE_FLAGS_PADRAO,
  WS_EVENTS,
  type VoiceFlags,
  type VoiceStateEvent,
  type VoiceTokenResponse,
} from "@streamz/shared";
import { GuildsService } from "../guilds/guilds.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { redisClient } from "../realtime/redis";
import { toPublicUser } from "../../common/dto";
import {
  MemoryVoiceStateStore,
  RedisVoiceStateStore,
  type VoiceMember,
  type VoiceStateStore,
} from "./voice-state.store";

/**
 * Voz: token do LiveKit e o **estado de quem está em cada sala**.
 *
 * As duas coisas são independentes de propósito. O estado de voz (quem entrou,
 * quem está mudo) é do Streamz e funciona sem servidor de mídia nenhum — é o
 * que a barra lateral mostra. O token é só a credencial para o LiveKit
 * transportar áudio/vídeo; sem as credenciais a rota responde 503 e o resto
 * continua de pé (ver PENDENCIAS.md).
 */
@Injectable()
export class VoiceService {
  /** Estado efêmero: em memória por padrão, no Redis quando há várias instâncias. */
  private readonly store: VoiceStateStore = (() => {
    const redis = redisClient();
    return redis ? new RedisVoiceStateStore(redis) : new MemoryVoiceStateStore();
  })();

  constructor(
    private readonly guilds: GuildsService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * true só com as três variáveis do LiveKit presentes. Espelha o
   * `StorageService.isConfigured()`: voz é opcional no dev, e sem credencial a
   * rota responde 503 em vez de assinar um token com `undefined`.
   */
  isConfigured(): boolean {
    return Boolean(
      process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET &&
        process.env.LIVEKIT_URL,
    );
  }

  /**
   * Gera um token de acesso do LiveKit para um usuário entrar na sala
   * correspondente a um canal de voz.
   */
  async createToken(
    channelId: string,
    userId: string,
    username: string,
  ): Promise<VoiceTokenResponse> {
    // só quem pode ver o canal (membro; se privado, na allowlist) recebe token
    const { channel } = await this.guilds.assertCanViewChannel(userId, channelId);
    if (channel.type !== "VOICE") {
      throw new BadRequestException("Este canal não é de voz");
    }
    return this.assinarToken(this.salaDe(channel.type, channelId), userId, username);
  }

  /** Nome da sala no LiveKit: prefixo `voice:` num canal de servidor, `dm:` numa conversa. */
  salaDe(tipo: string, channelId: string): string {
    return tipo === "VOICE" ? `voice:${channelId}` : `dm:${channelId}`;
  }

  /**
   * Assina o token da sala. Devolve `null` — em vez de 503 — quando o LiveKit
   * não está configurado e o chamador consegue seguir sem mídia: é o caso da
   * chamada em DM, que continua tocando e registrando participantes.
   */
  async tokenOpcional(
    room: string,
    userId: string,
    username: string,
  ): Promise<VoiceTokenResponse | null> {
    if (!this.isConfigured()) return null;
    return this.assinarToken(room, userId, username);
  }

  private async assinarToken(
    room: string,
    userId: string,
    username: string,
  ): Promise<VoiceTokenResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "Voz (LiveKit) não configurada. Ver PENDENCIAS.md.",
      );
    }
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: userId,
      name: username,
      ttl: "1h",
    });
    at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
    return { token: await at.toJwt(), url: process.env.LIVEKIT_URL!, room };
  }

  // ── estado de voz ──────────────────────────────────────────

  /**
   * Entra numa sala de voz. Passa pelo assert de canal (não existe entrar em
   * canal que você não enxerga) e recusa canal de texto — sala de voz é canal
   * de voz ou conversa direta.
   */
  async join(userId: string, channelId: string, flags: VoiceFlags = VOICE_FLAGS_PADRAO) {
    const { channel } = await this.guilds.assertCanViewChannel(userId, channelId);
    if (channel.type === "TEXT") {
      throw new BadRequestException("Este canal não tem voz");
    }
    // uma conexão de voz por usuário: sair da anterior evita estado zumbi em
    // duas salas quando o cliente entra num canal sem sair do outro
    await this.leaveAllExcept(userId, channelId);
    await this.store.join(channelId, userId, flags);
    await this.broadcast(channelId, channel.guildId, userId, flags, true);
    return channel;
  }

  /** Atualiza mudo/surdo/vídeo/tela. Devolve null se o usuário não estava na sala. */
  async update(userId: string, channelId: string, flags: VoiceFlags) {
    const membro = await this.store.update(channelId, userId, flags);
    if (!membro) return null;
    const channel = await this.canal(channelId);
    await this.broadcast(channelId, channel?.guildId ?? null, userId, flags, true);
    return membro;
  }

  /** Sai da sala. Devolve o canal quando havia mesmo o que sair. */
  async leave(userId: string, channelId: string) {
    const saiu = await this.store.leave(channelId, userId);
    if (!saiu) return null;
    const channel = await this.canal(channelId);
    await this.broadcast(channelId, channel?.guildId ?? null, userId, VOICE_FLAGS_PADRAO, false);
    return channel;
  }

  /**
   * Marca (ou desmarca) o membro como "reconectando" e avisa a sala.
   *
   * Não mexe na lista de propósito: durante a carência a pessoa **continua** na
   * chamada, e quem está do outro lado precisa ver "reconectando" em vez de ver
   * o participante sumir e voltar a cada oscilação de rede.
   */
  async marcarReconectando(userId: string, channelId: string, reconnecting: boolean) {
    const membro = await this.store.marcarReconectando(channelId, userId, reconnecting);
    if (!membro) return null;
    const channel = await this.canal(channelId);
    await this.broadcast(
      channelId,
      channel?.guildId ?? null,
      userId,
      { muted: membro.muted, deafened: membro.deafened, video: membro.video, screen: membro.screen },
      true,
      reconnecting,
    );
    return membro;
  }

  /** Canais em que o usuário aparece como conectado (para limpar no disconnect). */
  async channelsOf(userId: string): Promise<string[]> {
    const canais = await this.canaisDeVozDoUsuario(userId);
    const mapa = await this.store.membersOf(canais);
    return Array.from(mapa.entries())
      .filter(([, membros]) => membros.some((m) => m.userId === userId))
      .map(([channelId]) => channelId);
  }

  /** Quantos estão numa sala — o "ainda tem alguém na chamada?" do fim de chamada. */
  async count(channelId: string): Promise<number> {
    return (await this.store.members(channelId)).length;
  }

  /** Quem está na sala agora. É o `count` para quem precisa saber *quem* sobrou. */
  async membrosDaSala(channelId: string): Promise<string[]> {
    return (await this.store.members(channelId)).map((m) => m.userId);
  }

  /**
   * **Toda** chamada aberta na instância, por canal. Só o painel do
   * administrador usa: o resto do app sempre parte de um canal ou servidor
   * concreto, e varrer o estado inteiro seria trabalho jogado fora.
   */
  async salasAbertas(): Promise<Map<string, VoiceMember[]>> {
    return this.store.membersOf(await this.store.salasAbertas());
  }

  /** Estado inicial de um servidor: quem está em cada canal de voz dele. */
  async statesForGuild(userId: string, guildId: string): Promise<VoiceStateEvent[]> {
    await this.guilds.assertMember(userId, guildId);
    const canais = await this.prisma.channel.findMany({
      where: { guildId, type: "VOICE" },
      select: { id: true },
    });
    return this.statesOf(
      canais.map((c) => c.id),
      guildId,
    );
  }

  /** Estado de uma sala só (usado ao abrir uma chamada em DM). */
  async statesForChannel(channelId: string, guildId: string | null): Promise<VoiceStateEvent[]> {
    return this.statesOf([channelId], guildId);
  }

  private async statesOf(channelIds: string[], guildId: string | null): Promise<VoiceStateEvent[]> {
    const mapa = await this.store.membersOf(channelIds);
    const userIds = Array.from(
      new Set(Array.from(mapa.values()).flatMap((membros) => membros.map((m) => m.userId))),
    );
    if (userIds.length === 0) return [];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
    const porId = new Map(users.map((u) => [u.id, toPublicUser(u)]));
    const out: VoiceStateEvent[] = [];
    for (const [channelId, membros] of mapa) {
      for (const m of membros) {
        const user = porId.get(m.userId);
        if (!user) continue; // usuário apagado no meio: some da sala
        out.push({
          channelId,
          guildId,
          user,
          connected: true,
          muted: m.muted,
          deafened: m.deafened,
          video: m.video,
          screen: m.screen,
          reconnecting: m.reconnecting ?? false,
        });
      }
    }
    return out;
  }

  /**
   * Difunde `voice.state`. Em canal de servidor vai para a sala do servidor
   * (todo membro vê quem está na voz pela barra lateral); em conversa direta,
   * só para os participantes — não há sala de servidor a que recorrer.
   */
  private async broadcast(
    channelId: string,
    guildId: string | null,
    userId: string,
    flags: VoiceFlags,
    connected: boolean,
    reconnecting = false,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const evento: VoiceStateEvent = {
      channelId,
      guildId,
      user: toPublicUser(user),
      connected,
      ...flags,
      reconnecting,
    };
    if (guildId) {
      this.realtime.emitToGuild(guildId, WS_EVENTS.VOICE_STATE, evento);
      return;
    }
    this.realtime.emitToUsers(await this.participantes(channelId), WS_EVENTS.VOICE_STATE, evento);
  }

  /** Participantes de uma conversa direta (destinatários dos eventos de chamada). */
  async participantes(channelId: string): Promise<string[]> {
    const membros = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });
    return membros.map((m) => m.userId);
  }

  private async canal(channelId: string) {
    return this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, guildId: true, type: true },
    });
  }

  /** Todo canal em que o usuário poderia estar em voz: de voz nos servidores + conversas. */
  private async canaisDeVozDoUsuario(userId: string): Promise<string[]> {
    const canais = await this.prisma.channel.findMany({
      where: {
        OR: [
          { type: "VOICE", guild: { members: { some: { userId } } } },
          { guildId: null, members: { some: { userId } } },
        ],
      },
      select: { id: true },
    });
    return canais.map((c) => c.id);
  }

  private async leaveAllExcept(userId: string, manter: string) {
    for (const channelId of await this.channelsOf(userId)) {
      if (channelId !== manter) await this.leave(userId, channelId);
    }
  }
}
