import { Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import {
  downloadTokenSchema,
  type DownloadAutorizado,
  type DownloadCatalogo,
  type DownloadTokenInput,
} from "@streamz/shared";
import { DownloadsService } from "./downloads.service";
import { zodBody } from "../../common/zod.pipe";
import { DOWNLOAD_SENHA_THROTTLE } from "../../common/throttle";

/**
 * Só o que esta rota usa da resposta do Express.
 *
 * O tipo completo viria de `@types/express`, que não é dependência direta da
 * api — o proxy de anexos (`uploads.controller.ts`) usa `node:http` pelo mesmo
 * motivo. Declarar a forma estrutural evita trazer o pacote inteiro por causa
 * de dois métodos, e falha no typecheck do mesmo jeito se eles mudarem.
 */
interface RespostaDeArquivo {
  setHeader(nome: string, valor: string): void;
  download(caminho: string, filename: string): void;
}

/**
 * Página de download do app protegida por senha única.
 *
 * Todas as rotas são públicas (não há conta envolvida) e a autorização é a
 * senha, conferida no servidor. O fluxo é em dois passos — senha vira token,
 * token vira arquivo — porque o download em si é uma **navegação** do browser,
 * que não manda header `Authorization`. É o mesmo desenho do proxy de anexos
 * (`StorageService.attachmentUrl`), com a mesma consequência: o link é uma
 * capacidade de curta duração, não um endereço permanente.
 */
@Controller("downloads")
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  /** Quais sistemas têm instalador — o seletor da página se monta com isto. */
  @Get()
  catalogo(): Promise<DownloadCatalogo> {
    return this.downloads.catalogo();
  }

  /** Confere a senha e devolve o link temporário. */
  @Post("token")
  @DOWNLOAD_SENHA_THROTTLE
  autorizar(
    @Body(zodBody(downloadTokenSchema)) dto: DownloadTokenInput,
  ): Promise<DownloadAutorizado> {
    return this.downloads.autorizar(dto.senha, dto.plataforma);
  }

  /**
   * Entrega o arquivo. Só responde com o token curto emitido acima.
   *
   * Usa `res.download` do Express (e não um pipe manual) porque ele já trata
   * `Range` e `If-Modified-Since`: instalador é arquivo grande, e sem isso um
   * download interrompido recomeça do zero.
   */
  @Get("arquivo")
  async baixar(
    @Query("t") token: string | undefined,
    @Res() res: RespostaDeArquivo,
  ): Promise<void> {
    const arquivo = await this.downloads.arquivoDoToken(token);

    res.setHeader("X-Content-Type-Options", "nosniff");
    // "private, no-store": a resposta depende de um token de 2 minutos e não
    // pode ficar num cache compartilhado servindo quem nunca digitou a senha
    res.setHeader("Cache-Control", "private, no-store");
    res.download(arquivo.caminho, arquivo.filename);
  }
}
