import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Observable } from "rxjs";

/**
 * Os cabeçalhos `X-RateLimit-*` que o `@discordjs/rest` usa para montar os
 * buckets por rota.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * Se eles não vierem, a lib **não quebra** (trata a rota como sem limite), mas
 * perde o enfileiramento e, num 429 sem `retry_after`, entra em retry cego.
 * Então mandamos sempre:
 *
 * ```
 * X-RateLimit-Limit: 50
 * X-RateLimit-Remaining: 47
 * X-RateLimit-Reset: 1789045123.482      # epoch em segundos, com fração
 * X-RateLimit-Reset-After: 0.518         # segundos
 * X-RateLimit-Bucket: <string opaca e estável por rota+recurso>
 * ```
 *
 * E no 429: `Retry-After`, `X-RateLimit-Scope: user`, e o corpo
 * `{"message":"You are being rate limited.","retry_after":0.734,"global":false}`
 * — `retry_after` é **float em segundos**. Errar a unidade faz o bot dormir 700
 * segundos.
 *
 * A contagem é por `bot:<applicationId>`, teto de 50 req/s (o mesmo do
 * Discord), reaproveitando o storage Redis do `@nestjs/throttler` que já está
 * configurado. Ver §5, "Rate limit".
 */
@Injectable()
export class RateLimitDoDiscordInterceptor implements NestInterceptor {
  intercept(_contexto: ExecutionContext, _proximo: CallHandler): Observable<unknown> {
    throw new Error("F1 lote A: RateLimitDoDiscordInterceptor não implementado");
  }
}
