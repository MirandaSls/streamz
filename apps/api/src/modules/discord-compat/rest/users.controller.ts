import { Controller, Get, Param, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import { usuarioDesconhecido, FiltroDeErrosDoDiscord } from "../erros";
import { IdsService } from "../ids.service";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { BotAutenticado, UsuarioDoDiscord } from "../tipos";
import { usuarioParaDiscord } from "../traducao/usuario";
import { BotAtual } from "./bot-atual";

/**
 * `GET /api/v10/users/@me` e `GET /api/v10/users/:id`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * O `@me` é a **prova 1 da fase** e a rota mais simples: o guard já pôs o bot
 * em `req.bot`, então é ler o `User` e traduzir. Atenção à ordem das rotas no
 * Nest: `@me` precisa ser declarado **antes** de `:id`, senão `:id` o captura.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/users")
export class UsersCompatController {
  constructor(
    private readonly dados: DadosDeCompatService,
    private readonly ids: IdsService,
  ) {}

  // `@me` antes de `:id`: o Nest casa na ordem de declaração, e `:id` capturaria
  // a string literal "@me" se viesse primeiro
  @Get("@me")
  async eu(@BotAtual() bot: BotAutenticado): Promise<UsuarioDoDiscord> {
    const usuario = await this.dados.usuarioPorCuid(bot.botUserId);
    if (!usuario) throw usuarioDesconhecido();
    return usuarioParaDiscord(usuario);
  }

  @Get(":id")
  async porId(@Param("id") id: string): Promise<UsuarioDoDiscord> {
    const cuid = await this.ids.cuidDeUsuario(id);
    const usuario = cuid ? await this.dados.usuarioPorCuid(cuid) : null;
    if (!usuario) throw usuarioDesconhecido();
    return usuarioParaDiscord(usuario);
  }
}

@Controller("v9/users")
export class UsersCompatControllerV9 extends UsersCompatController {}
