import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { zodBody } from "../../../common/zod.pipe";
import { DMsService } from "../../dms/dms.service";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import { canalDesconhecido, usuarioDesconhecido, FiltroDeErrosDoDiscord } from "../erros";
import { IdsService } from "../ids.service";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { BotAutenticado, CanalDoDiscord, UsuarioDoDiscord } from "../tipos";
import { canalParaDiscord } from "../traducao/canal";
import { usuarioParaDiscord } from "../traducao/usuario";
import { abrirDmSchema, type CorpoDeAbrirDm } from "./corpos-membros";
import { BotAtual } from "./bot-atual";

/**
 * `GET /api/v10/users/@me` e `GET /api/v10/users/:id`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * O `@me` é a **prova 1 da fase** e a rota mais simples: o guard já pôs o bot
 * em `req.bot`, então é ler o `User` e traduzir. Atenção à ordem das rotas no
 * Nest: `@me` precisa ser declarado **antes** de `:id`, senão `:id` o captura.
 *
 * ── F5 membros ── `POST /users/@me/channels` abre a DM com alguém: é o que o
 * `user.send()` do discord.js faz por baixo (ele chama esta rota e só então
 * `POST /channels/:id/messages`). Ver a rota.
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
    private readonly dms: DMsService,
  ) {}

  // `@me` antes de `:id`: o Nest casa na ordem de declaração, e `:id` capturaria
  // a string literal "@me" se viesse primeiro
  @Get("@me")
  async eu(@BotAtual() bot: BotAutenticado): Promise<UsuarioDoDiscord> {
    const usuario = await this.dados.usuarioPorCuid(bot.botUserId);
    if (!usuario) throw usuarioDesconhecido();
    return usuarioParaDiscord(usuario);
  }

  /**
   * Abre (ou reabre) a conversa direta do bot com alguém.
   *
   * `{ recipient_id }` → o canal de DM no formato do Discord. É a primeira
   * metade do `user.send("oi")`: a lib chama esta rota, guarda o `id` do canal
   * e escreve nele pelo `POST /channels/:id/messages` que já existe desde a F1.
   *
   * `DMsService.openWith` é get-or-create de verdade (upsert por `pairKey`),
   * então chamar duas vezes devolve o mesmo canal — que é o contrato do
   * Discord. E é ele quem aplica a barreira do **bloqueio**: quem bloqueou o
   * bot não recebe DM dele, e o `ForbiddenException` vira 50013.
   *
   * A resposta é montada relendo o canal com o snowflake junto
   * (`canalPorCuid`), porque o `DMChannelView` do service fala em cuid. O
   * `recipients` sai de lá — e é o campo que o `DMChannel` do discord.js lê
   * (`data.recipients[0].id`) para saber com quem a conversa é.
   */
  @Post("@me/channels")
  async abrirDm(
    @BotAtual() bot: BotAutenticado,
    @Body(zodBody(abrirDmSchema)) corpo: CorpoDeAbrirDm,
  ): Promise<CanalDoDiscord> {
    const alvo = await this.ids.cuidDeUsuario(corpo.recipient_id);
    if (!alvo) throw usuarioDesconhecido();

    const conversa = await this.dms.openWith(bot.botUserId, alvo);
    const canal = await this.dados.canalPorCuid(conversa.id);
    if (!canal) throw canalDesconhecido();
    return canalParaDiscord(canal);
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
