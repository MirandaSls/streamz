import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  interacaoCriarSchema,
  type ComandoDeApp,
  type InteracaoCriada,
  type InteracaoCriarInput,
} from "@streamz/shared";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { zodBody } from "../../common/zod.pipe";
import { InteractionsService } from "./interactions.service";

/**
 * O REST **interno** das interações: o que o navegador chama.
 *
 * ── Lote A (domínio) implementa. ──
 *
 * `Authorization: Bearer` + `JwtGuard`, como todo o resto do REST do produto.
 * Não confundir com `/api/v10/**`, que é a casca de compatibilidade e fala
 * `Authorization: Bot <token>` (ou, no caso do callback, token nenhum).
 *
 * | Método | Rota | O quê |
 * |---|---|---|
 * | POST | `/api/channels/:id/interactions` | dispara `/play` |
 * | GET | `/api/guilds/:id/comandos-de-app` | o que o composer sugere |
 *
 * **Divergência do documento, registrada:** o §9 desenhou
 * `POST /api/interactions` (com o canal no corpo) e
 * `GET /api/guilds/:id/application-commands`. As rotas são as de cima —
 * o canal é o recurso, e o resto do REST interno é em português. O documento é
 * corrigido no PR final da fase.
 *
 * O `POST` devolve `InteracaoCriada` e **não** espera o bot: a resposta dele
 * chega pelo socket, como qualquer outra mensagem. Um bot que leve 8 s para
 * resolver um link do YouTube não pode segurar o `fetch` do composer.
 */
@UseGuards(JwtGuard)
@Controller()
export class InteractionsController {
  constructor(protected readonly interacoes: InteractionsService) {}

  /**
   * Dispara o comando. **O token da interação nunca sai daqui**: quem o tem
   * escreve no canal como o bot, e o navegador não precisa dele para nada.
   */
  @Post("channels/:id/interactions")
  async criar(
    @CurrentUser() usuario: JwtPayload,
    @Param("id") canalId: string,
    @Body(zodBody(interacaoCriarSchema)) corpo: InteracaoCriarInput,
  ): Promise<InteracaoCriada> {
    const emVoo = await this.interacoes.criarInteracao({
      canalId,
      usuarioId: usuario.sub,
      commandId: corpo.commandId,
      opcoes: corpo.options.map((o) => ({ nome: o.name, tipo: o.type, valor: o.value })),
    });

    return {
      id: emVoo.id,
      // string decimal: o número passa de 2^53 e um `number` o truncaria
      snowflake: String(emVoo.snowflake),
      name: emVoo.nome,
      expiresAt: emVoo.expiraEm.toISOString(),
    };
  }

  @Get("guilds/:id/comandos-de-app")
  comandos(
    @CurrentUser() usuario: JwtPayload,
    @Param("id") guildId: string,
  ): Promise<ComandoDeApp[]> {
    return this.interacoes.comandosDoServidor(guildId, usuario.sub);
  }
}
