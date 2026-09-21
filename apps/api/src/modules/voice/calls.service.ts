import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import {
  CALL_ALONE_TIMEOUT_MS,
  CALL_RING_TIMEOUT_MS,
  WS_EVENTS,
  type CallEndedEvent,
  type CallRingEvent,
  type CallStartResponse,
  type PublicUser,
} from "@streamz/shared";
import { FriendsService } from "../friends/friends.service";
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
 * que este serviço acrescenta são os dois relógios que uma conversa tem e um
 * canal de voz de servidor não tem:
 *
 * 1. o **toque**, que avisa quem ainda não entrou e desiste depois de
 *    `CALL_RING_TIMEOUT_MS`;
 * 2. a **solidão**, que encerra a chamada `CALL_ALONE_TIMEOUT_MS` depois de
 *    sobrar uma pessoa só.
 *
 * Os dois nunca correm juntos: enquanto alguém ainda pode atender, quem manda é
 * o toque — empilhar os relógios encerraria a chamada não atendida duas vezes.
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
  /** Canal → relógio dos 5 minutos de quem ficou sozinho na chamada. */
  private readonly sozinhos = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly voice: VoiceService,
    private readonly guilds: GuildsService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly friends: FriendsService,
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

    const participantes = await this.voice.participantes(channelId);
    const alvos = participantes.filter((id) => id !== userId);

    // Bloqueio vale para a chamada, não só para abrir a conversa: o canal de uma
    // conversa que já existia continua visível depois do bloqueio, e sem esta
    // checagem ligar seria a porta dos fundos do DM barrado. Só na conversa de
    // dois — num grupo, bloquear uma pessoa não tira o direito de chamar as
    // outras que estão lá.
    if (alvos.length === 1) {
      await this.friends.assertNotBlocked(userId, alvos[0]);
    }

    const jaEmChamada = (await this.voice.count(channelId)) > 0;
    await this.voice.join(userId, channelId);

    // entrar numa chamada em andamento **é** atender — só que pelo botão
    // "Entrar" da faixa, não pelo telefone. Sem tirar quem entrou de
    // `pendentes` (e calar o toque quando não sobra ninguém para atender), o
    // relógio dos 30 s seguia armado: `expirar` depois encontrava a sala com
    // quem entrou mas sem quem ligou e encerrava a conversa de quem estava
    // falando, com "Ninguém atendeu". Um toque vivo ainda trava o relógio da
    // solidão, que é quem deveria mandar daqui em diante.
    if (jaEmChamada) {
      this.pendenteAtendido(channelId, userId);
      if (this.tocando.get(channelId)?.pendentes.size === 0) this.calar(channelId);
    }

    const de = await this.usuario(userId);

    // toca só quando a chamada nasce agora; entrar numa em andamento é silencioso.
    //
    // `this.tocando.has` não é redundante com `jaEmChamada`: dois `POST
    // /dms/:id/call` do **mesmo** clique duplo podem ler a contagem antes de
    // qualquer um dos dois entrar na sala, e aí os dois achariam que a chamada
    // nasce agora — o outro lado recebia dois `call.ring` e o telefone dele
    // recomeçava do zero no meio do primeiro toque
    let ringing: PublicUser[] = [];
    if (!jaEmChamada && !this.tocando.has(channelId) && alvos.length > 0 && de) {
      ringing = await this.tocar(channelId, userId, de, alvos);
    } else if (this.tocando.get(channelId)?.fromUserId === userId) {
      // já é a minha chamada tocando: a resposta continua dizendo para quem
      // ela toca, sem reemitir evento nenhum
      ringing = await this.pendentes(channelId);
    }
    await this.avaliarSolidao(channelId);

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
    // atendida deixa de ser uma chamada que toca. Sem calar aqui, o relógio dos
    // 30 s continuaria armado e chutaria quem ligou se o outro saísse antes
    // dele — e bloquearia o relógio da solidão, que é quem manda daqui em diante
    this.calar(channelId);
    await this.avaliarSolidao(channelId);
  }

  /**
   * Recusa: para de tocar para quem recusou e, se a chamada morreu com isso,
   * avisa a conversa.
   */
  async decline(userId: string, channelId: string) {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const toque = this.tocando.get(channelId);
    // telefone nenhum tocando aqui: não há o que recusar. Silêncio em vez de
    // erro porque este é o caso legítimo do grupo — quem atendeu calou o toque
    // e o cartão de chamada de quem ainda não respondeu só some quando a pessoa
    // clica; o clique não pode virar um aviso de erro na tela dela.
    if (!toque) return;
    // recusar é responder a um telefone que está tocando **para você**. Ver a
    // conversa não basta: sem esta checagem, qualquer participante da conversa
    // mandava `call.decline` de uma chamada da qual nem foi chamado
    if (!toque.pendentes.has(userId)) {
      throw new ForbiddenException("Você não está sendo chamado nesta conversa");
    }
    const quem = await this.usuario(userId);
    toque.pendentes.delete(userId);
    // sem ninguém para atender não há mais toque: deixar o relógio armado
    // encerraria depois a chamada de quem sobrou e, pior, o `tocando` órfão
    // faria a próxima ligação da mesma conversa sair muda
    if (toque.pendentes.size === 0) this.calar(channelId);

    // `call.ended` só quando a chamada de fato morre: ninguém mais para
    // atender **e** ninguém além de quem ligou na sala. Emitir sempre (era o
    // que este método fazia) derrubava o grupo inteiro na recusa de um só —
    // A liga, B atende, C recusa e A e B eram desligados.
    const aindaTemQuemAtender = toque.pendentes.size > 0;
    const outrosNaSala = (await this.voice.count(channelId)) > 1;
    if (!aindaTemQuemAtender && !outrosNaSala) {
      this.emitir(channelId, { channelId, by: quem, reason: "declined" });
    }
    await this.encerrarSeVazia(channelId, quem, "declined");
    await this.avaliarSolidao(channelId);
  }

  /** Desliga: sai da voz e, se a sala esvaziou, encerra a chamada para todos. */
  async end(userId: string, channelId: string) {
    const quem = await this.usuario(userId);
    await this.voice.leave(userId, channelId);
    this.pendenteAtendido(channelId, userId);
    await this.encerrarSeVazia(channelId, quem, "ended");
    await this.avaliarSolidao(channelId);
  }

  /** Sockets caindo: o gateway já tirou o usuário da voz, aqui só limpamos o toque. */
  async onDisconnect(userId: string, channelId: string) {
    this.pendenteAtendido(channelId, userId);
    await this.encerrarSeVazia(channelId, null, "ended");
    await this.avaliarSolidao(channelId);
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
    // alguém **além de quem ligou** entrou no meio do caminho? então a chamada
    // foi atendida e não expirou nada. Contar a sala não bastava: quando quem
    // ligou desligava e quem entrou pelo botão "Entrar" ficava, sobrava uma
    // pessoa só e o timeout desligava justamente quem estava na chamada. Sem
    // toque, quem sobrou passa a ser assunto do relógio da solidão.
    const naSala = await this.voice.membrosDaSala(channelId);
    if (naSala.some((id) => id !== toque.fromUserId)) {
      await this.avaliarSolidao(channelId);
      return;
    }
    await this.voice.leave(toque.fromUserId, channelId);
    this.emitir(channelId, { channelId, by: null, reason: "timeout" });
  }

  // ── solidão ────────────────────────────────────────────────

  /**
   * Liga ou desliga o relógio dos 5 minutos sozinho, a partir de quantos
   * sobraram na sala. Chamada depois de **toda** entrada e saída de chamada:
   * o relógio começa quando a pessoa *fica* sozinha e morre quando alguém entra.
   *
   * Só vale em conversa (`guildId` null). Ficar sozinho num canal de voz de
   * servidor é normal — é uma sala aberta esperando gente, não uma chamada.
   */
  private async avaliarSolidao(channelId: string) {
    // ainda há quem atender: o toque é que decide o destino desta chamada
    if ((await this.voice.count(channelId)) !== 1 || this.tocando.has(channelId)) {
      this.cancelarSolidao(channelId);
      return;
    }
    // já está correndo desde que a pessoa ficou sozinha: rearmar reiniciaria a
    // contagem a cada evento e ela nunca chegaria ao fim
    if (this.sozinhos.has(channelId)) return;
    if (!(await this.ehConversa(channelId))) return;

    const timer = setTimeout(() => {
      void this.expirarSozinho(channelId).catch((e) =>
        this.logger.error(
          `Falha ao encerrar chamada solitária ${channelId}`,
          e instanceof Error ? e.stack : String(e),
        ),
      );
    }, CALL_ALONE_TIMEOUT_MS);
    // não segura o processo vivo por causa de uma chamada esquecida
    timer.unref?.();
    this.sozinhos.set(channelId, timer);
  }

  /** Cinco minutos sozinho: tira quem sobrou da sala e encerra para a conversa. */
  private async expirarSozinho(channelId: string) {
    this.sozinhos.delete(channelId);
    const restantes = await this.voice.membrosDaSala(channelId);
    // entrou ou saiu alguém entre o disparo e esta linha: não há solidão a encerrar
    if (restantes.length !== 1) return;
    await this.voice.leave(restantes[0], channelId);
    this.emitir(channelId, { channelId, by: null, reason: "alone" });
  }

  private cancelarSolidao(channelId: string) {
    const timer = this.sozinhos.get(channelId);
    if (!timer) return;
    clearTimeout(timer);
    this.sozinhos.delete(channelId);
  }

  /** Conversa direta ou grupo — o `guildId` null do ADR-0001. */
  private async ehConversa(channelId: string): Promise<boolean> {
    const canal = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true },
    });
    return canal?.guildId === null;
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

  /** Quem ainda não atendeu esta chamada — o `ringing` da resposta, sem tocar de novo. */
  private async pendentes(channelId: string): Promise<PublicUser[]> {
    const toque = this.tocando.get(channelId);
    if (!toque) return [];
    const ids = Array.from(toque.pendentes);
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } } });
    return users.map((u) => toPublicUser(u));
  }

  private async usuario(userId: string): Promise<PublicUser | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    return u ? toPublicUser(u) : null;
  }
}
