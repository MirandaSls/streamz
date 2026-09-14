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
import {
  ehSnowflake,
  FLAGS_DE_MENSAGEM,
  snowflakeParaData,
  WS_EVENTS,
  type Message as MessageDTO,
} from "@streamz/shared";
import { zodBody } from "../../../common/zod.pipe";
import { GuildsService } from "../../guilds/guilds.service";
import { anunciarReacao, anunciarReacoesLimpas } from "../../messages/eventos-de-reacao";
import { MessagesService } from "../../messages/messages.service";
import { ModerationService } from "../../moderation/moderation.service";
import { RealtimeService } from "../../realtime/realtime.service";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import {
  canalDesconhecido,
  corpoInvalido,
  emojiDesconhecido,
  FiltroDeErrosDoDiscord,
  mensagemAntigaDemais,
  mensagemDesconhecida,
} from "../erros";
import { IdsService } from "../ids.service";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import { ReacoesDeCompatService } from "../reacoes.service";
import type { BotAutenticado, MensagemDoDiscord, UsuarioDoDiscord } from "../tipos";
import { lerEmojiDaRota } from "../traducao/emoji";
import { lerPayloadDeBot } from "../traducao/embed";
import { mensagemParaDiscord } from "../traducao/mensagem";
import { usuarioParaDiscord } from "../traducao/usuario";
import { BotAtual } from "./bot-atual";
import {
  corpoDeMensagemSchema,
  edicaoDeMensagemSchema,
  lerQueryDoHistorico,
  type CorpoDeMensagem,
  type EdicaoDeMensagem,
} from "./corpos";
import { remocaoEmLoteSchema, type CorpoDeRemocaoEmLote } from "./corpos-membros";

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
 * Escrever é `MessagesService.criarComoBot(canal, botUserId, …)` (onda 3; antes
 * `create`): a
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
 * **Reações (F5).** A F1 tinha só o par do `@me`; agora estão as seis rotas do
 * Discord:
 *
 * | Método | Rota | Quem pode |
 * |---|---|---|
 * | PUT/DELETE | `.../reactions/:emoji/@me` | quem tem `ADD_REACTIONS` |
 * | DELETE | `.../reactions/:emoji/:uid` | `MANAGE_MESSAGES` (`@me` cai na rota acima) |
 * | GET | `.../reactions/:emoji?limit&after` | quem lê o canal |
 * | DELETE | `.../reactions/:emoji` | `MANAGE_MESSAGES` |
 * | DELETE | `.../reactions` | `MANAGE_MESSAGES` |
 *
 * O `:emoji` vem de dois jeitos e os dois passam por `lerEmojiDaRota`: unicode
 * **percent-encoded** (`%F0%9F%91%8D`) e personalizado como **`nome:snowflake`**
 * — nunca com o nosso cuid, que a casca esconde. Emoji personalizado que não
 * existe aqui leva 10014, não 404 mudo.
 *
 * A ordem de declaração importa: `.../:emoji/@me` vem **antes** de
 * `.../:emoji/:uid`, senão o `@me` casaria como se fosse um id de usuário.
 */
