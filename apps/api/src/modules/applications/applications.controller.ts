import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { appCriarSchema, type AppCriarInput } from "@streamz/shared";
import { ApplicationsService } from "./applications.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { zodBody } from "../../common/zod.pipe";
import { APP_CREATE_THROTTLE } from "../../common/throttle";

/**
 * Portal do desenvolvedor — o REST **interno**, autenticado como usuário
 * normal (`Authorization: Bearer`, `JwtGuard`).
 *
 * Não confundir com `/api/v10/**`, a casca de compatibilidade que a fase
 * seguinte monta e que fala `Authorization: Bot <token>`. Aqui quem chama é o
 * dono do bot, pelo navegador; lá é o bot.
 *
 * O corpo é validado por zod (`appCriarSchema`) e não por `class-validator`
 * porque o contrato já existe em `@streamz/shared` e a web usa o mesmo schema
 * para recusar antes do round-trip — é o padrão das rotas de conta.
 */
@Controller("applications")
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  /**
   * Cria o aplicativo. A resposta traz o token em claro — **a única vez**.
   *
   * Teto próprio: cada chamada cria uma conta de usuário (a do bot), então a
   * rota é uma fábrica de contas com outro nome.
   */
  @UseGuards(JwtGuard)
  @APP_CREATE_THROTTLE
  @Post()
  criar(@CurrentUser() user: JwtPayload, @Body(zodBody(appCriarSchema)) body: AppCriarInput) {
    return this.apps.criar(user.sub, body.name);
  }

  /** Os meus aplicativos. O token nunca vem aqui: só o prefixo de 8 caracteres. */
  @UseGuards(JwtGuard)
  @Get()
  listar(@CurrentUser() user: JwtPayload) {
    return this.apps.listarMinhas(user.sub);
  }

  /**
   * Regenera o token e revoga o anterior. A resposta traz o novo em claro.
   *
   * `POST` e não `PATCH` porque o efeito não é editar um campo: é emitir uma
   * credencial nova e derrubar o bot que estiver usando a antiga.
   */
  @UseGuards(JwtGuard)
  @APP_CREATE_THROTTLE
  @Post(":id/token")
  regenerar(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.apps.regenerarToken(user.sub, id);
  }
}
