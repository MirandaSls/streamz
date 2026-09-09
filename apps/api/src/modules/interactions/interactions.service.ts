import { BadRequestException, HttpStatus, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  ComandoDeApp,
  Message as MessageDTO,
  OpcaoDeComando,
} from "@streamz/shared";
import {
  MAX_ATTACHMENT_SIZE,
  paraBitfieldDoDiscord,
  TEXTO_PENSANDO,
  WS_EVENTS,
} from "@streamz/shared";
import { toPublicUser } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { CODIGO, ErroDoDiscord, corpoInvalido, naoImplementado } from "../discord-compat/erros";
import { DadosDeCompatService } from "../discord-compat/dados.service";
import { RegistroDeSessoes } from "../discord-compat/gateway/sessao";
import { IdsService } from "../discord-compat/ids.service";
import type { JsonDoDiscord, LinhaDeMensagem } from "../discord-compat/tipos";
import { canalParaDiscord } from "../discord-compat/traducao/canal";
import { cargoParaDiscord } from "../discord-compat/traducao/cargo";
import { membroParaDiscord } from "../discord-compat/traducao/membro";
import { usuarioParaDiscord } from "../discord-compat/traducao/usuario";
import { GuildsService } from "../guilds/guilds.service";
import { MessagesService } from "../messages/messages.service";
import { RealtimeService } from "../realtime/realtime.service";
import {
  efemeraParaDTO,
  efemeraParaLinhaDeMensagem,
  type ContextoDaEfemera,
  type LinhaEfemera,
} from "./efemeras";
import {
  BYTES_DO_TOKEN_DE_INTERACAO,
  FLAG_EFEMERA,
  TIPO_DE_CALLBACK,
  TIPO_DE_INTERACAO,
  VALIDADE_DA_INTERACAO_MS,
  type CorpoDeResposta,
  type EntradaDeInteracao,
  type InteracaoAutenticada,
  type InteracaoEmVoo,
  type OpcaoPreenchida,
} from "./tipos";

/** O idioma que vai em `locale`/`guild_locale`. O Streamz é só pt-BR. */
const IDIOMA = "pt-BR";

/** `data.type` de um comando de barra: CHAT_INPUT. */
const TIPO_CHAT_INPUT = 1;

/** As opções que resolvem um alvo e por isso **exigem** `resolved`. */
const TIPOS_COM_ALVO = new Set([6, 7, 8]);

/**
 * As colunas da `EphemeralMessage` que saem da tabela.
 *
 * É um `select` fechado, e não um `include`: a linha guarda texto que **uma
 * pessoa só** podia ver, e quanto menos lugares o carregam, menos há de onde
 * ele pode escapar. `ephemeralFor` vem junto de propósito — é a coluna que diz
 * para quem a mensagem é, e quem a emite tem de poder conferir.
 */
const SELECAO_EFEMERA = {
  id: true,
  snowflake: true,
  channelId: true,
  ephemeralFor: true,
  content: true,
  createdAt: true,
  editedAt: true,
} as const;

/** 404 `10062`. O atalho em `erros.ts` é do lote B — ver `CONTRATO-F3.md` §2. */
const interacaoDesconhecida = () =>
  new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.INTERACAO_DESCONHECIDA, "Unknown interaction");

/** 400 `40060`. */
const interacaoJaRespondida = () =>
  new ErroDoDiscord(
    HttpStatus.BAD_REQUEST,
    CODIGO.INTERACAO_JA_RESPONDIDA,
    "Interaction has already been acknowledged.",
  );

/** O que a linha do banco guarda em `Interaction.data` e o dispatch reusa. */
type DadosDaInteracao = JsonDoDiscord;

/**
 * O domínio das interações: criar, despachar para o bot e materializar a
 * resposta dele como mensagem do chat.
 *
 * ── Lote A (domínio) implementa. Lote B (REST compat) **só chama**. ──
 *
 * As assinaturas abaixo são o contrato entre os dois lotes e **não mudam**
 * durante a fase.
 *
 * O caminho inteiro, do `/play` ao `pong` na tela:
 *
 * ```
 * composer: "/play never gonna give you up"
 *    │ POST /api/channels/:id/interactions { commandId, options }   (JwtGuard)
 *    ▼
 * criarInteracao()
 *    • acha o ApplicationCommand e confere que o bot é membro do servidor
 *    • confere que **quem digitou** pode escrever no canal
 *    • cria Interaction { snowflake, token, expiresAt = agora + 15 min }
 *    • despacha INTERACTION_CREATE nas sessões de gateway do bot
 *    ▼
 * bot (discord.js): interactionCreate → deferReply()
 *    │ POST /api/v10/interactions/:id/:token/callback { type: 5 }   (sem auth)
 *    ▼
 * responder(5) → MessagesService.create(autor = bot, "pensando…")
 *              → emitToChannel("message.new")  → aparece na tela, sem F5
 *    ▼
 * bot: editReply('pong')
 *    │ PATCH /api/v10/webhooks/:app/:token/messages/@original
 *    ▼
 * editarOriginal() → MessagesService.edit → emitToChannel("message.updated")
 * ```
 *
 * **A casca não reimplementa permissão.** Quem escreve é o usuário-bot, por
 * `MessagesService.create`, e é ele que leva o 403 se o bot não vir o canal —
 * a prova 4 da fase depende exatamente disso. A única exceção é a efêmera, que
 * não passa por lá e por isso repete o `assertCanPostChannel` explicitamente
 * (ver `escreverEfemera`).
 *
 * **`flags: 64` é a mensagem efêmera**, e ela é o único caminho deste arquivo
 * que **não** escreve na `Message`: ela vira uma linha de `EphemeralMessage` e
 * sai por `emitToUser(invocador)`, com `efemera: true` no DTO. `@original`
 * (editar, ler, apagar) e followups efêmeros seguem o mesmo caminho. Ver o
 * bloco "j-bots: a mensagem efêmera" mais abaixo.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9 e o `CONTRATO-F3.md`.
 */
