import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { appInstalarSchema, type AppInstalarInput } from "@streamz/shared";
import { InstalacaoService } from "./instalacao.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { zodBody } from "../../common/zod.pipe";

/**
 * Os aplicativos **de um servidor**: listar, instalar, remover.
 *
 * ── j-bots · F4, lote B ──
 *
 * O recurso é "o app instalado *naquele* servidor", e por isso a família de
 * três verbos mora numa rota só. O §11 do documento previa
 * `POST /applications/:id/instalar`; a divergência está registrada no §8 do
 * `CONTRATO-F4.md`, e o motivo é a aba "Aplicativos" das configurações do
 * servidor, que precisa **listar** e **remover** — duas operações que um verbo
 * chamado `instalar` não acomoda sem inventar outra grafia para cada uma.
 *
 * REST **interno** (`JwtGuard`, `Authorization: Bearer`): quem chama é quem
 * administra o servidor, pelo navegador. Não confundir com `/api/v10/**`, a
 * casca de compatibilidade, que fala `Authorization: Bot`.
 *
 * As três exigem `MANAGE_GUILD`, e a checagem é a **primeira linha** de cada
 * método do service — não um guard aqui. É de propósito: um guard que resolva
 * permissão de servidor teria de repetir o cálculo que o `GuildsService` já faz
 * (ADR-0002, ponto único de autorização), e uma segunda cópia dessa regra é
 * como as duas divergem.
 */
@Controller("guilds/:guildId/aplicativos")
export class InstalacaoController {
  constructor(private readonly instalacao: InstalacaoService) {}

  /** Os aplicativos instalados aqui — a aba "Aplicativos" do servidor. */
  @UseGuards(JwtGuard)
  @Get()
  listar(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.instalacao.listar(user.sub, guildId);
  }

  /**
   * Instala: cria o cargo gerenciado, o membro-bot e a autorização.
   *
   * Instalar de novo o mesmo app **edita** as permissões (é o que o Discord
   * faz) em vez de responder 409 — ver o `InstalacaoService.instalar`.
   */
  @UseGuards(JwtGuard)
  @Post()
  instalar(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body(zodBody(appInstalarSchema)) body: AppInstalarInput,
  ) {
    return this.instalacao.instalar(user.sub, guildId, body.applicationId, body.permissions);
  }

  /** Remove: o bot sai, o cargo some, o bot conectado recebe `GUILD_DELETE`. */
  @UseGuards(JwtGuard)
  @HttpCode(204)
  @Delete(":applicationId")
  remover(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("applicationId") applicationId: string,
  ) {
    return this.instalacao.remover(user.sub, guildId, applicationId);
  }
}
