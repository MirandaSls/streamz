import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import {
  cliqueEmComponenteSchema,
  envioDeModalSchema,
  interacaoCriarSchema,
  pedidoDeAutocompleteSchema,
  type CliqueEmComponenteInput,
  type ComandoDeApp,
  type EnvioDeModalInput,
  type InteracaoCriada,
  type InteracaoCriarInput,
  type InteracaoDeBotCriada,
  type PedidoDeAutocompleteInput,
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
 * | POST | `/api/channels/:id/interactions/componente` | ── onda 3 ── clique em botão/select (interação 3) |
 * | POST | `/api/channels/:id/interactions/modal` | ── onda 3 ── envio do modal que o bot abriu (interação 5) |
 * | POST | `/api/channels/:id/interactions/autocomplete` | ── onda 3 ── sugestões da opção em foco (interação 4) |
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

  // ── onda 3 · cartão 3a ── as três rotas de `docs/CONTRATO-ONDA-3.md` §4.
  //
  // **200**, e não o 201 padrão do `@Post` do Nest: é o que o contrato fixou, e
  // nenhuma delas cria algo que a web vá buscar pelo `Location` — a resposta do
  // bot chega pelo socket (`interaction.*`), casada pelo `nonce` do corpo.

  @Post("channels/:id/interactions/componente")
  @HttpCode(200)
  clicarComponente(
    @CurrentUser() usuario: JwtPayload,
    @Param("id") canalId: string,
    @Body(zodBody(cliqueEmComponenteSchema)) corpo: CliqueEmComponenteInput,
  ): Promise<InteracaoDeBotCriada> {
    return this.interacoes.clicarComponente({
      canalId,
      usuarioId: usuario.sub,
      messageId: corpo.messageId,
      customId: corpo.customId,
      componentType: corpo.componentType,
      values: corpo.values,
      nonce: corpo.nonce,
    });
  }

  @Post("channels/:id/interactions/modal")
  @HttpCode(200)
  enviarModal(
    @CurrentUser() usuario: JwtPayload,
    @Param("id") canalId: string,
    @Body(zodBody(envioDeModalSchema)) corpo: EnvioDeModalInput,
  ): Promise<InteracaoDeBotCriada> {
    return this.interacoes.enviarModal({
      canalId,
      usuarioId: usuario.sub,
      interactionId: corpo.interactionId,
      customId: corpo.customId,
      components: corpo.components,
      nonce: corpo.nonce,
    });
  }

  @Post("channels/:id/interactions/autocomplete")
  @HttpCode(200)
  pedirAutocomplete(
    @CurrentUser() usuario: JwtPayload,
    @Param("id") canalId: string,
    @Body(zodBody(pedidoDeAutocompleteSchema)) corpo: PedidoDeAutocompleteInput,
  ): Promise<InteracaoDeBotCriada> {
    return this.interacoes.pedirAutocomplete({
      canalId,
      usuarioId: usuario.sub,
      commandId: corpo.commandId,
      options: corpo.options,
      nonce: corpo.nonce,
    });
  }

  @Get("guilds/:id/comandos-de-app")
  comandos(
    @CurrentUser() usuario: JwtPayload,
    @Param("id") guildId: string,
  ): Promise<ComandoDeApp[]> {
    return this.interacoes.comandosDoServidor(guildId, usuario.sub);
  }
}
