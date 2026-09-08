import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { DiretorioService } from "./diretorio.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

/**
 * "Descobrir aplicativos" — as duas rotas de leitura do diretório.
 *
 * ── j-bots · F4, lote B ──
 *
 * ## Por que um controller separado, com o mesmo prefixo
 *
 * O §3.2 do `CONTRATO-F4.md` põe estas duas rotas "no mesmo
 * `@Controller("applications")`", mas o §1 do mesmo contrato dá o arquivo
 * `applications.controller.ts` ao **lote A**, e diz que o lote B toca em
 * `applications.module.ts` só nos arrays `controllers:` e `providers:`. As duas
 * frases não cabem juntas num arquivo só. Um segundo controller com o mesmo
 * prefixo resolve as duas: o Nest aceita, o lote A e o lote B não se cruzam, e
 * o merge não tem conflito. A divergência está no PR.
 *
 * ## A ordem de declaração, que é obrigatória
 *
 * **`@Get("publicas")` vem ANTES de `@Get(":id")`.** O Nest registra os
 * handlers na ordem em que aparecem no protótipo, e o Express casa o primeiro
 * padrão que serve: ao contrário, `publicas` casaria com `:id`, viraria um cuid
 * que não existe, e o **diretório inteiro** responderia 404 — sem erro nenhum
 * no log, porque do ponto de vista do servidor é só um id desconhecido.
 *
 * `diretorio.spec.ts` prende isso lendo os metadados de rota do protótipo, que
 * é a mesma lista que o `MetadataScanner` do Nest percorre. Não reordene os
 * dois métodos abaixo sem olhar aquele teste.
 *
 * As rotas de escrita do portal (`PATCH`, `DELETE`, o ícone, os servidores)
 * são do lote A e moram no `ApplicationsController`. Não há colisão: `@Get(":id")`
 * casa **um** segmento, e `@Get(":id/servidores")` casa dois.
 */
@Controller("applications")
export class DiretorioController {
  constructor(private readonly diretorio: DiretorioService) {}

  /**
   * A grade do diretório: só os aplicativos publicados.
   *
   * ⚠️ Tem que continuar sendo o **primeiro** `@Get` deste controller. Ver o
   * cabeçalho da classe.
   */
  @UseGuards(JwtGuard)
  @Get("publicas")
  publicas(
    @Query("q") q?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const teto = limit === undefined ? undefined : Number.parseInt(limit, 10);
    return this.diretorio.listarPublicas(q, cursor, Number.isNaN(teto as number) ? undefined : teto);
  }

  /**
   * A página de um aplicativo. Público, ou meu; caso contrário **404**.
   *
   * 404 e não 403 de propósito: um 403 confirmaria que o id existe, e a
   * privacidade de um app que o dono ainda não publicou inclui a existência
   * dele.
   */
  @UseGuards(JwtGuard)
  @Get(":id")
  porId(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.diretorio.porId(user.sub, id);
  }
}
