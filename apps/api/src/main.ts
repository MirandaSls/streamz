import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { CORS_OPTIONS } from "./common/cors";
import { StructuredLogger, requestIdMiddleware } from "./common/logger";
import { metricsMiddleware } from "./common/metrics";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Log estruturado desde o boot: erro de validação de ambiente também sai
    // no mesmo formato que o agregador entende (ver common/logger.ts).
    logger: new StructuredLogger(),
  });

  // Atrás de proxy (Caddy, Railway, Fly) o IP visto pelo Node é o do proxy.
  // Sem `trust proxy`, `req.ip` colapsa todo mundo num IP só e o rate limit
  // por IP passa a punir o tráfego inteiro junto. Fica **desligado por padrão**
  // porque confiar no `X-Forwarded-For` sem proxy na frente é o contrário:
  // qualquer cliente forja o próprio IP e escapa do teto.
  const trustProxy = resolverTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy !== null) app.set("trust proxy", trustProxy);

  // Antes de tudo: id por requisição (propagado aos logs e devolvido no header)
  // e contagem para o /api/metrics.
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware);

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors(CORS_OPTIONS);

  // SIGTERM (o sinal que Docker/Kubernetes/Railway mandam) passa a fechar
  // conexões do Prisma e do Socket.IO em vez de o processo morrer no meio de
  // uma transação.
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3333);
  // 0.0.0.0 é obrigatório dentro do contêiner: preso ao loopback, o mapeamento
  // de porta do Docker não alcança o processo.
  await app.listen(port, process.env.API_HOST ?? "0.0.0.0");
  new Logger("Bootstrap").log(`API no ar em http://localhost:${port}/api`);
}

/**
 * `TRUST_PROXY` aceita o mesmo vocabulário do Express: número de saltos
 * ("1" atrás de um proxy), lista de IPs/CIDRs confiáveis, ou "true"/"false".
 * Devolve `null` quando não há nada a configurar.
 */
function resolverTrustProxy(valor: string | undefined): boolean | number | string | null {
  const bruto = valor?.trim();
  if (!bruto) return null;
  if (/^(false|0|off|no)$/i.test(bruto)) return null;
  if (/^(true|on|yes)$/i.test(bruto)) return true;
  if (/^\d+$/.test(bruto)) return Number(bruto);
  return bruto;
}

bootstrap();
