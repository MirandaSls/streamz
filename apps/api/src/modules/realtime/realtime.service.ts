import { Injectable, Logger } from "@nestjs/common";
import type { Server } from "socket.io";
import { registrarGauge } from "../../common/metrics";

// ── j-bots ──
/** Onde um evento foi parar: a sala do Socket.IO que o recebeu. */
export type AlvoDoEvento =
  | { tipo: "todos" }
  | { tipo: "usuario"; id: string }
  | { tipo: "usuarios"; ids: string[] }
  | { tipo: "canal"; id: string }
  | { tipo: "servidor"; id: string };

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
 * Os cinco `emit*` também avisam os **ouvintes locais** (`onEvent`); os
 * `join`/`leave` de sala **não**, porque não são eventos — não há nada para
 * traduzir e ninguém do outro lado esperando.
 */
@Injectable()
export class RealtimeService {
  private server?: Server;
  private readonly logger = new Logger(RealtimeService.name);

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

  /** Emite para todo mundo conectado (presença, perfil). */
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

  /** Emite para a sala de um canal (`channel:<id>`). */
  emitToChannel(channelId: string, event: string, payload: unknown) {
    this.server?.to(`channel:${channelId}`).emit(event, payload);
    this.notificar({ tipo: "canal", id: channelId }, event, payload);
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
