import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Optional,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import type { Message as MessageDTO } from "@streamz/shared";
import { zodBody } from "../../../common/zod.pipe";
import { InteractionsService } from "../../interactions/interactions.service";
import type { InteracaoAutenticada } from "../../interactions/tipos";
import { FLAG_EFEMERA } from "../../interactions/tipos";
import { UploadsService } from "../../uploads/uploads.service";
import { DadosDeCompatService } from "../dados.service";
import {
  FiltroDeErrosDoDiscord,
  interacaoDesconhecida,
  mensagemDesconhecida,
  naoImplementado,
} from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { MensagemDoDiscord } from "../tipos";
import { mensagemParaDiscord } from "../traducao/mensagem";
import { PayloadJsonPipe, LIMITES_DO_MULTIPART, type ArquivoDoMultipart } from "./corpos";
import { anexarArquivosAoCorpo, dadosDeRespostaSchema, type DadosDeResposta } from "./corpos-f3";

/**
 * Os followups de uma interação — o `editReply()`, o `fetchReply()` e o
 * `followUp()` do discord.js.
 *
 * ── Lote B (REST compat) implementa. ──
 *
 * ```
 * POST   /api/v10/webhooks/:app/:token                        → mensagem nova
 * GET    /api/v10/webhooks/:app/:token/messages/@original
 * PATCH  /api/v10/webhooks/:app/:token/messages/@original     → edita o "pensando…"
 * DELETE /api/v10/webhooks/:app/:token/messages/@original
 * ```
 *
 * Como no callback, **sem `BotTokenGuard`**: o token do caminho é o único
 * credencial (§9 do documento; §3.3 do `CONTRATO-F3.md`). O `:app` tem que bater
 * com o snowflake da `Application` da interação; não batendo, 404 `10062` — e
 * não 403, porque para quem não tem o token a interação não existe.
 *
 * `/messages/:mid` (um followup específico, que não o original) é **F5**: 501.
 * O `editReply()` e o `deleteReply()` do discord.js usam `@original`, que é o
 * que a prova 3 da fase exercita.
 *
 * Cuidado com a ordem das rotas no Nest: `/@original` está declarado **antes**
 * de qualquer `/:mid`, senão o `@original` casaria como um id. O Express casa na
 * ordem de registro, e a ordem de registro é a ordem dos métodos neste arquivo.
 *
 * A resposta é a mensagem no formato do Discord. Como `InteractionsService`
 * devolve o DTO de `@streamz/shared` (cuid, sem snowflake), a linha é relida por
 * `DadosDeCompatService.mensagemPorCuid` — o mesmo caminho do
 * `messages.controller.ts` da F1, e pelo mesmo motivo.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@Controller("v10/webhooks/:app/:token")
export class WebhooksCompatController {
  constructor(
    protected readonly interacoes: InteractionsService,
    protected readonly dados: DadosDeCompatService,
    // ── rodada de correção ── o upload multipart do `followUp({ files })`.
    // `@Optional` pelo mesmo motivo do `messages.controller.ts`: o
    // `UploadsModule` não exporta o service e o `InteractionsModule` (do
    // coordenador) não o importa. Desligado, arquivo leva 501.
    @Optional() @Inject(UploadsService) protected readonly uploads?: UploadsService,
  ) {}

  /**
   * `followUp()` — uma mensagem nova no mesmo canal.
   *
   * 200 e não 201: é o que o Discord devolve, e o `webhook.send()` do discord.js
   * espera o corpo da mensagem de volta (ele manda `?wait=true`, que aqui é o
   * único comportamento — não temos webhook "dispara e esquece").
   */
  @Post()
  @HttpCode(200)
  // ── rodada de correção ── `multipart/form-data` (`payload_json` + `files[n]`):
  // é assim que sai todo `followUp({ files })`. Num corpo JSON o multer passa
  // direto.
  @UseInterceptors(AnyFilesInterceptor({ limits: LIMITES_DO_MULTIPART }))
  async followup(
    @Param("app") app: string,
    @Param("token") token: string,
    @Body(new PayloadJsonPipe(), zodBody(dadosDeRespostaSchema)) corpo: DadosDeResposta,
    @UploadedFiles() arquivos: ArquivoDoMultipart[] | undefined,
  ): Promise<MensagemDoDiscord> {
    // o token é conferido **antes** do upload: sem interação válida, nenhum
    // byte vai para o bucket
    const interacao = await this.resolver(app, token);
    const dados = await anexarArquivosAoCorpo(corpo, arquivos, this.uploads, interacao.botUserId);
    return this.reler(interacao, await this.interacoes.followup(interacao, dados));
  }

  /** `fetchReply()` — a mensagem que o callback criou. */
  @Get("messages/@original")
  async lerOriginal(
    @Param("app") app: string,
    @Param("token") token: string,
  ): Promise<MensagemDoDiscord> {
    const interacao = await this.resolver(app, token);
    return this.reler(interacao, await this.interacoes.lerOriginal(interacao));
  }

  /** `editReply()` — o que transforma o "pensando…" na resposta de verdade. */
  @Patch("messages/@original")
  async editarOriginal(
    @Param("app") app: string,
    @Param("token") token: string,
    @Body(zodBody(dadosDeRespostaSchema)) dados: DadosDeResposta,
  ): Promise<MensagemDoDiscord> {
    const interacao = await this.resolver(app, token);
    return this.reler(interacao, await this.interacoes.editarOriginal(interacao, dados));
  }

  /** `deleteReply()`. 204, como o Discord. */
  @Delete("messages/@original")
  @HttpCode(204)
  async apagarOriginal(@Param("app") app: string, @Param("token") token: string): Promise<void> {
    const interacao = await this.resolver(app, token);
    await this.interacoes.apagarOriginal(interacao);
  }

  // ── os followups nomeados: F5 ──────────────────────────────
  //
  // Declarados **depois** do `@original` (ordem de rota) e de propósito: sem
  // eles, um `interaction.webhook.editMessage(id, …)` cairia no 404 do Nest, com
  // o corpo `{statusCode, message}` que a lib lê como `code: 0`. Com eles, o bot
  // recebe um 501 `20012` dizendo o que falta.
  //
  // **E eles também atendem o `@original`, porque o discord.js manda `%40`.**
  // Isto custou a prova 3 da fase: o `editReply()` sai como
  // `PATCH …/messages/%40original` — o `@` vai percent-encoded —, e o Express
  // casa a rota pelo caminho **cru**, decodificando `req.params` só depois. A
  // rota literal `messages/@original` declarada acima portanto **não** casa com
  // o que o discord.js manda, e o pedido caía aqui e levava 501 no lugar da
  // edição. As duas formas existem porque as duas aparecem na natureza: o
  // discord.py manda `@original` cru.
  //
  // Decodificar antes de comparar é o conserto, e é o mesmo cuidado que o
  // `lerEmoji` do `messages.controller.ts` já tomava com as reações.

  @Get("messages/:mid")
  async lerFollowup(
    @Param("app") app: string,
    @Param("token") token: string,
    @Param("mid") mid: string,
  ): Promise<MensagemDoDiscord> {
    if (!ehOriginal(mid)) throw naoImplementado("GET /webhooks/:app/:token/messages/:id");
    return this.lerOriginal(app, token);
  }

  @Patch("messages/:mid")
  async editarFollowup(
    @Param("app") app: string,
    @Param("token") token: string,
    @Param("mid") mid: string,
    @Body(zodBody(dadosDeRespostaSchema)) dados: DadosDeResposta,
  ): Promise<MensagemDoDiscord> {
    if (!ehOriginal(mid)) throw naoImplementado("PATCH /webhooks/:app/:token/messages/:id");
    return this.editarOriginal(app, token, dados);
  }

  @Delete("messages/:mid")
  @HttpCode(204)
  async apagarFollowup(
    @Param("app") app: string,
    @Param("token") token: string,
    @Param("mid") mid: string,
  ): Promise<void> {
    if (!ehOriginal(mid)) throw naoImplementado("DELETE /webhooks/:app/:token/messages/:id");
    await this.apagarOriginal(app, token);
  }

  // ── internos ───────────────────────────────────────────────

  /**
   * O `:token` do caminho → a interação, conferindo o `:app` junto.
   *
   * Ver `interactions.controller.ts`: token que não existe, token vencido e
   * `:app` de outra aplicação levam todos o **mesmo** 404 `10062`.
   */
  protected async resolver(app: string, token: string): Promise<InteracaoAutenticada> {
    const interacao = await this.interacoes.porToken(token);
    if (String(interacao.applicationSnowflake) !== app) throw interacaoDesconhecida();
    return interacao;
  }

  /**
   * O DTO do service → o objeto `message` do Discord.
   *
   * A releitura é obrigatória e não é desperdício: o DTO de `@streamz/shared`
   * carrega o `id` cuid e **não** tem snowflake, e o `Message` do discord.js
   * constrói o id a partir de `data.id` — um cuid ali viraria um snowflake
   * inválido que a lib usaria em toda rota seguinte.
   */
  protected async reler(
    interacao: InteracaoAutenticada,
    mensagem: MessageDTO,
  ): Promise<MensagemDoDiscord> {
    // ── j-bots ── a efêmera não está na `Message` (é a tabela `EphemeralMessage`,
    // que nenhuma consulta do chat lê), então a releitura é outra — e a resposta
    // volta com `flags: 64`, que é como a lib do bot reconhece a efemeridade da
    // mensagem que acabou de mandar.
    if (mensagem.efemera) {
      const efemera = await this.interacoes.linhaEfemeraParaCompat(mensagem.id);
      if (!efemera) throw mensagemDesconhecida();
      // ── onda 3 ── o `|` e não `=`: a efêmera também pode ter
      // `IS_COMPONENTS_V2`, e a lib do bot precisa ver as duas
      const traduzida = mensagemParaDiscord(efemera);
      return { ...traduzida, flags: traduzida.flags | FLAG_EFEMERA };
    }

    const linha = await this.dados.mensagemPorCuid(mensagem.id, interacao.botUserId);
    if (!linha) throw mensagemDesconhecida();
    // ── rodada de correção ── embeds, componentes e flags vêm da própria linha
    // (o `select` da compat os traz). O DTO do service é o da web, com os
    // snowflakes dos componentes já trocados por cuid — errado para o bot.
    return mensagemParaDiscord(linha);
  }
}

@Controller("v9/webhooks/:app/:token")
export class WebhooksCompatControllerV9 extends WebhooksCompatController {}

/**
 * O `:mid` do caminho é a mensagem original?
 *
 * Aceita `@original` e `%40original`. O discord.js manda a segunda forma (o
 * `@discordjs/rest` monta a rota com o `@` já escapado) e o discord.py manda a
 * primeira; o Express casa rota pelo caminho cru, então a declaração literal
 * `messages/@original` só pega uma das duas. Decodificar o que já está
 * decodificado é inofensivo — um `%` solto faria o `decodeURIComponent` lançar,
 * e aí o valor cru é a resposta certa.
 */
function ehOriginal(mid: string): boolean {
  let decodificado = mid;
  try {
    decodificado = decodeURIComponent(mid);
  } catch {
    // caminho com `%` inválido: não é o `@original`, e não é erro nosso
  }
  return decodificado === "@original";
}
