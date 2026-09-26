import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Server } from "socket.io";
import { registrarGauge } from "../../common/metrics";
import { PrismaService } from "../../prisma/prisma.service";

// ── j-bots ──
/** Onde um evento foi parar: a sala do Socket.IO que o recebeu. */
export type AlvoDoEvento =
  | { tipo: "todos" }
  | { tipo: "usuario"; id: string }
  | { tipo: "usuarios"; ids: string[] }
  | { tipo: "canal"; id: string }
  | { tipo: "servidor"; id: string }
  // quem tem relação com o usuário (ver `emitToRelated`): as salas saem de
  // consulta, então o ouvinte recebe só o dono do evento
  | { tipo: "relacionados"; userId: string };

/** Um ouvinte local (ver `onEvent`). */
type OuvinteLocal = (alvo: AlvoDoEvento, evento: string, dado: unknown) => void;

/**
 * Ponte fina para emitir eventos WebSocket de fora do gateway (ex.: serviços
 * HTTP como moderação). O gateway registra o `Server` no boot via `bind()`;
 * quem precisar emitir injeta este serviço. Evita a dependência circular que
 * surgiria se um serviço importasse o próprio ChatGateway.
 *
 * Salas: `user:<id>` (todas as conexões de um usuário), `channel:<id>` (quem
 * pode ver o canal) e `guild:<id>` (membros do servidor — eventos de estrutura:
 * canal criado/renomeado/apagado, papel alterado).
 *
 * Os `emit*` também avisam os **ouvintes locais** (`onEvent`); os
 * `join`/`leave` de sala **não**, porque não são eventos — não há nada para
 * traduzir e ninguém do outro lado esperando.
 */
@Injectable()
export class RealtimeService {
  private server?: Server;
  private readonly logger = new Logger(RealtimeService.name);

  /**
   * `@Optional` porque os testes montam `new RealtimeService()` com um
   * `Server` de mentira e sem banco. Sem Prisma, `emitToRelated` cai no
   * mínimo seguro: só as outras abas do próprio usuário.
   */
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  // ── j-bots ──
  private readonly ouvintes: OuvinteLocal[] = [];

  /**
   * Ouvinte local, chamado junto com o `emit`. É o gancho da casca de
   * compatibilidade com o Discord (`discord-compat/gateway/dispatch.ts`): o
   * gateway dos bots não inventa evento, ele assina os mesmos que o navegador
   * recebe e traduz.
   *
   * A alternativa era sniffar o adapter do Socket.IO, que é frágil. Assim são
   * quinze linhas, sem dependência circular, funcionando com e sem Redis, e
   * testável sem subir servidor.
   *
   * Ressalva registrada: os ouvintes veem só o que **esta instância** emitiu.
   * Hoje a API roda num contêiner só. Com N instâncias é preciso um canal Redis
   * pub/sub próprio — está fora de escopo e é dívida conhecida (§7 de
   * `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`).
   */
  onEvent(cb: OuvinteLocal): void {
    this.ouvintes.push(cb);
  }

  /**
   * Chama os ouvintes **depois** do `emit`, cada um no seu `try/catch`: um bot
   * com defeito não pode derrubar o `emit` que o navegador espera.
   */
  private notificar(alvo: AlvoDoEvento, evento: string, dado: unknown) {
    for (const ouvinte of this.ouvintes) {
      try {
        ouvinte(alvo, evento, dado);
      } catch (erro) {
        this.logger.error(`ouvinte local falhou em "${evento}": ${(erro as Error).message}`);
      }
    }
  }

  /**
   * Avisa os ouvintes **sem** emitir no Socket.IO.
   *
   * Existe para um caso só, e é melhor tê-lo explícito do que ver alguém
   * "consertar" o outro: o `typing` do chat sai por `client.to(sala)`, que
   * exclui de propósito quem está digitando — trocá-lo por `emitToChannel`
   * faria o próprio autor receber o próprio "está digitando". Então o navegador
   * continua sendo servido por `client.to`, e o gateway dos bots é avisado por
   * aqui.
   *
   * Não use isto para nada mais: se o evento vai para o navegador, ele tem que
   * passar por um dos `emit*` — é lá que a notificação anda junto sem ninguém
   * precisar lembrar.
   */
  notificarOuvintes(alvo: AlvoDoEvento, evento: string, dado: unknown) {
    this.notificar(alvo, evento, dado);
  }

  bind(server: Server) {
    this.server = server;
    // Métrica de sockets: registrada aqui porque é onde o `Server` vive — o
    // /api/metrics não precisa conhecer o gateway. Com adapter Redis o número
    // é **desta instância**; o total é a soma das séries no Prometheus.
    registrarGauge(
      "streamz_sockets_conectados",
      "Sockets WebSocket conectados nesta instância da API",
      () => server.engine?.clientsCount ?? 0,
    );
  }

  /**
   * Emite para todo mundo conectado.
   *
   * Presença e perfil **não** usam mais isto (ver `emitToRelated`): um
   * broadcast global por login/logout é O(online) por evento e O(N²) na
   * reconexão em massa depois de um deploy. Fica para evento que de fato
   * interessa a todos — hoje nenhum caminho de produção chama.
   */
  emitAll(event: string, payload: unknown) {
    this.server?.emit(event, payload);
    this.notificar({ tipo: "todos" }, event, payload);
  }

