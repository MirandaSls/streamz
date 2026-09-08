import { Controller, Get, Param, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { BotTokenGuard } from "../bot-token.guard";
import { FiltroDeErrosDoDiscord } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { CanalDoDiscord, CargoDoDiscord, JsonDoDiscord, MembroDoDiscord } from "../tipos";

/**
 * `GET /api/v10/guilds/:id` e os três filhos que a F1 precisa.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * | Rota | Nota |
 * |---|---|
 * | `GET /guilds/:id` | forma reduzida (`servidorParaDiscord(g, false)`) |
 * | `GET /guilds/:id/channels` | **inclui as categorias como tipo 4** |
 * | `GET /guilds/:id/members/:uid` | |
 * | `GET /guilds/:id/roles` | o `@everyone` sai com `id == guild.id` |
 *
 * Todas checam antes que o **usuário-bot é membro** do servidor: bot fora dele
 * leva `10004 Unknown Guild` (e não 403 — o Discord não confirma a existência
 * de um servidor de que o bot não participa).
 */
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/guilds")
export class GuildsCompatController {
  @Get(":id")
  servidor(@Param("id") _id: string): Promise<JsonDoDiscord> {
    throw new Error("F1 lote A: GuildsCompatController.servidor não implementado");
  }

  @Get(":id/channels")
  canais(@Param("id") _id: string): Promise<CanalDoDiscord[]> {
    throw new Error("F1 lote A: GuildsCompatController.canais não implementado");
  }

  @Get(":id/roles")
  cargos(@Param("id") _id: string): Promise<CargoDoDiscord[]> {
    throw new Error("F1 lote A: GuildsCompatController.cargos não implementado");
  }

  @Get(":id/members/:uid")
  membro(@Param("id") _id: string, @Param("uid") _uid: string): Promise<MembroDoDiscord> {
    throw new Error("F1 lote A: GuildsCompatController.membro não implementado");
  }
}

@Controller("v9/guilds")
export class GuildsCompatControllerV9 extends GuildsCompatController {}
