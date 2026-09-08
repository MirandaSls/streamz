import { Controller } from "@nestjs/common";

/**
 * Os followups de uma interação — o `editReply()`, o `fetchReply()` e o
 * `followUp()` do discord.js.
 *
 * ── Lote B (REST compat) implementa. ──
 *
 * ```
 * POST   /api/v10/webhooks/:app/:token                        → mensagem nova
 * GET    /api/v10/webhooks/:app/:token/messages/@original
 * PATCH  /api/v10/webhooks/:app/:token/messages/@original     → edita o "pensando…"
 * DELETE /api/v10/webhooks/:app/:token/messages/@original
 * ```
 *
 * Como no callback, **sem `BotTokenGuard`**: o token do caminho é o único
 * credencial (§9 do documento). O `:app` tem que bater com o snowflake da
 * `Application` da interação; não batendo, 404 `10062` — e não 403, porque para
 * quem não tem o token a interação não existe.
 *
 * `/messages/:mid` (um followup específico, que não o original) é **F5**: 501.
 * O `editReply()` e o `deleteReply()` do discord.js usam `@original`, que é o
 * que a prova 3 da fase exercita.
 *
 * Cuidado com a ordem das rotas no Nest: `/@original` tem que ser declarado
 * **antes** de qualquer `/:mid`, senão o `@original` casa como um id.
 */
@Controller()
export class WebhooksCompatController {}

@Controller()
export class WebhooksCompatControllerV9 extends WebhooksCompatController {}
