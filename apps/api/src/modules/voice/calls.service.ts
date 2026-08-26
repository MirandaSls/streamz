import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  CALL_RING_TIMEOUT_MS,
  WS_EVENTS,
  type CallEndedEvent,
  type CallRingEvent,
  type CallStartResponse,
  type PublicUser,
} from "@streamz/shared";
import { GuildsService } from "../guilds/guilds.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { VoiceService } from "./voice.service";
import { toPublicUser } from "../../common/dto";

/** Chamada tocando numa conversa: quem ligou, para quem falta atender e o relógio. */
interface Toque {
  fromUserId: string;
  pendentes: Set<string>;
  timer: NodeJS.Timeout;
}

/**
 * Chamadas em conversa direta (1-a-1 e grupo).
 *
 * A chamada em si é o estado de voz do canal da conversa (`VoiceService`) — o
 * que este serviço acrescenta é o **toque**: avisar quem ainda não entrou e
 * desistir sozinho depois de `CALL_RING_TIMEOUT_MS`.
 *
 * Os relógios vivem no processo, como o `@nestjs/schedule` da faxina: com mais
 * de uma instância, o toque expira na instância que iniciou a chamada. O estado
 * de voz, esse sim, é compartilhado (Redis) — então ninguém fica preso numa
 * chamada fantasma se a instância cair.
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private readonly tocando = new Map<string, Toque>();

  constructor(
    private readonly voice: VoiceService,
    private readonly guilds: GuildsService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Começa uma chamada — ou entra numa que já está rolando. Entrar numa
   * chamada em andamento não faz o telefone tocar de novo: vira mais um
   * participante e pronto.
   */
  async start(userId: string, username: string, channelId: string): Promise<CallStartResponse> {
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    if (access.tipo !== "dm") {
      throw new BadRequestException("Chamada é para conversa direta — use o canal de voz");
    }

    const jaEmChamada = (await this.voice.count(channelId)) > 0;
    await this.voice.join(userId, channelId);

    const de = await this.usuario(userId);
    const participantes = await this.voice.participantes(channelId);
    const alvos = participantes.filter((id) => id !== userId);

    // toca só quando a chamada nasce agora; entrar numa em andamento é silencioso
    let ringing: PublicUser[] = [];
    if (!jaEmChamada && alvos.length > 0 && de) {
      ringing = await this.tocar(channelId, userId, de, alvos);
    }

    return {
      channelId,
      voice: await this.voice.tokenOpcional(this.voice.salaDe("DM", channelId), userId, username),
      states: await this.voice.statesForChannel(channelId, null),
      ringing,
    };
  }

  /** Atende: entra na voz e cala o toque. */
  async accept(userId: string, channelId: string) {
    await this.voice.join(userId, channelId);
    this.pendenteAtendido(channelId, userId);
  }

  /** Recusa: avisa a conversa e, se ninguém mais estava para atender, encerra. */
  async decline(userId: string, channelId: string) {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const quem = await this.usuario(userId);
    this.emitir(channelId, { channelId, by: quem, reason: "declined" });
    this.pendenteAtendido(channelId, userId);
    await this.encerrarSeVazia(channelId, quem, "declined");
  }

  /** Desliga: sai da voz e, se a sala esvaziou, encerra a chamada para todos. */
  async end(userId: string, channelId: string) {
    const quem = await this.usuario(userId);
    await this.voice.leave(userId, channelId);
    this.pendenteAtendido(channelId, userId);
    await this.encerrarSeVazia(channelId, quem, "ended");
  }

  /** Sockets caindo: o gateway já tirou o usuário da voz, aqui só limpamos o toque. */
  async onDisconnect(userId: string, channelId: string) {
    this.pendenteAtendido(channelId, userId);
    await this.encerrarSeVazia(channelId, null, "ended");
  }

  private async tocar(
    channelId: string,
    fromUserId: string,
    from: PublicUser,
    alvos: string[],
  ): Promise<PublicUser[]> {
    this.calar(channelId);
    const timer = setTimeout(() => {
      void this.expirar(channelId).catch((e) =>
        this.logger.error(`Falha ao expirar chamada ${channelId}`, e instanceof Error ? e.stack : String(e)),
      );
    }, CALL_RING_TIMEOUT_MS);
    // não segura o processo vivo só por causa de um telefone tocando
    timer.unref?.();
    this.tocando.set(channelId, { fromUserId, pendentes: new Set(alvos), timer });

    const evento: CallRingEvent = { channelId, from };
    this.realtime.emitToUsers(alvos, WS_EVENTS.CALL_RING, evento);
    const users = await this.prisma.user.findMany({ where: { id: { in: alvos } } });
    return users.map((u) => toPublicUser(u));
  }

  /** Ninguém atendeu em 30 s: a chamada morre e quem ligou sai da sala. */
  private async expirar(channelId: string) {
    const toque = this.tocando.get(channelId);
    if (!toque) return;
    this.calar(channelId);
    // alguém entrou no meio do caminho? então não expirou nada
    if ((await this.voice.count(channelId)) > 1) return;
    await this.voice.leave(toque.fromUserId, channelId);
    this.emitir(channelId, { channelId, by: null, reason: "timeout" });
  }

  private pendenteAtendido(channelId: string, userId: string) {
    const toque = this.tocando.get(channelId);
    if (!toque) return;
    toque.pendentes.delete(userId);
  }

  /** Sala vazia = chamada acabou: cala o toque e avisa quem estava na conversa. */
  private async encerrarSeVazia(
    channelId: string,
    by: PublicUser | null,
    reason: CallEndedEvent["reason"],
  ) {
    if ((await this.voice.count(channelId)) > 0) return;
    this.calar(channelId);
    // "declined" já foi anunciado por quem recusou; não repetir o mesmo aviso
    if (reason !== "declined") this.emitir(channelId, { channelId, by, reason });
  }

  private calar(channelId: string) {
    const toque = this.tocando.get(channelId);
    if (!toque) return;
    clearTimeout(toque.timer);
    this.tocando.delete(channelId);
  }

  private emitir(channelId: string, evento: CallEndedEvent) {
    void this.voice
      .participantes(channelId)
      .then((ids) => this.realtime.emitToUsers(ids, WS_EVENTS.CALL_ENDED, evento))
      .catch(() => {
        /* conversa apagada no meio: não há a quem avisar */
      });
  }

  private async usuario(userId: string): Promise<PublicUser | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    return u ? toPublicUser(u) : null;
  }
}