/** O teto do `bulk-delete` do Discord: 14 dias, em milissegundos. */
const DUAS_SEMANAS_EM_MS = 14 * 24 * 60 * 60 * 1000;

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
    private readonly reacoes: ReacoesDeCompatService,
    private readonly moderacao: ModerationService,
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
    // ── onda 3 ── embeds/componentes/flags numa consulta só para a página: a
    // linha do `DadosDeCompatService` ainda não os traz
    const payloads = await this.mensagens.payloadsDeBot(linhas.map((l) => l.id));
    return linhas.map((l) => mensagemParaDiscord({ ...l, payloadDeBot: payloads.get(l.id) ?? null }));
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

    const anexos = dados.attachment_ids ?? [];
    // ── onda 3 ── embeds e componentes são **guardados** no formato do Discord
    // (até aqui o embed era achatado em texto e o componente, descartado). A
    // validação é a do Discord, com os limites dele: corpo inválido leva
    // `50035` com o detalhe por campo, e mensagem sem texto, embed, componente
    // nem anexo continua levando `content[BASE_TYPE_REQUIRED]`.
    const lido = lerPayloadDeBot(dados, { temAnexos: anexos.length > 0 });
    if (!lido.ok) throw corpoInvalido(lido.erros);

    const resposta = await this.resposta(dados);
    const mensagem = await this.mensagens.criarComoBot(canalId, bot.botUserId, {
      content: lido.payload.content ?? "",
      embeds: lido.payload.embeds ?? [],
      components: lido.payload.components ?? [],
      // `EPHEMERAL` só vale em resposta de interação; numa mensagem de canal o
      // Discord a ignora, e aqui também
      flags: (lido.payload.flags ?? 0) & ~FLAGS_DE_MENSAGEM.EPHEMERAL,
      attachmentIds: anexos,
      reply: resposta,
    });

    // o gateway do web faz este emit no `onMessage`; o bot não tem socket, então
    // é aqui. O `nonce` é ecoado como lá — o cliente troca a mensagem otimista.
    const nonce = typeof dados.nonce === "string" ? dados.nonce : undefined;
    this.realtime.emitToChannel(
      canalId,
      WS_EVENTS.MESSAGE_NEW,
      nonce ? { ...mensagem, nonce } : mensagem,
    );

    return this.reler(mensagem.id, bot.botUserId, mensagem);
  }

  /**
   * ── F5 membros ── `POST /channels/:id/messages/bulk-delete`: apaga de 2 a
   * 100 mensagens de uma vez. **204 sem corpo.** Exige `MANAGE_MESSAGES`.
   *
   * É a rota do `channel.bulkDelete(5)` do discord.js e do `/limpar` de todo
   * bot de moderação. Declarada **antes** de `@Get(":mid")` só por clareza — o
   * método é outro, então não haveria captura; o que importa de verdade é que
   * `bulk-delete` não é um snowflake e nunca casaria com `:mid` num GET.
   *
   * Quem apaga é `ModerationService.bulkDelete`: ele confere
   * `MANAGE_MESSAGES` no canal (`canModerateChannel`), recusa ids que são de
   * **outro** canal (senão a rota seria um jeito de apagar onde o bot não
   * modera), apaga numa consulta só e emite `messages.bulkDeleted` — o evento
   * que o navegador já escuta, e por isso as mensagens somem da tela sem F5.
   *
   * As duas regras que são **do Discord** e não existem do lado de cá ficam
   * aqui, antes de chamar o service:
   *
   * 1. **2..100** (`50035`) — o `bulkDelete` do Streamz aceita 1, o do Discord
   *    não, e o discord.js conta com a recusa (é o que o faz cair para o
   *    `DELETE` de uma mensagem só quando o lote tem uma).
   * 2. **Nada com mais de 14 dias** (`50034`) — a idade sai do **próprio
   *    snowflake** (`snowflakeParaData`), sem ir ao banco: o id do Discord
   *    carrega o instante de criação, e é exatamente assim que o servidor deles
   *    valida.
   */
  @Post("bulk-delete")
  @HttpCode(204)
  async apagarEmLote(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Body(zodBody(remocaoEmLoteSchema)) dados: CorpoDeRemocaoEmLote,
  ): Promise<void> {
    const canalId = await this.cuidDoCanal(id);

    const limite = Date.now() - DUAS_SEMANAS_EM_MS;
    const cuids: string[] = [];
    for (const snowflake of new Set(dados.messages)) {
      if (!ehSnowflake(snowflake)) throw mensagemDesconhecida();
      if (snowflakeParaData(BigInt(snowflake)).getTime() < limite) throw mensagemAntigaDemais();
      const cuid = await this.ids.cuidDeMensagem(snowflake);
      // mensagem que já não existe: o Discord ignora em silêncio dentro do
      // lote (o bot costuma ter buscado a lista segundos antes), e não faz o
      // lote inteiro falhar
      if (cuid) cuids.push(cuid);
    }
    if (cuids.length === 0) throw mensagemDesconhecida();

    await this.moderacao.bulkDelete(bot.botUserId, canalId, cuids);
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
    const payloads = await this.mensagens.payloadsDeBot([linha.id]);
    return mensagemParaDiscord({ ...linha, payloadDeBot: payloads.get(linha.id) ?? null });
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

    // ── onda 3 ── `content`, `embeds`, `components` e `flags` são editáveis, com
    // a semântica do PATCH do Discord: ausente não mexe, presente substitui. Um
    // corpo sem nenhum dos quatro é um no-op que devolve a mensagem.
    const lido = lerPayloadDeBot(dados);
    if (!lido.ok) throw corpoInvalido(lido.erros);
    const p = lido.payload;
    if (p.content === undefined && p.embeds === undefined && p.components === undefined && p.flags === undefined) {
      return this.reler(mensagemId, bot.botUserId);
    }

    const mensagem = await this.mensagens.editarComoBot(mensagemId, bot.botUserId, p);
    this.realtime.emitToChannel(mensagem.channelId, WS_EVENTS.MESSAGE_UPDATED, mensagem);
    return this.reler(mensagemId, bot.botUserId, mensagem);
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
    const token = await this.tokenDoEmoji(emoji);
    const mensagem = await this.mensagens.addReaction(mensagemId, bot.botUserId, token);
    // F5: o par `message.updated` (navegador) + `reaction.added` (ponte dos
    // bots). Ver `messages/eventos-de-reacao.ts`.
    anunciarReacao(this.realtime, "add", mensagem, bot.botUserId, token);
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
    const token = await this.tokenDoEmoji(emoji);
    const mensagem = await this.mensagens.removeReaction(mensagemId, bot.botUserId, token);
    anunciarReacao(this.realtime, "remove", mensagem, bot.botUserId, token);
  }

  /**
   * ── F5 ── Tira a reação de outra pessoa. `MANAGE_MESSAGES`.
   *
   * Declarada **depois** do `/@me` de propósito: o Express casa na ordem, e
   * invertê-las faria `@me` chegar aqui como se fosse um id de usuário.
   */
  @Delete(":mid/reactions/:emoji/:uid")
  @HttpCode(204)
  async tirarReacaoDeAlguem(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("mid") mid: string,
    @Param("emoji") emoji: string,
    @Param("uid") uid: string,
  ): Promise<void> {
    await this.cuidDoCanal(id);
    const mensagemId = await this.cuidDaMensagem(mid);
    const token = await this.tokenDoEmoji(emoji);
    const alvo = await this.ids.cuidDeUsuario(uid);
    // usuário que não existe: nada a tirar. O Discord devolve 204 nesse caso
    // (a rota é idempotente), e é o que o `reaction.users.remove()` espera.
    if (!alvo) return;

    const mensagem = await this.mensagens.removeReactionOf(
      mensagemId,
      bot.botUserId,
      alvo,
      token,
    );
    anunciarReacao(this.realtime, "remove", mensagem, alvo, token);
  }

  /**
   * ── F5 ── Quem reagiu com um emoji. `?limit` (1..100, padrão 25) e `?after`.
   *
   * É a rota do bot de votação: `reaction.users.fetch()`. O cursor é o
   * snowflake do usuário, como no Discord.
   */
  @Get(":mid/reactions/:emoji")
  async quemReagiu(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("mid") mid: string,
    @Param("emoji") emoji: string,
    @Query() query: Record<string, string>,
  ): Promise<UsuarioDoDiscord[]> {
    await this.canalDoBot(bot, id);
    const mensagemId = await this.cuidDaMensagem(mid);
    await this.confereQueEDoCanal(mensagemId, id);
    const token = await this.tokenDoEmoji(emoji);

    const usuarios = await this.reacoes.quemReagiu(mensagemId, token, {
      limit: query.limit === undefined ? undefined : Number(query.limit),
      after: query.after,
    });
    return usuarios.map(usuarioParaDiscord);
  }

  /** ── F5 ── Limpa as reações de um emoji só. `MANAGE_MESSAGES`. */
  @Delete(":mid/reactions/:emoji")
  @HttpCode(204)
  async limparEmoji(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("mid") mid: string,
    @Param("emoji") emoji: string,
  ): Promise<void> {
    await this.cuidDoCanal(id);
    const mensagemId = await this.cuidDaMensagem(mid);
    const token = await this.tokenDoEmoji(emoji);
    const mensagem = await this.mensagens.clearReactions(mensagemId, bot.botUserId, token);
    anunciarReacoesLimpas(this.realtime, mensagem, token);
  }

  /** ── F5 ── Limpa **todas** as reações da mensagem. `MANAGE_MESSAGES`. */
  @Delete(":mid/reactions")
  @HttpCode(204)
  async limparTudo(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("mid") mid: string,
  ): Promise<void> {
    await this.cuidDoCanal(id);
    const mensagemId = await this.cuidDaMensagem(mid);
    const mensagem = await this.mensagens.clearReactions(mensagemId, bot.botUserId, null);
    anunciarReacoesLimpas(this.realtime, mensagem, null);
  }

  // ── internos ───────────────────────────────────────────────

  /**
   * O `:emoji` da rota → o token com que a reação é gravada aqui dentro.
   *
   * Unicode passa direto (só percent-decode); personalizado vira
   * `<:nome:cuid>` depois de achar a linha pelo snowflake. Emoji personalizado
   * que não existe neste Streamz leva **10014**, e não um 404 mudo: é o código
   * que a lib do bot classifica.
   */
  private async tokenDoEmoji(cru: string): Promise<string> {
    const token = await this.reacoes.tokenDaRota(lerEmojiDaRota(cru));
    if (token === null) throw emojiDesconhecido();
    return token;
  }

  /**
   * A mensagem é mesmo deste canal?
   *
   * A mesma regra do `GET :mid`: o `:id` da rota é o que autoriza a leitura, e
   * uma mensagem de outro canal, para o bot, é o mesmo que não existir.
   */
  private async confereQueEDoCanal(mensagemId: string, idDoCanal: string): Promise<void> {
    const linha = await this.dados.mensagemPorCuid(mensagemId, null);
    if (!linha || linha.channelSnowflake !== BigInt(idDoCanal)) throw mensagemDesconhecida();
  }

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
   *
   * ── onda 3 ── embeds/componentes/flags saem do DTO quando quem chama já o
   * tem (acabou de criar ou editar), e de `payloadsDeBot` quando não.
   */
  private async reler(
    mensagemId: string,
    botUserId: string,
    dto?: MessageDTO,
  ): Promise<MensagemDoDiscord> {
    const linha = await this.dados.mensagemPorCuid(mensagemId, botUserId);
    if (!linha) throw mensagemDesconhecida();
    const payloadDeBot = dto
      ? { embeds: dto.embeds ?? [], components: dto.components ?? [], flags: dto.flags ?? 0 }
      : ((await this.mensagens.payloadsDeBot([mensagemId])).get(mensagemId) ?? null);
    return mensagemParaDiscord({ ...linha, payloadDeBot });
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



