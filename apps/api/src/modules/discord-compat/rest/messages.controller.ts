import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { WS_EVENTS } from "@streamz/shared";
import { zodBody } from "../../../common/zod.pipe";
import { GuildsService } from "../../guilds/guilds.service";
import { MessagesService } from "../../messages/messages.service";
import { RealtimeService } from "../../realtime/realtime.service";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import { canalDesconhecido, corpoInvalido, FiltroDeErrosDoDiscord, mensagemDesconhecida } from "../erros";
import { IdsService } from "../ids.service";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { BotAutenticado, MensagemDoDiscord } from "../tipos";
import { mensagemParaDiscord } from "../traducao/mensagem";
import { BotAtual } from "./bot-atual";
import {
  corpoDeMensagemSchema,
  edicaoDeMensagemSchema,
  lerQueryDoHistorico,
  type CorpoDeMensagem,
  type EdicaoDeMensagem,
} from "./corpos";

/**
 * As mensagens: o que faz o `!ping` responder `pong`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * | Método | Rota |
 * |---|---|
 * | GET | `/channels/:id/messages?limit&before&after&around` |
 * | GET | `/channels/:id/messages/:mid` |
 * | POST | `/channels/:id/messages` |
 * | PATCH | `/channels/:id/messages/:mid` |
 * | DELETE | `/channels/:id/messages/:mid` |
 * | PUT/DELETE | `/channels/:id/messages/:mid/reactions/:emoji/@me` |
 *
 * **O `ValidationPipe` global come o corpo, e isto é o risco (b) do §12.** Com
 * `whitelist: true` ele apaga tudo que não está declarado num DTO de
 * `class-validator`, e o discord.js manda `embeds`, `components`, `flags`,
 * `allowed_mentions`, `message_reference`, `tts` e `nonce`. A saída é a das
 * rotas de conta: `@Body()` cru validado por **zod** (`zodBody`, de
 * `common/zod.pipe.ts`). O pipe global deixa passar porque o metatype de um
 * `@Body()` sem classe não é validável — e há um teste de integração, com o pipe
 * global ligado, provando que os campos chegam (`corpo-do-post.spec.ts`).
 *
 * Escrever é `MessagesService.create(canal, botUserId, content, …)`: a
 * permissão, o modo lento, o castigo e o "escrever é ler" saem todos de graça. A
 * casca **não** reimplementa nada disso.
 *
 * **Divergência registrada:** o `emitToChannel("message.new")` **não** sai de
 * graça — `MessagesService.create` grava e devolve o DTO, e quem emite é o
 * `chat.gateway` (`onMessage`). Como o bot não tem socket, é a casca que emite,
 * com o mesmo evento e a mesma forma do gateway do web; sem isso, a prova 3 da
 * fase (a resposta do bot aparecer no navegador sem F5) não passa. O mesmo vale
 * para `message.updated` e `message.deleted`.
 *
 * Como o service devolve o DTO (cuid, sem snowflake), a linha é relida por
 * `DadosDeCompatService.mensagemPorCuid` para montar a resposta.
 *
 * Reações: só o par mínimo do `@me` entra na F1 (o resto é F5). O emoji vem
 * **percent-encoded** na rota — `decodeURIComponent` antes de usar.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/channels/:id/messages")
export class MessagesCompatController {
  constructor(
    private readonly dados: DadosDeCompatService,
    private readonly ids: IdsService,
    private readonly guilds: GuildsService,
    private readonly mensagens: MessagesService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  async historico(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Query() query: Record<string, string>,
  ): Promise<MensagemDoDiscord[]> {
    const canalId = await this.canalDoBot(bot, id);
    const linhas = await this.dados.mensagensDoCanal(canalId, {
      ...lerQueryDoHistorico(query),
      paraBotUserId: bot.botUserId,
    });
    return linhas.map(mensagemParaDiscord);
  }

  @Post()
  async criar(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    // `@Body()` com um pipe local e um tipo que **não** é classe: o metatype que
    // o `ValidationPipe` global recebe é `Object`, e ele não valida (nem faz
    // whitelist de) `Object`. É o que salva `embeds`, `components`, `flags`,
    // `allowed_mentions`, `message_reference`, `tts` e `nonce`.
    @Body(zodBody(corpoDeMensagemSchema)) dados: CorpoDeMensagem,
  ): Promise<MensagemDoDiscord> {
    const canalId = await this.cuidDoCanal(id);

    const content = (dados.content ?? "").trim();
    const anexos = dados.attachment_ids ?? [];
    // o Discord recusa mensagem sem nada; a F1 não tem embed rico, então "nada"
    // é texto vazio e nenhum anexo
    if (content.length === 0 && anexos.length === 0) {
      throw corpoInvalido({
        content: { _errors: [{ code: "BASE_TYPE_REQUIRED", message: "Cannot send an empty message" }] },
      });
    }

    const resposta = await this.resposta(dados);
    const mensagem = await this.mensagens.create(
      canalId,
      bot.botUserId,
      content,
      undefined,
      anexos,
      resposta,
    );

    // o gateway do web faz este emit no `onMessage`; o bot não tem socket, então
    // é aqui. O `nonce` é ecoado como lá — o cliente troca a mensagem otimista.
    const nonce = typeof dados.nonce === "string" ? dados.nonce : undefined;
    this.realtime.emitToChannel(
      canalId,
      WS_EVENTS.MESSAGE_NEW,
      nonce ? { ...mensagem, nonce } : mensagem,
    );

    return this.reler(mensagem.id, bot.botUserId);
  }

  @Get(":mid")
  async uma(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("mid") mid: string,
  ): Promise<MensagemDoDiscord> {
    await this.canalDoBot(bot, id);
    const mensagemId = await this.ids.cuidDeMensagem(mid);
    const linha = mensagemId ? await this.dados.mensagemPorCuid(mensagemId, bot.botUserId) : null;
    // mensagem que existe mas é de outro canal: para o bot é o mesmo que não
    // existir — o `:id` da rota é que diz o que ele tem autorização de ler
    if (!linha || linha.channelSnowflake !== BigInt(id)) throw mensagemDesconhecida();
    return mensagemParaDiscord(linha);
  }

  @Patch(":mid")
  async editar(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("mid") mid: string,
    @Body(zodBody(edicaoDeMensagemSchema)) dados: EdicaoDeMensagem,
  ): Promise<MensagemDoDiscord> {
    await this.cuidDoCanal(id);
    const mensagemId = await this.cuidDaMensagem(mid);

    // `content` ausente no PATCH do Discord quer dizer "não mexe no texto"; a
    // F1 não tem outro campo editável, então é um no-op que devolve a mensagem
    if (dados.content === undefined) return this.reler(mensagemId, bot.botUserId);

    const mensagem = await this.mensagens.edit(mensagemId, bot.botUserId, dados.content.trim());
    this.realtime.emitToChannel(mensagem.channelId, WS_EVENTS.MESSAGE_UPDATED, mensagem);
    return this.reler(mensagemId, bot.botUserId);
  }

  @Delete(":mid")
  @HttpCode(204)
  async apagar(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("mid") mid: string,
  ): Promise<void> {
    await this.cuidDoCanal(id);
    const mensagemId = await this.cuidDaMensagem(mid);

    const { channelId, parentId } = await this.mensagens.remove(mensagemId, bot.botUserId);
    this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_DELETED, {
      messageId: mensagemId,
      channelId,
      parentId,
    });
  }

  @Put(":mid/reactions/:emoji/@me")
  @HttpCode(204)
  async reagir(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("mid") mid: string,
    @Param("emoji") emoji: string,
  ): Promise<void> {
    await this.cuidDoCanal(id);
    const mensagemId = await this.cuidDaMensagem(mid);
    const mensagem = await this.mensagens.addReaction(mensagemId, bot.botUserId, lerEmoji(emoji));
    // reação granular (`MESSAGE_REACTION_ADD`) é F5; hoje o tempo real do
    // Streamz só sabe dizer "a mensagem mudou"
    this.realtime.emitToChannel(mensagem.channelId, WS_EVENTS.MESSAGE_UPDATED, mensagem);
  }

  @Delete(":mid/reactions/:emoji/@me")
  @HttpCode(204)
  async desreagir(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("mid") mid: string,
    @Param("emoji") emoji: string,
  ): Promise<void> {
    await this.cuidDoCanal(id);
    const mensagemId = await this.cuidDaMensagem(mid);
    const mensagem = await this.mensagens.removeReaction(mensagemId, bot.botUserId, lerEmoji(emoji));
    this.realtime.emitToChannel(mensagem.channelId, WS_EVENTS.MESSAGE_UPDATED, mensagem);
  }

  // ── internos ───────────────────────────────────────────────

  /** O `:id` da rota → cuid do canal. Categoria não tem mensagem. */
  private async cuidDoCanal(snowflake: string): Promise<string> {
    const alvo = await this.ids.cuidDeCanalOuCategoria(snowflake);
    if (!alvo || alvo.tipo !== "canal") throw canalDesconhecido();
    return alvo.id;
  }

  /** O mesmo, mais a autorização de leitura do canal (cargos + overrides). */
  private async canalDoBot(bot: BotAutenticado, snowflake: string): Promise<string> {
    const canalId = await this.cuidDoCanal(snowflake);
    await this.guilds.assertCanViewChannel(bot.botUserId, canalId);
    return canalId;
  }

  private async cuidDaMensagem(snowflake: string): Promise<string> {
    const id = await this.ids.cuidDeMensagem(snowflake);
    if (!id) throw mensagemDesconhecida();
    return id;
  }

  /**
   * A mensagem recém-escrita, relida com o snowflake.
   *
   * `MessagesService` devolve o DTO de `@streamz/shared` (cuid, sem snowflake) —
   * a resposta do Discord precisa do número, e ele está na linha.
   */
  private async reler(mensagemId: string, botUserId: string): Promise<MensagemDoDiscord> {
    const linha = await this.dados.mensagemPorCuid(mensagemId, botUserId);
    if (!linha) throw mensagemDesconhecida();
    return mensagemParaDiscord(linha);
  }

  /**
   * `message_reference` do Discord → o `reply` do `MessagesService`.
   *
   * `replied_user` do `allowed_mentions` é o "@ ligado": o padrão do Discord é
   * mencionar, e é o mesmo padrão do Streamz.
   */
  private async resposta(
    dados: CorpoDeMensagem,
  ): Promise<{ replyToId?: string; replyMention?: boolean } | undefined> {
    const referencia = dados.message_reference?.message_id;
    if (!referencia) return undefined;

    const replyToId = await this.ids.cuidDeMensagem(referencia);
    // `fail_if_not_exists` é true por padrão no Discord; sem a mensagem citada,
    // 10008 é a resposta que a lib sabe classificar
    if (!replyToId) {
      if (dados.message_reference?.fail_if_not_exists === false) return undefined;
      throw mensagemDesconhecida();
    }
    // que a mensagem citada seja do mesmo canal é o `MessagesService` que
    // confere (citar de outro canal vazaria conteúdo que o leitor talvez não
    // veja); aqui só traduzimos o id
    return { replyToId, replyMention: dados.allowed_mentions?.replied_user ?? true };
  }
}

@Controller("v9/channels/:id/messages")
export class MessagesCompatControllerV9 extends MessagesCompatController {}

/**
 * O emoji vem percent-encoded na rota (`%F0%9F%91%8D`, ou `nome%3Aid` para os
 * personalizados). O Express já decodifica `req.params`, mas nem toda lib manda
 * o mesmo nível de escape — decodificar de novo o que já está decodificado é
 * inofensivo, e não decodificar deixaria a reação gravada com o `%`.
 */
function lerEmoji(cru: string): string {
  try {
    return decodeURIComponent(cru);
  } catch {
    return cru;
  }
}

