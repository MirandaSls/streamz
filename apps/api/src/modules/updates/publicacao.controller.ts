import { Body, Controller, HttpCode, Post, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { UPLOAD_THROTTLE } from "../../common/throttle";
import { PlatformAdminGuard } from "../admin/admin.guard";
import { armazenamentoDeEnvio, type ArquivoRecebido } from "./armazenamento-de-envio";
import {
  PublicacaoMacosService,
  type ResultadoDaPublicacaoMacos,
} from "./publicacao-macos.service";
import { LIMITE_POR_ARQUIVO, pastaDoEnvio, type CampoDeEnvio } from "./publicacao";

/**
 * Publicação do app de macOS pela API — o Mac do desenvolvedor gera o build
 * e envia daqui (`scripts/enviar-macos.sh`), sem SFTP e sem editar `.env`.
 *
 * Controller à parte do `UpdatesController` porque aquele é aberto e fora do
 * rate limit (é o atualizador que o consulta); este é o oposto: só o
 * **administrador da instância** (`JwtGuard` + `PlatformAdminGuard`, os
 * mesmos do painel — `PLATFORM_ADMIN_EMAILS` e e-mail verificado).
 *
 * Os guards rodam **antes** do interceptor do multer: quem não é admin leva
 * 401/403 sem que um byte do arquivo seja gravado.
 *
 * `multipart/form-data`: `version` (X.Y.Z), `notes` (opcional) e os arquivos
 * `dmg`, `bundle` (`.app.tar.gz`) e `sig` (`.app.tar.gz.sig`). O limite de
 * tamanho (400 MB por arquivo) vale só aqui.
 *
 * O corpo entra como `unknown` de propósito: um DTO de `class-validator`
 * rodaria no pipe global, **depois** do multer, e um 400 ali deixaria os
 * temporários no disco. A validação fica no service, que os apaga sempre.
 */
@Controller("updates")
export class PublicacaoController {
  constructor(private readonly publicacao: PublicacaoMacosService) {}

  @Post("macos")
  @HttpCode(200)
  @UPLOAD_THROTTLE
  @UseGuards(JwtGuard, PlatformAdminGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "dmg", maxCount: 1 },
        { name: "bundle", maxCount: 1 },
        { name: "sig", maxCount: 1 },
      ],
      {
        storage: armazenamentoDeEnvio(pastaDoEnvio),
        limits: { fileSize: LIMITE_POR_ARQUIVO, files: 3, fields: 4, fieldSize: 16 * 1024, parts: 8 },
      },
    ),
  )
  publicar(
    @CurrentUser() user: JwtPayload,
    @UploadedFiles() arquivos: Partial<Record<CampoDeEnvio, ArquivoRecebido[]>> | undefined,
    @Body() corpo: unknown,
  ): Promise<ResultadoDaPublicacaoMacos> {
    return this.publicacao.publicar({
      corpo,
      arquivos,
      autor: { id: user.sub, username: user.username },
    });
  }
}

