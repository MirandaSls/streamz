import { Controller, Get, HttpCode, Param, Post, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { BotTokenGuard } from "../bot-token.guard";
import { FiltroDeErrosDoDiscord } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { CanalDoDiscord } from "../tipos";

/**
 * `GET /api/v10/channels/:id` e `POST /api/v10/channels/:id/typing`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * O `:id` pode ser um `Channel` **ou** uma `Category` (categoria no Discord é
 * canal, tipo 4) — use `IdsService.cuidDeCanalOuCategoria`. É o detalhe do §4
 * que é fácil esquecer e que faz `parent_id` apontar para o nada.
 *
 * `typing` responde **204 sem corpo** e emite `typing` pelo `RealtimeService`,
 * como o gateway do web faz.
 */
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/channels")
export class ChannelsCompatController {
  @Get(":id")
  canal(@Param("id") _id: string): Promise<CanalDoDiscord> {
    throw new Error("F1 lote A: ChannelsCompatController.canal não implementado");
  }

  @Post(":id/typing")
  @HttpCode(204)
  digitando(@Param("id") _id: string): Promise<void> {
    throw new Error("F1 lote A: ChannelsCompatController.digitando não implementado");
  }
}

@Controller("v9/channels")
export class ChannelsCompatControllerV9 extends ChannelsCompatController {}
