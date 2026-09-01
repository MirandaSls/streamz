import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
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
 * Tauri monta a partir do endpoint configurado. Não é escolha nossa. O **204**
 * de "está em dia" também não: um 200 de corpo vazio faz o cliente tentar
 * interpretar nada como JSON e tratar a checagem como erro.
 */
@SkipThrottle()
@Controller("updates")
export class UpdatesController {
  constructor(private readonly updates: UpdatesService) {}

  /**
   * O instalador em si.
   *
   * Aberta, como o manifesto: o atualizador baixa antes de ter qualquer sessão,
   * e a integridade vem da assinatura, não do sigilo do endereço. Declarada
   * **antes** da rota do manifesto porque `arquivo/:nome` tem dois segmentos e
   * a outra tem três — a ordem evita qualquer dúvida de casamento.
   */
  @Get("arquivo/:nome")
  baixar(
    @Param("nome") nome: string,
    @Res() res: { download(caminho: string, nome: string): void },
  ): void {
    const caminho = this.updates.arquivo(nome);
    if (!caminho) throw new NotFoundException("Instalador não encontrado");
    // `download` cuida do 404 quando o arquivo não existe no disco
    res.download(caminho, nome);
  }

  @Get(":target/:arch/:version")
  buscar(
    @Param("target") target: string,
    @Param("arch") arch: string,
    @Param("version") version: string,
    // tipagem estrutural em vez de `Response` do express, como no health
    @Res({ passthrough: true }) res: { status(codigo: number): unknown },
  ): ManifestoDeAtualizacao | undefined {
    const manifesto = this.updates.manifesto(`${target}-${arch}`, version);
    if (!manifesto) {
      // sem isto o Nest responde 200 com corpo vazio, e o atualizador do Tauri
      // trata isso como resposta inválida em vez de "não há nada"
      res.status(204);
      return undefined;
    }
    return manifesto;
  }
}
