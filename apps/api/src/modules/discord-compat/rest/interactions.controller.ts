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
import { DadosDeCompatService } from "../dados.service";
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
 * `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`. 6, 7, 8 e 9 são F5 → 501.
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
  constructor(
    protected readonly interacoes: InteractionsService,
    protected readonly dados: DadosDeCompatService,
  ) {}

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
   */
  protected async callbackResponse(
    token: string,
    corpo: CorpoDeCallback,
  ): Promise<JsonDoDiscord> {
    const atual = await this.interacoes.porToken(token);
    const carregando = corpo.type === TIPO_DE_CALLBACK.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE;

    const interacao: JsonDoDiscord = {
      id: String(atual.snowflake),
      type: 2,
      activity_instance_id: null,
      response_message_id: null,
      response_message_loading: carregando,
      // `flags: 64` agora é entregue de verdade (a mensagem efêmera), então
      // este campo diz a verdade: `true` quando a resposta desta interação foi
      // efêmera. Ecoar `false` faria o bot achar que falou para o canal todo.
      response_message_ephemeral: false,
    };

    const resource: JsonDoDiscord = { type: corpo.type, activity_instance: null };

    // ── j-bots ── a efêmera vem primeiro: quando a resposta foi efêmera o
    // `responseMessageId` é null (ela não é uma `Message`), e sem esta consulta
    // o `InteractionCallbackResponse` sairia sem `response_message_id` — que é
    // justamente o que o discord.py guarda para o `edit_original_response()`.
    const efemera = await this.interacoes.linhaEfemeraOriginalParaCompat(atual.id);
    if (efemera) {
      interacao.response_message_ephemeral = true;
      interacao.response_message_id = String(efemera.snowflake);
      resource.message = { ...mensagemParaDiscord(efemera), flags: FLAG_EFEMERA };
    } else if (atual.responseMessageId) {
      const linha = await this.dados.mensagemPorCuid(atual.responseMessageId, atual.botUserId);
      if (linha) {
        interacao.response_message_id = String(linha.snowflake);
        resource.message = mensagemParaDiscord(linha);
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
