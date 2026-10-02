import { Injectable, Logger } from "@nestjs/common";
import { WS_EVENTS, type UserStatus } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import {
  MemoryPresenceStore,
  RedisPresenceStore,
  type PresenceStore,
} from "../gateway/presence.store";
import { redisClient } from "./redis";
import { RealtimeService } from "./realtime.service";

/**
 * Presença (online/offline) por contagem de conexões.
 *
 * Mora aqui, e não dentro do `ChatGateway`, porque há **dois** tipos de conexão
 * que contam como "estar online": o socket do app (Socket.IO) e o WebSocket do
 * gateway compatível com o Discord, por onde os bots conectam. Com a contagem
 * presa ao `ChatGateway`, bot nenhum jamais passava por `markOnline` e aparecia
 * OFFLINE para sempre. Uma instância só do store garante que as duas fontes
 * somem na mesma contagem (um usuário com app aberto e um processo de bot
 * continua online ao fechar só um deles).
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  /** Conexões por usuário: em memória ou no Redis (várias instâncias). */
  private readonly store: PresenceStore = (() => {
    const redis = redisClient();
    return redis ? new RedisPresenceStore(redis) : new MemoryPresenceStore();
  })();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Presença não sobrevive a uma queda: se a API cair, quem estava ONLINE
   * ficaria ONLINE no banco até reconectar. No boot, sem nenhuma conexão viva
   * registrada (nenhuma outra instância), zera todo mundo para OFFLINE.
   */
  async zerarNoBoot() {
    if (await this.store.isEmpty()) {
      const r = await this.prisma.user.updateMany({
        where: { status: { not: "OFFLINE" } },
        data: { status: "OFFLINE" },
      });
      if (r.count > 0) {
        this.logger.log(`Presença zerada no boot: ${r.count} usuário(s) → OFFLINE`);
      }
    }
  }

  /** Primeira conexão do usuário → status escolhido (ou ONLINE) + broadcast. */
  async markOnline(userId: string) {
    const total = await this.store.connect(userId);
    if (total === 1) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { manualStatus: true, manualStatusExpiresAt: true },
      });
      // status manual vencido enquanto offline: ignora e limpa (o job por minuto
      // não alcança quem estava desconectado)
      const vencido = !!u?.manualStatusExpiresAt && u.manualStatusExpiresAt.getTime() <= Date.now();
      if (vencido) {
        await this.prisma.user
          .update({ where: { id: userId }, data: { manualStatus: null, manualStatusExpiresAt: null } })
          .catch(() => {});
      }
      await this.setStatus(userId, (vencido ? null : u?.manualStatus) ?? "ONLINE");
    }
  }

  /** Última conexão fechada → OFFLINE + broadcast. */
  async markOffline(userId: string) {
    const total = await this.store.disconnect(userId);
    if (total === 0) {
      // ── d-social ── carimba o "visto por último" que o perfil mostra; só na
      // última conexão, senão fechar uma aba já reescreveria o valor
      await this.prisma.user
        .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
      await this.setStatus(userId, "OFFLINE");
    }
  }

  private async setStatus(userId: string, status: UserStatus) {
    await this.prisma.user.update({ where: { id: userId }, data: { status } }).catch(() => {});
    // só para quem pode estar vendo este usuário (servidores, conversas,
    // amigos): broadcast global aqui era O(online) por login/logout e O(N²)
    // na reconexão em massa depois de um deploy
    await this.realtime.emitToRelated(userId, WS_EVENTS.PRESENCE_UPDATE, { userId, status });
  }
}
