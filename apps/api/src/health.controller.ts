import { Controller, Get, Header, HttpCode, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "./prisma/prisma.service";
import { redisClient, redisUrl } from "./modules/realtime/redis";
import {
  registrarGauge,
  registrarGaugesDeProcesso,
  renderizarMetricas,
} from "./common/metrics";

/**
 * Sondas e métricas da API.
 *
 * A separação entre `/health` e `/ready` é o que evita o pior modo de falha de
 * orquestrador: se a única sonda consulta o banco, uma indisponibilidade
 * momentânea do Postgres faz o Kubernetes/Railway **matar e reiniciar** todas as
 * instâncias (liveness falhou) em vez de só tirá-las do balanceador.
 *
 *   - `GET /api/health` — liveness. O processo respondeu, logo está vivo. Não
 *     toca em dependência nenhuma e nunca falha por causa delas.
 *   - `GET /api/ready` — readiness. Checa Postgres e, se `REDIS_URL` existir,
 *     Redis. Responde 503 quando alguma dependência está fora.
 *   - `GET /api/metrics` — exposição Prometheus.
 *
 * Todas as três ficam fora do rate limit (`@SkipThrottle`): a sonda bate a cada
 * poucos segundos e não pode competir com o teto por IP do tráfego real.
 */
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {
    registrarGaugesDeProcesso();
    // Taxa de mensagens medida direto no banco: é a fonte de verdade, funciona
    // com várias instâncias (um contador em memória só veria as próprias) e
    // custa uma contagem indexada por scrape.
    registrarGauge(
      "streamz_messages_last_minute",
      "Mensagens criadas nos últimos 60 segundos (todas as instâncias)",
      () =>
        this.prisma.message.count({
          where: { createdAt: { gte: new Date(Date.now() - 60_000) } },
        }),
    );
  }

  @Get("health")
  check() {
    return {
      status: "ok",
      service: "streamz-api",
      version: process.env.APP_VERSION ?? "dev",
      uptime: Math.round(process.uptime()),
      ts: new Date().toISOString(),
    };
  }

  @Get("ready")
  // Tipagem estrutural em vez de `Response` do express: a api não depende de
  // `@types/express` e só precisa de `status` aqui.
  async ready(@Res({ passthrough: true }) res: { status(codigo: number): unknown }) {
    const [postgres, redis] = await Promise.all([this.checarPostgres(), this.checarRedis()]);
    const pronto = postgres.ok && redis.ok;
    // 503 (e não 500): "ainda não me mande tráfego", não "quebrei".
    res.status(pronto ? 200 : 503);
    return { status: pronto ? "ready" : "unavailable", checks: { postgres, redis } };
  }

  @Get("metrics")
  @HttpCode(200)
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  @Header("Cache-Control", "no-store")
  metrics() {
    return renderizarMetricas();
  }

  private async checarPostgres(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Sem `REDIS_URL` o Redis é opcional por decisão de arquitetura — logo, pronto. */
  private async checarRedis(): Promise<{ ok: boolean; detail?: string }> {
    if (!redisUrl()) return { ok: true, detail: "não configurado" };
    try {
      const cliente = redisClient();
      if (!cliente) return { ok: true, detail: "não configurado" };
      await cliente.ping();
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }
}
