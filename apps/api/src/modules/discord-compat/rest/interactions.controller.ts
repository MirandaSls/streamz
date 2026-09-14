import {
  Body,
  Controller,
  Param,
  Post,
  Query,
  Res,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { zodBody } from "../../../common/zod.pipe";
import { InteractionsService } from "../../interactions/interactions.service";
import type { InteracaoAutenticada } from "../../interactions/tipos";
import { FLAG_EFEMERA, TIPO_DE_CALLBACK } from "../../interactions/tipos";
import { aplicarContentTypeDoDiscord } from "../content-type";
import { FiltroDeErrosDoDiscord, interacaoDesconhecida } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { JsonDoDiscord } from "../tipos";
import { mensagemParaDiscord } from "../traducao/mensagem";
import { corpoDeCallbackSchema, type CorpoDeCallback } from "./corpos-f3";

/**
 * O mínimo do `Response` do Express que este controller usa — mesmo motivo do
 * `RespostaHttp` de `../erros.ts`: o `@types/express` não é dependência da API.
 */
interface RespostaHttp {
  status(codigo: number): RespostaHttp;
  json(corpo: unknown): void;
  send(): void;
  setHeader(nome: string, valor: string): unknown;
}

/**
 * `POST /api/v10/interactions/:id/:token/callback` — a resposta do bot.
 *
 * ── Lote B (REST compat) implementa. ──
 *
 * **Esta rota não tem `BotTokenGuard`, e isso não é esquecimento.** O
 * `@discordjs/rest` manda o callback com `auth: false` — sem cabeçalho
 * `Authorization` nenhum —, e o discord.py faz o mesmo. Um guard aqui daria 401
 * em todo `reply()` do planeta. O credencial é o `:token` do caminho, e quem o
 * resolve é `InteractionsService.porToken` (que já devolve 404 `10062` para
 * token inexistente ou vencido).
 *
 * Tipos implementados na F3: **4** `CHANNEL_MESSAGE_WITH_SOURCE` e **5**
 * `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`. ── onda 3 (cartão 3a) ── **6**
 * `DEFERRED_UPDATE_MESSAGE`, **7** `UPDATE_MESSAGE`, **8**
 * `APPLICATION_COMMAND_AUTOCOMPLETE_RESULT` e **9** `MODAL` também; qual vale
 * para qual tipo de interação é do `InteractionsService.responder`.
 *
 * ## A resposta: 204 **ou** um corpo, e quem decide é o `?with_response`
 *
 * O padrão é **204 sem corpo**, como sempre foi no Discord — é o que o
 * discord.js espera do `deferReply()`.
 *
 * Mas o **discord.py 2.6+ manda `?with_response=1`** e *parseia o corpo*: o
 * `defer()` dele constrói um `InteractionCallbackResponse` e lê
 * `data['interaction']` **sem `.get`**. Com o 204 vazio, o `json_or_text` da lib
 * devolve `''`, e o `data['interaction']` estoura em
 * `TypeError: string indices must be integers` — três camadas longe da causa,
 * dentro da lib, com o bot travado no `defer()` e nenhuma linha no log.
 *
 * É o mesmo defeito, letra por letra, que o `Content-Type` com charset causou na
 * F1 (§5) — e só a prova com a lib de verdade o encontra. Por isso: com
 * `with_response` verdadeiro devolvemos **200 com o `InteractionCallbackResponse`**;
 * sem ele, 204.
 *
 * `@Body()` cru + zod, como manda o §5: o `ValidationPipe` global com
 * `whitelist: true` apagaria `data.embeds`, `data.components` e `data.flags`
 * antes de o handler ver — o risco (b) do §12, que já mordeu na F1.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@Controller("v10/interactions")
export class InteractionCallbackCompatController {
  // ── onda 3 ── sem o `DadosDeCompatService`: a mensagem da resposta sai por
  // `InteractionsService.origemParaCompat`, que junta embeds e componentes à
  // linha da compat (a `mensagemPorCuid` sozinha ainda os devolve vazios)
  constructor(protected readonly interacoes: InteractionsService) {}

  @Post(":id/:token/callback")
  async callback(
    @Param("id") id: string,
    @Param("token") token: string,
    @Query("with_response") comResposta: string | undefined,
    // `data` fica intacto até o `responder`: é o único lugar onde `embeds`,
    // `components` e `flags` existem, e o pipe global os comeria num DTO
    @Body(zodBody(corpoDeCallbackSchema)) corpo: CorpoDeCallback,
    // `@Res()` cru porque as duas saídas têm forma diferente (204 sem corpo e
    // 200 com JSON) e o Nest não deixa variar o status sem ele
    @Res() resposta: RespostaHttp,
  ): Promise<void> {
    const interacao = await this.resolver(id, token);
    await this.interacoes.responder(interacao, corpo.type, corpo.data);

    // o `Content-Type` sem charset também aqui: é o §5, e o `json_or_text` do
    // discord.py compara o cabeçalho por igualdade exata
    aplicarContentTypeDoDiscord(resposta);

    if (!ligado(comResposta)) {
      resposta.status(204).send();
      return;
    }
    resposta.status(200).json(await this.callbackResponse(token, corpo));
  }

  /**
   * O `InteractionCallbackResponse` do `?with_response=1`.
   *
   * Relê a interação pelo token porque o `responder` acabou de gravar o
   * `responseMessageId` — e é ele que o discord.py guarda para o
   * `edit_original_response()` seguinte.
   *
   * ── onda 3 ── por tipo de callback (`receiving-and-responding.mdx`,
   * "Interaction Callback Response Object": `resource.message` só existe em
   * 4 e 7):
   * - 4/5: a mensagem criada (efêmera ou normal), como na F3;
   * - 6/7: a **mensagem de origem** em `response_message_id`, e o objeto dela
   *   em `resource.message` só no 7;
   * - 8/9: só `interaction` e `resource.type` — não há mensagem.
   */
  protected async callbackResponse(
    token: string,
    corpo: CorpoDeCallback,
  ): Promise<JsonDoDiscord> {
    const atual = await this.interacoes.porToken(token);
    const carregando = corpo.type === TIPO_DE_CALLBACK.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE;

    const interacao: JsonDoDiscord = {
      id: String(atual.snowflake),
      // ── onda 3 ── o tipo de verdade (3 componente, 4 autocomplete, 5 envio de
      // modal); fixo em 2 o discord.py tomaria um clique por comando de barra
      type: atual.tipo ?? 2,
      activity_instance_id: null,
      response_message_id: null,
      response_message_loading: carregando,
      // `flags: 64` agora é entregue de verdade (a mensagem efêmera), então
      // este campo diz a verdade: `true` quando a resposta desta interação foi
      // efêmera. Ecoar `false` faria o bot achar que falou para o canal todo.
      response_message_ephemeral: false,
    };

    const resource: JsonDoDiscord = { type: corpo.type, activity_instance: null };

    if (
      corpo.type === TIPO_DE_CALLBACK.DEFERRED_UPDATE_MESSAGE ||
      corpo.type === TIPO_DE_CALLBACK.UPDATE_MESSAGE
    ) {
      const origem = await this.interacoes.origemParaCompat(atual);
      if (origem) {
        interacao.response_message_id = String(origem.linha.snowflake);
        interacao.response_message_ephemeral = origem.efemera;
        if (corpo.type === TIPO_DE_CALLBACK.UPDATE_MESSAGE) {
          const traduzida = mensagemParaDiscord(origem.linha);
          resource.message = origem.efemera
            ? { ...traduzida, flags: traduzida.flags | FLAG_EFEMERA }
            : traduzida;
        }
      }
      return { interaction: interacao, resource };
    }
    if (
      corpo.type === TIPO_DE_CALLBACK.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT ||
      corpo.type === TIPO_DE_CALLBACK.MODAL
    ) {
      return { interaction: interacao, resource };
    }

    // ── j-bots ── a efêmera vem primeiro: quando a resposta foi efêmera o
    // `responseMessageId` é null (ela não é uma `Message`), e sem esta consulta
    // o `InteractionCallbackResponse` sairia sem `response_message_id` — que é
    // justamente o que o discord.py guarda para o `edit_original_response()`.
    const efemera = await this.interacoes.linhaEfemeraOriginalParaCompat(atual.id);
    if (efemera) {
      interacao.response_message_ephemeral = true;
      interacao.response_message_id = String(efemera.snowflake);
      // ── onda 3 ── `|` e não `=`: a efêmera pode ser v2 (`IS_COMPONENTS_V2`), e
      // sobrescrever as flags a esconderia da lib do bot
      const traduzida = mensagemParaDiscord(efemera);
      resource.message = { ...traduzida, flags: traduzida.flags | FLAG_EFEMERA };
    } else if (atual.responseMessageId) {
      const resposta = await this.interacoes.origemParaCompat({
        messageId: atual.responseMessageId,
        botUserId: atual.botUserId,
      });
      if (resposta) {
        interacao.response_message_id = String(resposta.linha.snowflake);
        resource.message = mensagemParaDiscord(resposta.linha);
      }
    }

    return { interaction: interacao, resource };
  }

  /**
   * O `:token` do caminho → a interação, conferindo o `:id` junto.
   *
   * `porToken` já cuida do "não existe" e do "venceu". O que sobra para o
   * controller é o par: um token válido apresentado com o id de outra interação
   * leva **o mesmo** 404 `10062`, e não 403 — quem não tem o token não fica
   * sabendo que a interação existe. (Na prática só acontece com bot com defeito,
   * e o 404 é o que a lib sabe classificar.)
   */
  protected async resolver(id: string, token: string): Promise<InteracaoAutenticada> {
    const interacao = await this.interacoes.porToken(token);
    if (String(interacao.snowflake) !== id) throw interacaoDesconhecida();
    return interacao;
  }
}

@Controller("v9/interactions")
export class InteractionCallbackCompatControllerV9 extends InteractionCallbackCompatController {}

/**
 * O `?with_response` do Discord é um booleano de query, e as libs escrevem de
 * jeitos diferentes: o discord.py manda `1`, e há quem mande `true`. Ausente,
 * vazio, `0` e `false` valem "não".
 */
function ligado(valor: string | undefined): boolean {
  if (valor === undefined) return false;
  const v = valor.toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
}
