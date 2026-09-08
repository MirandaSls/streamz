import { Controller, Get, Param, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { BotTokenGuard } from "../bot-token.guard";
import { FiltroDeErrosDoDiscord } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { UsuarioDoDiscord } from "../tipos";

/**
 * `GET /api/v10/users/@me` e `GET /api/v10/users/:id`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * O `@me` é a **prova 1 da fase** e a rota mais simples: o guard já pôs o bot
 * em `req.bot`, então é ler o `User` e traduzir. Atenção à ordem das rotas no
 * Nest: `@me` precisa ser declarado **antes** de `:id`, senão `:id` o captura.
 */
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/users")
export class UsersCompatController {
  @Get("@me")
  eu(): Promise<UsuarioDoDiscord> {
    throw new Error("F1 lote A: UsersCompatController.eu não implementado");
  }

  @Get(":id")
  porId(@Param("id") _id: string): Promise<UsuarioDoDiscord> {
    throw new Error("F1 lote A: UsersCompatController.porId não implementado");
  }
}

@Controller("v9/users")
export class UsersCompatControllerV9 extends UsersCompatController {}
