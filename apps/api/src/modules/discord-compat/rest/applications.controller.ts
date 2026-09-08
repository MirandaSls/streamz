import { Controller, Get, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { BotTokenGuard } from "../bot-token.guard";
import { FiltroDeErrosDoDiscord } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { JsonDoDiscord } from "../tipos";

/**
 * `GET /api/v10/applications/@me`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * `{id, name, description, icon: null, bot_public: false,
 *   bot_require_code_grant: false, flags: 0, bot: <user do bot>, owner: …}`.
 * O discord.js instancia `ClientApplication` com o `application` do READY e
 * completa por aqui quando alguém toca em `client.application.fetch()`.
 *
 * Não confundir com `/api/applications` (sem `v10`), que é o REST **interno**
 * da F0, autenticado com `Bearer` pelo dono do bot.
 */
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/applications")
export class ApplicationsCompatController {
  @Get("@me")
  eu(): Promise<JsonDoDiscord> {
    throw new Error("F1 lote A: ApplicationsCompatController.eu não implementado");
  }
}

@Controller("v9/applications")
export class ApplicationsCompatControllerV9 extends ApplicationsCompatController {}
