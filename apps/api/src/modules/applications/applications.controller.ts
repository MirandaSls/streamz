import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import type { ServerResponse } from "node:http";
import {
  MAX_GUILD_ICON_SIZE,
  appCriarSchema,
  appEditarSchema,
  type AppCriarInput,
  type AppEditarInput,
} from "@streamz/shared";
import { ApplicationsService } from "./applications.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { zodBody } from "../../common/zod.pipe";
import { APP_CREATE_THROTTLE, UPLOAD_THROTTLE } from "../../common/throttle";

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

  // ── j-bots · F4 ── editar, apagar, ícone e "em que servidores"
  //
  // Todas checam o dono no service (`doMeuApp`): **404** para o que não
  // existe, **403** para o de outra pessoa.

  /**
   * O ícone do aplicativo é **público**, como o do servidor: `<img src>` não
   * manda `Authorization`.
   *
   * Declarada antes das rotas de escrita porque ela é a que o navegador chama
   * em rajada (uma por card da lista) e o `SkipThrottle` só faz sentido aqui —
   * o teto global de 300/min estouraria numa lista de dez aplicativos abertos
   * duas vezes.
   */
  @SkipThrottle()
  @Get(":id/icone")
  async icone(@Param("id") id: string, @Res() res: ServerResponse) {
    const { body, contentType } = await this.apps.iconeStream(id);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    body.on("error", () => res.destroy());
    body.pipe(res);
  }

  /** Nome, descrição, "Publicar no diretório" e as permissões sugeridas. */
  @UseGuards(JwtGuard)
  @Patch(":id")
  editar(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(zodBody(appEditarSchema)) body: AppEditarInput,
  ) {
    return this.apps.editar(user.sub, id, body);
  }

  /**
   * Apaga o aplicativo, o usuário-bot e, com ele, tokens e comandos.
   *
   * 204 e não o registro apagado: não sobrou registro nenhum para devolver, e
   * a tela do portal já tirou a linha da lista.
   */
  @UseGuards(JwtGuard)
  @HttpCode(204)
  @Delete(":id")
  apagar(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.apps.apagar(user.sub, id);
  }

  /** Ícone do aplicativo. 503 claro sem R2 configurado. */
  @UseGuards(JwtGuard)
  @UPLOAD_THROTTLE
  @Post(":id/icone")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_GUILD_ICON_SIZE } }))
  atualizarIcone(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer; size: number },
  ) {
    return this.apps.atualizarIcone(user.sub, id, file);
  }

  /** Remove o ícone. Devolve o `AppDetalhe` já sem `iconUrl`. */
  @UseGuards(JwtGuard)
  @Delete(":id/icone")
  removerIcone(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.apps.removerIcone(user.sub, id);
  }

  /** Tela "Servidores" do portal: onde este aplicativo meu está instalado. */
  @UseGuards(JwtGuard)
  @Get(":id/servidores")
  servidores(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.apps.servidoresComOApp(user.sub, id);
  }
}
