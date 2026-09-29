import { Body, Controller, HttpCode, Logger, Post, Req, UseGuards } from "@nestjs/common";
import { diagnosticoDoClienteSchema } from "@streamz/shared";
import type { DiagnosticoDoCliente } from "@streamz/shared";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { DIAGNOSTICS_THROTTLE } from "../../common/throttle";
import { zodBody } from "../../common/zod.pipe";

const MAX_USER_AGENT = 160;

/**
 * Recebe os erros que acontecem no navegador/app. Antes eles nunca chegavam ao
 * servidor: só o usuário via a tela quebrada. Com isso cada evento vira uma
 * linha no log da API, o que permite investigar "erro que só dá com fulano".
 * Não grava em banco de propósito — é log operacional, não dado do produto.
 */
@Controller("diagnostics")
export class DiagnosticsController {
  private readonly logger = new Logger("Cliente");

  @Post("client")
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @DIAGNOSTICS_THROTTLE
  registrar(
    @CurrentUser() user: JwtPayload,
    @Req() req: { headers: Record<string, string | string[] | undefined> },
    @Body(zodBody(diagnosticoDoClienteSchema)) body: DiagnosticoDoCliente,
  ): void {
    const ua = String(req.headers["user-agent"] ?? "").slice(0, MAX_USER_AGENT);
    const cliente = body.cliente ?? "navegador";
    for (const e of body.eventos) {
      const base =
        `cliente: ${e.tipo} user=${user.sub} cliente=${cliente} ua="${ua}" ` +
        `rota=${e.rota ?? "-"} em=${e.em} msg=${e.mensagem}`;
      // o StructuredLogger trata string com quebra de linha como `stack`;
      // detalhe de uma linha só vai na própria mensagem
      if (e.detalhe && e.detalhe.includes("\n")) this.logger.warn(base, e.detalhe);
      else this.logger.warn(e.detalhe ? `${base} detalhe="${e.detalhe}"` : base);
    }
  }
}