@Injectable()
export class InteractionsService {
  private readonly log = new Logger(InteractionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly mensagens: MessagesService,
    private readonly realtime: RealtimeService,
    private readonly ids: IdsService,
    private readonly dados: DadosDeCompatService,
    private readonly sessoes: RegistroDeSessoes,
  ) {}

  // ── o lado de cá: o web dispara ────────────────────────────

  /**
   * Cria a interação e a despacha para o bot.
   *
   * Recusas, todas antes de gravar:
   * - comando inexistente, ou de um servidor que não é o do canal → 404;
   * - o usuário-bot não é membro do servidor → 404 (para quem digitou, um
   *   comando de um bot que saiu é um comando que não existe);
   * - quem digitou não pode escrever no canal → 403 (`assertCanPostChannel`);
   * - opção obrigatória faltando, ou de tipo errado → 400.
   *
   * O despacho é **melhor esforço**: bot desconectado não é erro da chamada —
   * a interação existe, expira em 15 min e ninguém responde. É o que o Discord
   * faz, e é o que deixa o composer devolver na hora.
   */
  async criarInteracao(entrada: EntradaDeInteracao): Promise<InteracaoEmVoo> {
    const comando = await this.prisma.applicationCommand.findUnique({
      where: { id: entrada.commandId },
      select: {
        id: true,
        snowflake: true,
        name: true,
        options: true,
        guildId: true,
        applicationId: true,
        application: { select: { id: true, snowflake: true, botUserId: true } },
      },
    });
    if (!comando) throw new NotFoundException("Comando não encontrado");

    const canal = await this.prisma.channel.findUnique({
      where: { id: entrada.canalId },
      select: { id: true, guildId: true },
    });
    if (!canal) throw new NotFoundException("Canal não encontrado");

    // Comando de barra em conversa direta é F5: não há `GuildMember` do bot
    // para checar, nem `member` para pôr no payload. Para quem digitou, o
    // comando simplesmente não existe ali — 404, como um comando de outro
    // servidor. (Divergência registrada: o §9 não trata a DM.)
    const guildId = canal.guildId;
    if (!guildId) throw new NotFoundException("Comando não encontrado");

    // comando por servidor só vale no servidor dele; global vale em qualquer um
    if (comando.guildId !== null && comando.guildId !== guildId) {
      throw new NotFoundException("Comando não encontrado");
    }

    // "o bot está no servidor" é a linha de `GuildMember` do usuário-bot. A
    // instalação (`GuildApplication`) é a migration 3, da F4 — ver §10 do
    // `CONTRATO-F3.md`.
    const botUserId = comando.application.botUserId;
    const membroBot = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: botUserId, guildId } },
      select: { userId: true },
    });
    if (!membroBot) throw new NotFoundException("Comando não encontrado");

    // quem digitou precisa poder escrever aqui: 403 vem daqui, e não do bot
    await this.guilds.assertCanPostChannel(entrada.usuarioId, entrada.canalId);

    const opcoes = this.conferirOpcoes(this.opcoesDeclaradas(comando.options), entrada.opcoes);

    const dadosDoComando = await this.montarData(
      { snowflake: comando.snowflake, name: comando.name, guildId: comando.guildId },
      guildId,
      opcoes,
    );

    const token = randomBytes(BYTES_DO_TOKEN_DE_INTERACAO).toString("base64url");
    const expiresAt = new Date(Date.now() + VALIDADE_DA_INTERACAO_MS);

    const linha = await this.prisma.interaction.create({
      data: {
        applicationId: comando.applicationId,
        token,
        userId: entrada.usuarioId,
        channelId: entrada.canalId,
        guildId,
        commandId: comando.id,
        commandName: comando.name,
        data: dadosDoComando as Prisma.InputJsonValue,
        expiresAt,
      },
      select: { id: true, snowflake: true },
    });

    await this.despachar({
      snowflake: linha.snowflake,
      applicationSnowflake: comando.application.snowflake,
      botUserId,
      token,
      guildId,
      canalId: entrada.canalId,
      usuarioId: entrada.usuarioId,
      data: dadosDoComando,
    });

    return {
      id: linha.id,
      snowflake: linha.snowflake,
      token,
      nome: comando.name,
      expiraEm: expiresAt,
      applicationId: comando.applicationId,
      botUserId,
    };
  }

  /** Os comandos que valem naquele servidor — o `GET /api/guilds/:id/comandos-de-app`. */
  async comandosDoServidor(guildId: string, usuarioId: string): Promise<ComandoDeApp[]> {
    // ver o servidor é condição para ver os comandos dele
    await this.guilds.assertMember(usuarioId, guildId);

    // só os bots que estão de fato no servidor: um app cujo bot saiu não
    // sugere comando nenhum (é a mesma regra do 404 de `criarInteracao`)
    const botsPresentes = await this.prisma.guildMember.findMany({
      where: { guildId, user: { isBot: true } },
      select: { userId: true },
    });
    if (botsPresentes.length === 0) return [];

    const linhas = await this.prisma.applicationCommand.findMany({
      where: {
        type: TIPO_CHAT_INPUT,
        // global (guildId null) ou registrado para este servidor
        OR: [{ guildId: null }, { guildId }],
        application: { botUserId: { in: botsPresentes.map((m) => m.userId) } },
      },
      select: {
        id: true,
        snowflake: true,
        name: true,
        description: true,
        options: true,
        application: { select: { id: true, name: true, botUser: true } },
      },
      orderBy: { name: "asc" },
    });

    return linhas.map((c) => ({
      id: c.id,
      snowflake: String(c.snowflake),
      name: c.name,
      description: c.description,
      options: this.opcoesDeclaradas(c.options),
      applicationId: c.application.id,
      applicationName: c.application.name,
      botUser: toPublicUser(c.application.botUser),
    }));
  }

  // ── o lado de lá: o bot responde ───────────────────────────

  /**
   * Resolve o token do caminho, ou lança o erro do Discord já pronto.
   *
   * É o "guard" das rotas de callback e followup — e é o **único** credencial
   * delas: o `@discordjs/rest` manda essas requisições com `auth: false`, sem
   * `Authorization` nenhum. Um `BotTokenGuard` ali daria 401 em tudo.
   *
   * - token que não existe, ou expirado (> 15 min) → 404 `10062`;
   * - `:id` (ou `:app`) do caminho que não bate com a linha → 404 `10062`,
   *   e não 403: para quem não tem o token, a interação não existe.
   *   (A conferência do `:id` é do controller; aqui saem os campos para ela.)
   */
  async porToken(token: string): Promise<InteracaoAutenticada> {
    const linha = await this.prisma.interaction.findUnique({
      where: { token },
      select: {
        id: true,
        snowflake: true,
        applicationId: true,
        channelId: true,
        userId: true,
        guildId: true,
        responseMessageId: true,
        respondedAt: true,
        expiresAt: true,
        application: { select: { snowflake: true, botUserId: true } },
      },
    });
    if (!linha) throw interacaoDesconhecida();
    // A expiração é conferida na leitura, e não pelo sumiço da linha: a faxina
    // do `MaintenanceService` roda quando roda, e o bot não pode depender dela.
    if (linha.expiresAt.getTime() <= Date.now()) throw interacaoDesconhecida();

    return {
      id: linha.id,
      snowflake: linha.snowflake,
      applicationId: linha.applicationId,
      applicationSnowflake: linha.application.snowflake,
      botUserId: linha.application.botUserId,
      canalId: linha.channelId,
      usuarioId: linha.userId,
      guildId: linha.guildId,
      responseMessageId: linha.responseMessageId,
      respondedAt: linha.respondedAt,
      expiresAt: linha.expiresAt,
    };
  }

  /**
   * `POST /interactions/:id/:token/callback` — o tipo 4 e o tipo 5.
   *
   * - **4** `CHANNEL_MESSAGE_WITH_SOURCE`: escreve `data.content` no canal.
   * - **5** `DEFERRED_…`: escreve `TEXTO_PENSANDO`. É uma mensagem de verdade,
   *   porque o Streamz não tem "mensagem que ainda não existe"; o `editReply`
   *   depois vira uma edição normal.
   * - 6, 7, 8, 9 → 501 (F5).
   *
   * Segundo callback na mesma interação → 400 `40060`. A checagem é uma
   * escrita condicional no banco (`updateMany` com `respondedAt: null`), e não
   * um `if` depois de um `findUnique`: dois callbacks quase simultâneos — que é
   * o que um bot com bug faz — passariam pelos dois `if`.
   *
   * Devolve 204 sem corpo, como o Discord.
   */
  async responder(
    interacao: InteracaoAutenticada,
    tipo: number,
    dados: CorpoDeResposta | undefined,
  ): Promise<void> {
    // O 501 vem **antes** da escrita condicional: um callback que não sabemos
    // executar não pode gastar a única resposta da interação.
    if (
      tipo === TIPO_DE_CALLBACK.DEFERRED_UPDATE_MESSAGE ||
      tipo === TIPO_DE_CALLBACK.UPDATE_MESSAGE ||
      tipo === TIPO_DE_CALLBACK.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT ||
      tipo === TIPO_DE_CALLBACK.MODAL
    ) {
      throw naoImplementado(`callback type ${tipo}`);
    }
    if (
      tipo !== TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE &&
      tipo !== TIPO_DE_CALLBACK.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    ) {
      throw corpoInvalido({
        type: { _errors: [{ code: "BASE_TYPE_CHOICES", message: `Unknown callback type ${tipo}` }] },
      });
    }

    // Escrita condicional, e não `if` depois de `findUnique`: quem perde a
    // corrida leva 40060 em vez de escrever uma segunda mensagem.
    const tomada = await this.prisma.interaction.updateMany({
      where: { id: interacao.id, respondedAt: null },
      data: { respondedAt: new Date() },
    });
    if (tomada.count === 0) throw interacaoJaRespondida();

    const conteudo =
      tipo === TIPO_DE_CALLBACK.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        ? TEXTO_PENSANDO
        : this.conteudoDe(dados);

    await this.escreverComoBot(interacao, conteudo, true, dados);
  }

  /**
   * `flags: 64` — a efêmera.
   *
   * Vale para o callback **e** para o `deferReply({ ephemeral: true })`: o
   * discord.js manda a flag já no tipo 5, então o "pensando…" nasce efêmero e a
   * edição seguinte encontra a linha efêmera à espera.
   */
  private ehEfemera(dados: CorpoDeResposta | undefined): boolean {
    return ((dados?.flags ?? 0) & FLAG_EFEMERA) !== 0;
  }

  /**
   * `PATCH /webhooks/:app/:token/messages/@original` — o `editReply()`.
   *
   * Edita a mensagem que o callback criou. Sem callback antes (`respondedAt`
   * nulo) → 404 `10062`: não há original a editar.
   */
  async editarOriginal(
    interacao: InteracaoAutenticada,
    dados: CorpoDeResposta,
  ): Promise<MessageDTO> {
    // ── j-bots ── a efêmera vem primeiro, e tem de vir: quando a resposta foi
    // efêmera o `responseMessageId` é null (não há linha de `Message` para
    // apontar), e o `exigirOriginal` abaixo daria 404 num `editReply()` que o
    // Discord atende.
    const efemera = await this.efemeraOriginal(interacao.id);
    if (efemera) {
      this.avisarDoQueNaoEntregamos(dados);
      const linha = await this.prisma.ephemeralMessage.update({
        where: { id: efemera.id },
        data: { content: this.conteudoDe(dados), editedAt: new Date() },
        select: SELECAO_EFEMERA,
      });
      return this.emitirEfemera(interacao, linha, WS_EVENTS.MESSAGE_UPDATED);
    }

    const original = this.exigirOriginal(interacao);
    this.avisarDoQueNaoEntregamos(dados);

    const mensagem = await this.mensagens.edit(original, interacao.botUserId, this.conteudoDe(dados));
    // o bot não tem socket: o `message.updated` sai daqui, como no
    // `messages.controller.ts` da compat da F1
    this.realtime.emitToChannel(mensagem.channelId, WS_EVENTS.MESSAGE_UPDATED, mensagem);
    return mensagem;
  }

  /** `GET /webhooks/:app/:token/messages/@original` — o `fetchReply()`. */
  async lerOriginal(interacao: InteracaoAutenticada): Promise<MessageDTO> {
    const efemera = await this.efemeraOriginal(interacao.id);
    if (efemera) return efemeraParaDTO(efemera, await this.contextoDaEfemera(interacao));
    return this.mensagens.getDTO(this.exigirOriginal(interacao));
  }

  /** `DELETE /webhooks/:app/:token/messages/@original` — 204. */
  async apagarOriginal(interacao: InteracaoAutenticada): Promise<void> {
    // ── j-bots ── apagar a efêmera é apagar a linha e avisar **só** o dono
    // dela. Não há `emitToChannel` aqui, como não houve na criação: ninguém
    // mais no canal chegou a saber que ela existia.
    const efemera = await this.efemeraOriginal(interacao.id);
    if (efemera) {
      await this.prisma.ephemeralMessage.delete({ where: { id: efemera.id } });
      this.realtime.emitToUser(interacao.usuarioId, WS_EVENTS.MESSAGE_DELETED, {
        messageId: efemera.id,
        channelId: efemera.channelId,
        parentId: null,
      });
      return;
    }

    const original = this.exigirOriginal(interacao);
    const { channelId, parentId } = await this.mensagens.remove(original, interacao.botUserId);
    // `Interaction.responseMessageId` é `ON DELETE SET NULL`: apagar a mensagem
    // já desfaz a ligação, sem escrita nossa.
    this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_DELETED, {
      messageId: original,
      channelId,
      parentId,
    });
  }

  /**
   * `POST /webhooks/:app/:token` — o `followUp()`: uma mensagem nova no mesmo
   * canal, com a mesma faixa "usou /play".
   *
   * Followup **antes** de qualquer callback: o Discord aceita e trata como a
   * resposta original. Fazemos o mesmo (e gravamos o `responseMessageId`), em
   * vez de recusar — recusar quebraria um bot que funciona lá.
   */
  async followup(interacao: InteracaoAutenticada, dados: CorpoDeResposta): Promise<MessageDTO> {
    // vira a original só quando ainda não há uma; o segundo followup é uma
    // mensagem comum do bot, sem a faixa (é o que o Discord mostra também)
    //
    // ── j-bots ── o critério é `respondedAt`, e não `responseMessageId`: uma
    // resposta **efêmera** não tem linha de `Message` e portanto deixa o
    // `responseMessageId` null. Pelo critério antigo, um followup depois de um
    // `reply({ ephemeral: true })` se declararia "a original" e sequestraria o
    // `@original` da efêmera que já existe.
    const viraOriginal = interacao.respondedAt === null;
    if (viraOriginal) {
      await this.prisma.interaction.updateMany({
        where: { id: interacao.id, respondedAt: null },
        data: { respondedAt: new Date() },
      });
    }
    return this.escreverComoBot(interacao, this.conteudoDe(dados), viraOriginal, dados);
  }

  // ── internos ───────────────────────────────────────────────

  /**
   * Escreve a mensagem do bot, liga-a à interação quando é a original e emite
   * o `message.new`.
   *
   * O emit é nosso porque o bot não tem socket — quem o faz para o navegador é
   * o `chat.gateway`, no `onMessage`. Sem ele a resposta só aparece com F5, e
   * a prova 3 da fase falha. É o mesmo que o `messages.controller.ts` da compat
   * da F1 faz.
   *
   * A mensagem é **relida** depois de ligada: o DTO que sai de `create` ainda
   * não tem `interacao`, e é ele que vai no socket. Sem a releitura a faixa
   * "usou /play" só apareceria depois de um F5 — exatamente o que ela existe
   * para evitar.
   */
  private async escreverComoBot(
    interacao: InteracaoAutenticada,
    conteudo: string,
    ehOriginal: boolean,
    dados?: CorpoDeResposta,
  ): Promise<MessageDTO> {
    if (dados) this.avisarDoQueNaoEntregamos(dados);

    // ── j-bots ── `flags: 64`: a resposta não é do canal, é de uma pessoa.
    if (this.ehEfemera(dados)) {
      return this.escreverEfemera(interacao, conteudo, ehOriginal);
    }

    // permissão, modo lento e castigo saem de graça daqui — e é daqui que vem
    // o 403 `50013` quando o bot não enxerga o canal (prova 4 da fase)
    const criada = await this.mensagens.create(interacao.canalId, interacao.botUserId, conteudo);

    let mensagem = criada;
    if (ehOriginal) {
      await this.prisma.interaction.update({
        where: { id: interacao.id },
        data: { responseMessageId: criada.id },
      });
      mensagem = await this.mensagens.getDTO(criada.id);
    }

    this.realtime.emitToChannel(interacao.canalId, WS_EVENTS.MESSAGE_NEW, mensagem);
    return mensagem;
  }

  /** O `@original`, ou 404 `10062` — não há o que editar, ler nem apagar. */
  private exigirOriginal(interacao: InteracaoAutenticada): string {
    if (!interacao.responseMessageId) throw interacaoDesconhecida();
    return interacao.responseMessageId;
  }

  // ── j-bots: a mensagem efêmera ─────────────────────────────
  //
  // O modelo inteiro em três frases:
  //
  // 1. **Ela não vai para o histórico do canal.** Não é uma `Message`: é uma
  //    linha de `EphemeralMessage`, numa tabela que nenhuma consulta do chat lê.
  //    Por isso `GET /channels/:id/messages` não a lista — não por um `where`
  //    que alguém precisa lembrar de escrever.
  // 2. **Ela sai uma vez, para uma sala só.** `emitToUser(invocador)`, que é a
  //    sala com todas as conexões da conta de quem digitou o comando (desktop e
  //    site) e mais ninguém. Nunca `emitToChannel`.
  // 3. **Ela some ao recarregar.** Como não há rota que a devolva, o próximo
  //    `fetchHistory` do cliente não a traz. A linha continua no banco só pelos
  //    15 minutos em que o bot ainda pode editá-la, e a faxina a apaga.

  /**
   * Escreve a efêmera e a entrega ao invocador.
   *
   * **A checagem de permissão é explícita aqui**, e não sai de graça como no
   * caminho normal: quem a fazia era o `MessagesService.create`, por onde a
   * efêmera não passa. É o mesmo `assertCanPostChannel` que ele chama na
   * primeira linha, e é dele que vem o 403 `50013` quando o bot não enxerga o
   * canal — a prova 4 da fase vale igual para a efêmera.
   *
   * Modo lento e "escrever é ler" ficam de fora **de propósito**: a efêmera não
   * ocupa o canal (não há o que atrasar) e ninguém a lê senão quem a pediu (não
   * há o que marcar como lido).
   */
  private async escreverEfemera(
    interacao: InteracaoAutenticada,
    conteudo: string,
    ehOriginal: boolean,
  ): Promise<MessageDTO> {
    await this.guilds.assertCanPostChannel(interacao.botUserId, interacao.canalId);

    const linha = await this.prisma.ephemeralMessage.create({
      data: {
        interactionId: interacao.id,
        channelId: interacao.canalId,
        // a coluna que é a regra inteira
        ephemeralFor: interacao.usuarioId,
        authorId: interacao.botUserId,
        content: conteudo,
        original: ehOriginal,
        // a mesma janela do token: passados os 15 min não há mais o que editar
        expiresAt: interacao.expiresAt,
      },
      select: SELECAO_EFEMERA,
    });

    return this.emitirEfemera(interacao, linha, WS_EVENTS.MESSAGE_NEW);
  }

  /**
   * O DTO da efêmera e o `emit` dela — **sempre** por `emitToUser`.
   *
   * Este é o único lugar do arquivo que emite uma efêmera, e é curto para que
   * fique fácil de auditar: se algum dia aparecer um `emitToChannel` com uma
   * efêmera dentro, é aqui que ele não está.
   */
  private async emitirEfemera(
    interacao: InteracaoAutenticada,
    linha: LinhaEfemera,
    evento: string,
  ): Promise<MessageDTO> {
    const dto = efemeraParaDTO(linha, await this.contextoDaEfemera(interacao));
    this.realtime.emitToUser(linha.ephemeralFor, evento, dto);
    return dto;
  }

  /** A resposta efêmera original desta interação (o alvo do `@original`). */
  private async efemeraOriginal(interactionId: string): Promise<LinhaEfemera | null> {
    return this.prisma.ephemeralMessage.findFirst({
      where: { interactionId, original: true },
      select: SELECAO_EFEMERA,
    });
  }

  /**
   * Quem é o bot, quem é o invocador e qual o comando — o que a efêmera não
   * guarda porque a interação já guarda.
   *
   * Uma consulta só, e não três: é a `Interaction` com os dois usuários
   * embutidos.
   */
  private async contextoDaEfemera(interacao: InteracaoAutenticada): Promise<ContextoDaEfemera> {
    const linha = await this.prisma.interaction.findUnique({
      where: { id: interacao.id },
      select: {
        commandName: true,
        guildId: true,
        user: true,
        application: { select: { botUser: true } },
      },
    });
    if (!linha) throw interacaoDesconhecida();
    return {
      bot: toPublicUser(linha.application.botUser),
      invocador: toPublicUser(linha.user),
      interacaoId: interacao.id,
      comando: linha.commandName,
      guildId: linha.guildId,
    };
  }

  /**
   * A efêmera pelo cuid, no formato do Discord — o corpo que o `editReply()` e
   * o `followUp()` recebem de volta.
   *
   * Devolve `null` quando o id não é de uma efêmera, e o lote B trata isso como
   * "mensagem desconhecida". A rota **não** confere quem está pedindo, e não
   * precisa: só quem tem o token da interação chega até aqui, e o token é o
   * credencial da interação inteira.
   */
  async linhaEfemeraParaCompat(id: string): Promise<LinhaDeMensagem | null> {
    const linha = await this.prisma.ephemeralMessage.findUnique({
      where: { id },
      select: { ...SELECAO_EFEMERA, authorId: true },
    });
    return linha ? this.linhaEfemeraDeCompat(linha, linha.authorId) : null;
  }

  /** A efêmera original da interação, no formato do Discord (o `with_response`). */
  async linhaEfemeraOriginalParaCompat(
    interactionId: string,
  ): Promise<LinhaDeMensagem | null> {
    const linha = await this.prisma.ephemeralMessage.findFirst({
      where: { interactionId, original: true },
      select: { ...SELECAO_EFEMERA, authorId: true },
    });
    return linha ? this.linhaEfemeraDeCompat(linha, linha.authorId) : null;
  }

  /** Os snowflakes que a tradução do Discord exige e a efêmera não guarda. */
  private async linhaEfemeraDeCompat(
    linha: LinhaEfemera,
    autorId: string,
  ): Promise<LinhaDeMensagem | null> {
    const [canal, autor] = await Promise.all([
      this.dados.canalPorCuid(linha.channelId),
      this.dados.usuarioPorCuid(autorId),
    ]);
    if (!canal || !autor) return null;
    return efemeraParaLinhaDeMensagem(linha, {
      autor,
      channelSnowflake: canal.snowflake,
      guildSnowflake: canal.guildSnowflake,
    });
  }

  /**
   * O texto da resposta.
   *
   * `embeds` e `components` chegam inteiros (o `@Body()` cru os preserva) e são
   * descartados com aviso: embed rico e botão são F5, e fingir que funcionaram
   * seria pior do que dizer que não.
   */
  private conteudoDe(dados: CorpoDeResposta | undefined): string {
    return (dados?.content ?? "").trim();
  }

  /** O que o bot mandou e a F3 não entrega. Log, e a chamada segue. */
  private avisarDoQueNaoEntregamos(dados: CorpoDeResposta): void {
    if (dados.embeds?.length) this.log.warn(`embeds descartados (${dados.embeds.length}): F5`);
    if (dados.components?.length) {
      this.log.warn(`components descartados (${dados.components.length}): F5`);
    }
    // `flags: 64` (efêmera) **não** entra aqui: ela é entregue de verdade, por
    // `escreverEfemera`. Ver o bloco "j-bots: a mensagem efêmera" abaixo.
  }

  /** As opções declaradas pelo comando, como o `PUT` do bot as gravou. */
  private opcoesDeclaradas(json: unknown): OpcaoDeComando[] {
    return Array.isArray(json) ? (json as OpcaoDeComando[]) : [];
  }

  /**
   * Confere o que o composer mandou contra o que o comando declara.
   *
   * Opção obrigatória faltando, opção não declarada, nome repetido ou valor do
   * tipo errado → 400. É a última linha antes de gravar: o bot recebe o que
   * pediu, ou ninguém recebe nada.
   */
  private conferirOpcoes(
    declaradas: OpcaoDeComando[],
    preenchidas: OpcaoPreenchida[],
  ): OpcaoPreenchida[] {
    const vistas = new Set<string>();
    for (const opcao of preenchidas) {
      if (vistas.has(opcao.nome)) {
        throw new BadRequestException(`Opção repetida: ${opcao.nome}`);
      }
      vistas.add(opcao.nome);

      const declarada = declaradas.find((d) => d.name === opcao.nome);
      if (!declarada) throw new BadRequestException(`Opção desconhecida: ${opcao.nome}`);
      if (declarada.type !== opcao.tipo) {
        throw new BadRequestException(`Opção ${opcao.nome}: tipo errado`);
      }
      if (!this.valorCombina(opcao)) {
        throw new BadRequestException(`Opção ${opcao.nome}: valor inválido`);
      }
    }

    for (const declarada of declaradas) {
      if (declarada.required && !vistas.has(declarada.name)) {
        throw new BadRequestException(`Opção obrigatória faltando: ${declarada.name}`);
      }
    }

    // a ordem do bot é a do comando, não a de quem digitou
    return declaradas
      .map((d) => preenchidas.find((p) => p.nome === d.name))
      .filter((p): p is OpcaoPreenchida => p !== undefined);
  }

  /** O tipo do Discord contra o tipo do valor de verdade. */
  private valorCombina(opcao: OpcaoPreenchida): boolean {
    switch (opcao.tipo) {
      case 3:
        return typeof opcao.valor === "string";
      case 4:
        return typeof opcao.valor === "number" && Number.isInteger(opcao.valor);
      case 10:
        return typeof opcao.valor === "number" && Number.isFinite(opcao.valor);
      case 5:
        return typeof opcao.valor === "boolean";
      // 6 user, 7 channel, 8 role: o valor é o **cuid** do alvo; a tradução
      // para snowflake é da montagem do payload, que é quem sabe que o número
      // é para o bot ler
      case 6:
      case 7:
      case 8:
        return typeof opcao.valor === "string" && opcao.valor.length > 0;
      default:
        return false;
    }
  }

  /**
   * O `data` do `INTERACTION_CREATE` — e o que fica gravado na linha.
   *
   * O `resolved` é **obrigatório** quando há opção de tipo 6, 7 ou 8: o
   * `_get_namespace` do discord.py resolve o alvo por ele e levanta se não
   * achar, e o `getUser()` do discord.js devolve `null`, o que o bot lê como
   * "não veio".
   */
  private async montarData(
    comando: { snowflake: bigint; name: string; guildId: string | null },
    guildId: string,
    opcoes: OpcaoPreenchida[],
  ): Promise<DadosDaInteracao> {
    const usuarios: Record<string, unknown> = {};
    const membros: Record<string, unknown> = {};
    const canais: Record<string, unknown> = {};
    const cargos: Record<string, unknown> = {};

    const saida: JsonDoDiscord[] = [];
    for (const opcao of opcoes) {
      if (!TIPOS_COM_ALVO.has(opcao.tipo)) {
        saida.push({ name: opcao.nome, type: opcao.tipo, value: opcao.valor });
        continue;
      }

      const alvo = String(opcao.valor);
      const snowflake = await this.resolver(opcao.tipo, alvo, guildId, {
        usuarios,
        membros,
        canais,
        cargos,
      });
      saida.push({ name: opcao.nome, type: opcao.tipo, value: snowflake });
    }

    const data: DadosDaInteracao = {
      id: String(comando.snowflake),
      name: comando.name,
      type: TIPO_CHAT_INPUT,
      options: saida,
      // sempre presente, mesmo vazio: o discord.js lê `data.resolved` sem
      // guarda em alguns caminhos, e um objeto vazio não custa nada
      resolved: { users: usuarios, members: membros, channels: canais, roles: cargos },
    };
    // `guild_id` só em comando registrado por servidor — é o que o Discord faz
    if (comando.guildId !== null) {
      const sf = await this.ids.snowflakeDeServidor(comando.guildId);
      if (sf !== null) data.guild_id = String(sf);
    }
    return data;
  }

  /** Um alvo de opção 6/7/8: vira snowflake e entra no `resolved`. */
  private async resolver(
    tipo: number,
    cuid: string,
    guildId: string,
    resolvido: {
      usuarios: Record<string, unknown>;
      membros: Record<string, unknown>;
      canais: Record<string, unknown>;
      cargos: Record<string, unknown>;
    },
  ): Promise<string> {
    if (tipo === 6) {
      const usuario = await this.dados.usuarioPorCuid(cuid);
      if (!usuario) throw new BadRequestException("Usuário da opção não encontrado");
      const chave = String(usuario.snowflake);
      resolvido.usuarios[chave] = usuarioParaDiscord(usuario);
      const membro = await this.dados.membroDoServidor(guildId, cuid);
      // `resolved.members` vai **sem** o `user` dentro: no Discord o usuário
      // está em `resolved.users`, e a lib junta os dois pela chave
      if (membro) resolvido.membros[chave] = membroParaDiscord(membro, false);
      return chave;
    }

    if (tipo === 7) {
      const canal = await this.dados.canalPorCuid(cuid);
      if (!canal) throw new BadRequestException("Canal da opção não encontrado");
      const chave = String(canal.snowflake);
      resolvido.canais[chave] = canalParaDiscord(canal);
      return chave;
    }

    const cargos = await this.dados.cargosDoServidor(guildId);
    const cargo = cargos.find((c) => c.id === cuid);
    if (!cargo) throw new BadRequestException("Cargo da opção não encontrado");
    const chave = String(cargo.snowflake);
    resolvido.cargos[chave] = cargoParaDiscord(cargo);
    return chave;
  }

  /**
   * Monta o `INTERACTION_CREATE` e o entrega **direto** nas sessões do bot.
   *
   * Direto, e não pelo `RealtimeService.onEvent`/`dispatch.ts`, de propósito:
   * uma interação não é um evento do tempo real do Streamz — ela nasce para o
   * bot. **E não é filtrada por intent**: `INTERACTION_CREATE` não tem intent
   * no Discord (é justamente a saída deles para bot sem `MESSAGE_CONTENT`), e
   * filtrar por `GUILD_MESSAGES` deixaria mudo um bot só de slash commands.
   *
   * Melhor esforço: bot desconectado não é erro da chamada.
   */
  private async despachar(entrada: {
    snowflake: bigint;
    applicationSnowflake: bigint;
    botUserId: string;
    token: string;
    guildId: string;
    canalId: string;
    usuarioId: string;
    data: DadosDaInteracao;
  }): Promise<void> {
    const sessoes = this.sessoes.porBot(entrada.botUserId);
    if (sessoes.length === 0) {
      // 200 mesmo assim: a interação existe, expira em 15 min e ninguém
      // responde — é o que o Discord faz com um bot offline.
      this.log.warn(`interação ${entrada.snowflake}: o bot não tem sessão de gateway aberta`);
      return;
    }

    let payload: JsonDoDiscord;
    try {
      payload = await this.montarInteractionCreate(entrada);
    } catch (erro) {
      this.log.error(`interação ${entrada.snowflake}: falha ao montar o payload: ${String(erro)}`);
      return;
    }

    for (const sessao of sessoes) {
      try {
        sessao.despachar("INTERACTION_CREATE", payload);
      } catch (erro) {
        // um socket com defeito não pode derrubar o `POST` do composer
        this.log.error(`interação ${entrada.snowflake}: falha ao despachar: ${String(erro)}`);
      }
    }
  }

  /**
   * O payload, campo por campo — o mais perigoso da fase.
   *
   * Campo faltando levanta `KeyError`/`TypeError` **dentro** da lib do bot, o
   * `interactionCreate` nunca dispara e o log não diz nada (foi o risco (a) da
   * F1, e aconteceu). Ver o §4 do `CONTRATO-F3.md`.
   *
   * - todo id é **string decimal** (um `bigint` num `JSON.stringify` lança);
   * - `member` traz o `user` dentro **e** `user` vem no topo: o Discord manda
   *   um em servidor e outro em DM, e mandar os dois cobre as duas libs;
   * - `app_permissions` é **string**, não número: o discord.js faz
   *   `new PermissionsBitField(BigInt(d.app_permissions))`.
   */
  private async montarInteractionCreate(entrada: {
    snowflake: bigint;
    applicationSnowflake: bigint;
    botUserId: string;
    token: string;
    guildId: string;
    canalId: string;
    usuarioId: string;
    data: DadosDaInteracao;
  }): Promise<JsonDoDiscord> {
    const [canal, membro, usuario, guildSnowflake, permissoes] = await Promise.all([
      this.dados.canalPorCuid(entrada.canalId),
      this.dados.membroDoServidor(entrada.guildId, entrada.usuarioId),
      this.dados.usuarioPorCuid(entrada.usuarioId),
      this.ids.snowflakeDeServidor(entrada.guildId),
      // a permissão **do bot** naquele canal: é o que o `memberPermissions` da
      // interação vale no discord.js
      this.guilds.permissionsInChannel(entrada.botUserId, entrada.guildId, entrada.canalId),
    ]);

    if (!canal || !usuario || guildSnowflake === null) {
      throw new Error("interação sem canal, usuário ou servidor");
    }

    const payload: JsonDoDiscord = {
      id: String(entrada.snowflake),
      application_id: String(entrada.applicationSnowflake),
      type: TIPO_DE_INTERACAO.APPLICATION_COMMAND,
      token: entrada.token,
      version: 1,
      guild_id: String(guildSnowflake),
      channel_id: String(canal.snowflake),
      channel: canalParaDiscord(canal),
      user: usuarioParaDiscord(usuario),
      app_permissions: String(paraBitfieldDoDiscord(permissoes)),
      locale: IDIOMA,
      guild_locale: IDIOMA,
      // monetização não existe aqui; a lista vazia é o que as libs esperam ver
      entitlements: [],
      authorizing_integration_owners: {},
      // **Obrigatório, e o documento não o previa.** O
      // `Interaction._from_data` do discord.py 2.7 lê
      // `data['attachment_size_limit']` **sem `.get`**: sem este campo o
      // `parse_interaction_create` levanta `KeyError` dentro da lib, o
      // `on_interaction` nunca dispara e o log do bot não diz nada. Foi a prova
      // com discord.py que pegou — nenhum teste unitário pegaria.
      attachment_size_limit: MAX_ATTACHMENT_SIZE,
      // 0 = GUILD (o contexto da interação)
      context: 0,
      data: entrada.data,
    };
    // com o `user` dentro: é de lá que o discord.py tira o autor da interação
    // em servidor
    if (membro) payload.member = membroParaDiscord(membro, true);

    return payload;
  }
}

// A faixa "usou /play" **não** entra aqui: o `MessagesService` a monta com um
// `include` do Prisma e o mapeador puro de `./dto.ts`. Injetar este service lá
// criaria um ciclo de módulos (`InteractionsModule` já importa
// `MessagesModule`), e um `import` de função pura não cria ciclo nenhum.
