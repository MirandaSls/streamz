import { Controller, Get, HttpCode, Param } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { UpdatesService, type ManifestoDeAtualizacao } from "./updates.service";

/**
 * O feed de atualização do app de desktop.
 *
 * **Rota aberta, e precisa ser**: quem consulta é um app recém-aberto, que pode
 * nem ter sessão — e negar atualização a quem está deslogado é a receita para
 * uma versão velha ficar velha para sempre. O que protege o canal não é
 * autenticação, é a assinatura do pacote (ver `UpdatesService`).
 *
 * Fora do rate limit pelo mesmo motivo do `/health`: a consulta é uma por
 * abertura do app, e um escritório inteiro atrás do mesmo IP não pode estourar
 * o teto e ficar sem atualizar.
 *
 * O formato da rota — `/:target/:arch/:version` — é o que o atualizador do
 * Tauri monta a partir do endpoint configurado. Não é escolha nossa.
 */
@SkipThrottle()
@Controller("updates")
export class UpdatesController {
  constructor(private readonly updates: UpdatesService) {}

  @Get(":target/:arch/:version")
  // 204 é o "está em dia" do protocolo do Tauri: corpo vazio, sem erro
  @HttpCode(200)
  buscar(
    @Param("target") target: string,
    @Param("arch") arch: string,
    @Param("version") version: string,
  ): ManifestoDeAtualizacao | undefined {
    const manifesto = this.updates.manifesto(`${target}-${arch}`, version);
    // devolver `undefined` faz o Nest responder 204 sem corpo
    return manifesto ?? undefined;
  }
}