  /** Emite para a sala pessoal do usuário (`user:<id>`). */
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
    this.notificar({ tipo: "usuario", id: userId }, event, payload);
  }

  /** Emite para vários usuários de uma vez. */
  emitToUsers(userIds: string[], event: string, payload: unknown) {
    if (userIds.length === 0) return;
    this.server?.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
    this.notificar({ tipo: "usuarios", ids: userIds }, event, payload);
  }

  /**
   * Emite um evento sobre o usuário para quem tem relação com ele — o público
   * de `presence.update` e `user.updated`. Ver `emitToRelatedMany`.
   */
  async emitToRelated(userId: string, event: string, payload: unknown): Promise<void> {
    await this.emitToRelatedMany(userId, [[event, payload]]);
  }

  /**
   * Vários eventos para o mesmo público, com uma consulta só (o
   * `updateStatus` manda presença e perfil juntos).
   *
   * O público é quem pode estar **vendo** o usuário na tela: membros dos
   * servidores dele (`guild:<id>`), participantes das conversas diretas e
   * grupos, amigos e pedidos pendentes nos dois sentidos (a lista de pedidos
   * também mostra a bolinha de status) e as outras abas dele (`user:<id>`).
   * Uma chamada `to([...salas])` só: o Socket.IO entrega uma vez ao socket que
   * está em várias dessas salas.
   *
   * Nunca lança: se a consulta falhar, avisa ao menos as abas do próprio
   * usuário — perder a presença de terceiros é melhor que derrubar o
   * connect/disconnect ou a rota de perfil que chamou.
   */
  async emitToRelatedMany(
    userId: string,
    eventos: ReadonlyArray<readonly [event: string, payload: unknown]>,
  ): Promise<void> {
    if (eventos.length === 0) return;
    let salas: string[];
    try {
      salas = await this.salasRelacionadas(userId);
    } catch (erro) {
      this.logger.warn(
        `público de ${userId} indisponível, avisando só as abas dele: ${(erro as Error).message}`,
      );
      salas = [`user:${userId}`];
    }
    for (const [event, payload] of eventos) {
      this.server?.to(salas).emit(event, payload);
      this.notificar({ tipo: "relacionados", userId }, event, payload);
    }
  }

  /**
   * As salas do público de `emitToRelatedMany`, em três consultas paralelas.
   *
   * Conversa é endereçada pela `user:<id>` de cada participante, não pela
   * `channel:<id>`: a sala de usuário existe desde o connect em todo socket,
   * enquanto a de canal depende de alguém ter feito o join na hora certa (DM
   * recém-aberta, grupo em que acabou de ser incluído).
   */
  private async salasRelacionadas(userId: string): Promise<string[]> {
    if (!this.prisma) return [`user:${userId}`];
    const [servidores, participantes, amizades] = await Promise.all([
      this.prisma.guildMember.findMany({ where: { userId }, select: { guildId: true } }),
      // `guildId: null` é o que define conversa (DM e GROUP) — ADR-0001
      this.prisma.channelMember.findMany({
        where: {
          userId: { not: userId },
          channel: { guildId: null, members: { some: { userId } } },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
      // PENDING e ACCEPTED: pedido pendente também aparece com status na web
      this.prisma.friendship.findMany({
        where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
        select: { requesterId: true, addresseeId: true },
      }),
    ]);
    const usuarios = new Set<string>([userId]);
    for (const p of participantes) usuarios.add(p.userId);
    for (const a of amizades) {
      usuarios.add(a.requesterId);
      usuarios.add(a.addresseeId);
    }
    return [
      ...servidores.map((g) => `guild:${g.guildId}`),
      ...[...usuarios].map((id) => `user:${id}`),
    ];
  }

  /** Emite para a sala de um canal (`channel:<id>`). */
  emitToChannel(channelId: string, event: string, payload: unknown) {
    this.server?.to(`channel:${channelId}`).emit(event, payload);
    this.notificar({ tipo: "canal", id: channelId }, event, payload);
  }

  /**
   * Emite para a sala de um canal **sem** avisar os ouvintes locais.
   *
   * O espelho de `notificarOuvintes`, e existe por um caso só, também: a
   * reação. Pôr ou tirar uma reação continua mandando `message.updated` com a
   * mensagem inteira para o navegador — é o que o site e o desktop já
   * instalado escutam —, mas o gateway dos bots **não** pode ver esse evento:
   * traduzido, ele viraria um `MESSAGE_UPDATE` do Discord por reação, que é
   * justamente o defeito que o `reaction.added`/`reaction.removed` conserta
   * (§7 de `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md`).
   *
   * Quem chama isto tem de emitir, logo em seguida, o evento fino pelo
   * `emitToChannel` — senão o bot fica sem saber que algo aconteceu. O par
   * está num lugar só: `messages/eventos-de-reacao.ts`.
   *
   * Não use para nada mais. Evento que o navegador recebe e o bot também tem
   * que passar por `emitToChannel`.
   */
  emitToChannelSemOuvintes(channelId: string, event: string, payload: unknown) {
    this.server?.to(`channel:${channelId}`).emit(event, payload);
  }

  /** Emite para os membros de um servidor (`guild:<id>`). */
  emitToGuild(guildId: string, event: string, payload: unknown) {
    this.server?.to(`guild:${guildId}`).emit(event, payload);
    this.notificar({ tipo: "servidor", id: guildId }, event, payload);
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
