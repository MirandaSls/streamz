import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  AutocompleteDeBotEvent,
  ComandoDeApp,
  InteracaoConcluidaEvent,
  InteracaoDeBotCriada,
  InteracaoFalhouEvent,
  Message as MessageDTO,
  ModalDeBot,
  ModalDeBotAbertoEvent,
  MotivoDaFalhaDeInteracao,
  OpcaoDeComando,
  PayloadDeBot,
  RespostaDeComponenteDeModal,
} from "@streamz/shared";
import {
  FLAGS_DE_MENSAGEM,
  lerComponentesGuardados,
  MAX_ATTACHMENT_SIZE,
  modalDeBotSchema,
  paraBitfieldDoDiscord,
  PRAZO_DA_RESPOSTA_DO_BOT_MS,
  respostaDeAutocompleteSchema,
  temFlag,
  TEXTO_PENSANDO,
  TIPO_DE_COMPONENTE,
  validarModalDeBot,
  WS_EVENTS,
} from "@streamz/shared";
import { toPublicUser } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { CODIGO, ErroDoDiscord, corpoInvalido, mensagemDesconhecida } from "../discord-compat/erros";
import { DadosDeCompatService, urlDoAnexoParaBot } from "../discord-compat/dados.service";
import { RegistroDeSessoes } from "../discord-compat/gateway/sessao";
import { IdsService } from "../discord-compat/ids.service";
import type { JsonDoDiscord, MensagemDoDiscord } from "../discord-compat/tipos";
import { canalParaDiscord, tipoDeCanalParaDiscord } from "../discord-compat/traducao/canal";
import { cargoParaDiscord } from "../discord-compat/traducao/cargo";
import { errosNoFormatoDoDiscord, lerPayloadDeBot } from "../discord-compat/traducao/embed";
import { mensagemParaDiscord, type LinhaDeMensagemDeBot } from "../discord-compat/traducao/mensagem";
import { membroParaDiscord } from "../discord-compat/traducao/membro";
import { usuarioParaDiscord } from "../discord-compat/traducao/usuario";
import { GuildsService } from "../guilds/guilds.service";
import { MessagesService } from "../messages/messages.service";
import { gravacaoDaEdicao, gravacaoDaMensagemNova, type GravacaoDeBot } from "../messages/payload-de-bot";
import { RealtimeService } from "../realtime/realtime.service";
import {
  acharComponenteInterativo,
  arquivoAceito,
  callbackPermitido,
  conferirClique,
  conferirEnvioDoModal,
  conferirPedidoDeAutocomplete,
  ehInteracaoDeComponente,
  type ComponenteDoEnvio,
  type OpcaoDoPedido,
  type Recusa,
} from "./componentes";
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
  // ── onda 3 ── embeds, componentes e flags da efêmera
  embeds: true,
  components: true,
  flags: true,
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
 * ── onda 3 ── O alvo do `@original` e do callback 7: uma `Message` (pelo cuid)
 * ou uma linha efêmera, com o id da interação **dona** da efêmera — que não é
 * necessariamente a interação corrente: um botão numa efêmera de `/play` edita
 * uma efêmera cuja faixa "usou /play" é da interação do comando.
 */
type AlvoDeEdicao =
  | { tipo: "mensagem"; id: string }
  | { tipo: "efemera"; linha: LinhaEfemera; interactionId: string };

/** ── onda 3 ── Os mapas de `resolved` que o `INTERACTION_CREATE` leva. */
interface Resolvido {
  usuarios: Record<string, unknown>;
  membros: Record<string, unknown>;
  canais: Record<string, unknown>;
  cargos: Record<string, unknown>;
}

/** O evento de uma interação sem o `motivo` — o que `success` e `failed` têm em comum. */
type EventoDaInteracao = Omit<InteracaoFalhouEvent, "motivo">;

/** A `Recusa` pura (`componentes.ts`) → a exceção do REST interno. */
function paraHttp(recusa: Recusa): BadRequestException | NotFoundException {
  return recusa.status === 404
    ? new NotFoundException(recusa.mensagem)
    : new BadRequestException(recusa.mensagem);
}

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
export class InteractionsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(InteractionsService.name);

  /**
   * ── onda 3 ── Os relógios dos 3 s, por cuid de interação (ver `agendarPrazo`).
   * Em memória **só como gatilho**: quem decide é a escrita condicional no
   * banco, então um callback que caia em outra instância da API desarma o
   * relógio daqui sem precisar avisar ninguém.
   */
  private readonly prazos = new Map<string, ReturnType<typeof setTimeout>>();

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
  async criarInteracao(
    // `nonce` aqui e não em `EntradaDeInteracao` (`tipos.ts`) só porque aquele
    // arquivo não é deste cartão; o controller o repassa de `interacaoCriarSchema`
    entrada: EntradaDeInteracao & { nonce?: string },
  ): Promise<InteracaoEmVoo> {
    const { comando, guildId, botUserId } = await this.acharComandoNoCanal(
      entrada.commandId,
      entrada.canalId,
    );

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
        // gravado para o callback 9 (`abrirModal`) e o `success`/`failed`
        // (`eventoDe`) voltarem casados na sessão do navegador que digitou
        nonce: entrada.nonce ?? null,
        data: dadosDoComando as Prisma.InputJsonValue,
        expiresAt,
      },
      select: { id: true, snowflake: true },
    });

    // Com `nonce`, o comando de barra ganha o que o componente já tinha: o
    // relógio dos 3 s ("O aplicativo não respondeu" do Discord) e o
    // `bot_offline` na hora. Sem `nonce` (cliente antigo) segue como na F3, sem
    // relógio e sem `interaction.*`: não há sessão do navegador para avisar, e
    // vencer o token aos 3 s mudaria o bot sem ninguém do outro lado ver a falha.
    const temSessao = await this.despachar({
      tipo: TIPO_DE_INTERACAO.APPLICATION_COMMAND,
      snowflake: linha.snowflake,
      applicationSnowflake: comando.application.snowflake,
      botUserId,
      token,
      guildId,
      canalId: entrada.canalId,
      usuarioId: entrada.usuarioId,
      data: dadosDoComando,
    });

    if (entrada.nonce) {
      const evento: EventoDaInteracao = {
        interactionId: linha.id,
        nonce: entrada.nonce,
        channelId: entrada.canalId,
        messageId: null,
        customId: null,
      };
      if (temSessao) this.agendarPrazo(evento, entrada.usuarioId);
      else this.emitirFalha(entrada.usuarioId, evento, "bot_offline");
    }

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

  /**
   * O comando, o servidor do canal e o usuário-bot — as recusas comuns ao
   * comando de barra e ao autocomplete, todas 404 (ver `criarInteracao`).
   */
  private async acharComandoNoCanal(commandId: string, canalId: string) {
    const comando = await this.prisma.applicationCommand.findUnique({
      where: { id: commandId },
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
      where: { id: canalId },
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

    return { comando, guildId, botUserId };
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

  // ── onda 3 · cartão 3a: componente, modal e autocomplete ───
  //
  // As três rotas internas de `docs/CONTRATO-ONDA-3.md` §4. Todas devolvem na
  // hora (`InteracaoDeBotCriada`) e nunca esperam o bot: o resultado volta pela
  // sala do usuário (`interaction.*`, §5), casado pelo `nonce` que o navegador
  // gerou. O desenho é o do cliente do Discord, que também recebe a resposta
  // pelo gateway — e é o que funciona quando o callback cai noutra instância.

  /**
   * `POST /api/channels/:id/interactions/componente` — clicar num botão ou
   * escolher num select de uma mensagem de bot (normal ou efêmera).
   *
   * Recusas, na ordem em que são conferidas (nada é gravado antes delas):
   * - canal inexistente, ou conversa direta (DM com bot é F5) → 404;
   * - quem clicou não vê o canal → 403. **Vem antes de achar a mensagem**: quem
   *   não vê o canal não fica sabendo se a mensagem existe;
   * - mensagem inexistente, de outro canal, efêmera de outra pessoa ou vencida,
   *   de autor que não é bot de aplicativo, ou bot fora do servidor → 404;
   * - `custom_id` que a mensagem não tem → 404;
   * - tipo que não confere, componente desabilitado, botão de link/premium,
   *   `values` fora das opções ou de `min_values`/`max_values` → 400.
   */
  async clicarComponente(entrada: {
    canalId: string;
    usuarioId: string;
    messageId: string;
    customId: string;
    componentType: number;
    values?: string[];
    nonce: string;
  }): Promise<InteracaoDeBotCriada> {
    const guildId = await this.servidorDoCanal(entrada.canalId);
    await this.guilds.assertCanViewChannel(entrada.usuarioId, entrada.canalId);

    const origem = await this.origemDoClique(entrada.messageId, entrada.canalId, entrada.usuarioId);
    const app = await this.aplicacaoNoServidor(origem.autorId, guildId);

    const componente = acharComponenteInterativo(origem.components, entrada.customId);
    const recusa = conferirClique(componente, entrada);
    if (recusa) throw paraHttp(recusa);
    if (!componente) throw new NotFoundException("Componente não encontrado");

    const data: DadosDaInteracao = {
      custom_id: entrada.customId,
      component_type: entrada.componentType,
    };
    if (componente.type === TIPO_DE_COMPONENTE.STRING_SELECT) {
      data.values = [...(entrada.values ?? [])];
    } else if (componente.type !== TIPO_DE_COMPONENTE.BUTTON) {
      // 5/6/7/8: a web manda cuids; o bot recebe snowflakes e o `resolved`
      // (sem ele o `users`/`roles` do select do discord.js sai vazio)
      const resolvido = novoResolvido();
      const snowflakes: string[] = [];
      for (const cuid of entrada.values ?? []) {
        snowflakes.push(
          await this.resolverValorDeSelect(
            componente.type,
            cuid,
            guildId,
            componente.type === TIPO_DE_COMPONENTE.CHANNEL_SELECT ? componente.channel_types : undefined,
            resolvido,
          ),
        );
      }
      data.values = snowflakes;
      data.resolved = resolvedDoDiscord(resolvido);
    }

    const ids =
      origem.tipo === "efemera"
        ? { messageId: null, ephemeralMessageId: origem.id }
        : { messageId: origem.id, ephemeralMessageId: null };
    const mensagem = await this.mensagemDeOrigemParaBot({ ...ids, botUserId: app.botUserId });
    if (!mensagem) throw new NotFoundException("Mensagem não encontrada");

    return this.criarEDespachar({
      tipo: TIPO_DE_INTERACAO.MESSAGE_COMPONENT,
      app,
      usuarioId: entrada.usuarioId,
      canalId: entrada.canalId,
      guildId,
      customId: entrada.customId,
      componentType: entrada.componentType,
      ...ids,
      nonce: entrada.nonce,
      data,
      mensagem,
    });
  }

  /**
   * `POST /api/channels/:id/interactions/modal` — enviar o modal que o bot abriu
   * com o callback 9.
   *
   * Confere contra `Interaction.modal` da interação que **recebeu** o modal:
   * existe, é de quem envia, é deste canal, não venceu e tem este `custom_id`
   * (senão 404). Os campos são conferidos por `conferirEnvioDoModal` (400). O
   * modal é zerado numa escrita condicional antes de criar a interação nova:
   * dois cliques em "Enviar" não viram dois `MODAL_SUBMIT`.
   */
  async enviarModal(entrada: {
    canalId: string;
    usuarioId: string;
    interactionId: string;
    customId: string;
    components: RespostaDeComponenteDeModal[];
    nonce: string;
  }): Promise<InteracaoDeBotCriada> {
    const naoAchou = () => new NotFoundException("Modal não encontrado");
    const origem = await this.prisma.interaction.findUnique({
      where: { id: entrada.interactionId },
      select: {
        id: true,
        userId: true,
        channelId: true,
        guildId: true,
        modal: true,
        expiresAt: true,
        messageId: true,
        ephemeralMessageId: true,
        application: { select: { botUserId: true } },
      },
    });
    if (
      !origem ||
      origem.userId !== entrada.usuarioId ||
      origem.channelId !== entrada.canalId ||
      origem.expiresAt.getTime() <= Date.now() ||
      origem.modal === null
    ) {
      throw naoAchou();
    }
    const lido = modalDeBotSchema.safeParse(origem.modal);
    if (!lido.success || lido.data.custom_id !== entrada.customId) throw naoAchou();
    const modal = lido.data;
    const guildId = origem.guildId;
    if (!guildId) throw naoAchou();

    await this.guilds.assertCanViewChannel(entrada.usuarioId, entrada.canalId);
    const app = await this.aplicacaoNoServidor(origem.application.botUserId, guildId);

    const conferido = conferirEnvioDoModal(modal, entrada.components);
    if (!conferido.ok) throw paraHttp(conferido.recusa);
    const { components, resolved } = await this.resolverEnvioDoModal(
      modal,
      conferido.components,
      guildId,
      entrada.usuarioId,
    );

    // um envio só: quem perde a corrida leva o mesmo 404 do modal já enviado
    const consumido = await this.prisma.interaction.updateMany({
      where: { id: origem.id, userId: entrada.usuarioId, modal: { not: Prisma.DbNull } },
      data: { modal: Prisma.DbNull },
    });
    if (consumido.count === 0) throw naoAchou();

    const data: DadosDaInteracao = { custom_id: modal.custom_id, components };
    if (resolved) data.resolved = resolved;

    // o `message` só vai quando o modal saiu de um componente (é o que o
    // Discord manda: `ModalSubmitInteraction.message` é null num modal de comando)
    const mensagem = await this.mensagemDeOrigemParaBot({
      messageId: origem.messageId,
      ephemeralMessageId: origem.ephemeralMessageId,
      botUserId: app.botUserId,
    });

    return this.criarEDespachar({
      tipo: TIPO_DE_INTERACAO.MODAL_SUBMIT,
      app,
      usuarioId: entrada.usuarioId,
      canalId: entrada.canalId,
      guildId,
      customId: modal.custom_id,
      componentType: null,
      messageId: origem.messageId,
      ephemeralMessageId: origem.ephemeralMessageId,
      nonce: entrada.nonce,
      data,
      mensagem,
    });
  }

  /**
   * `POST /api/channels/:id/interactions/autocomplete` — o composer pede
   * sugestões para a opção em foco.
   *
   * As recusas do comando de barra (404 comando/servidor/DM, 403 não pode
   * escrever) e mais uma: a opção em foco tem de declarar `autocomplete: true`
   * (400). Opção obrigatória faltando **não** é recusa — a pessoa está no meio
   * da digitação (ver `conferirPedidoDeAutocomplete`).
   */
  async pedirAutocomplete(entrada: {
    canalId: string;
    usuarioId: string;
    commandId: string;
    options: OpcaoDoPedido[];
    nonce: string;
  }): Promise<InteracaoDeBotCriada> {
    const { comando, guildId, botUserId } = await this.acharComandoNoCanal(
      entrada.commandId,
      entrada.canalId,
    );
    await this.guilds.assertCanPostChannel(entrada.usuarioId, entrada.canalId);

    const conferido = conferirPedidoDeAutocomplete(
      this.opcoesDeclaradas(comando.options),
      entrada.options,
    );
    if (!conferido.ok) throw paraHttp(conferido.recusa);

    const data = await this.montarData(
      { snowflake: comando.snowflake, name: comando.name, guildId: comando.guildId },
      guildId,
      conferido.opcoes.map((o) => ({ nome: o.name, tipo: o.type, valor: o.value })),
      conferido.emFoco,
    );

    return this.criarEDespachar({
      tipo: TIPO_DE_INTERACAO.APPLICATION_COMMAND_AUTOCOMPLETE,
      app: {
        id: comando.application.id,
        snowflake: comando.application.snowflake,
        botUserId,
      },
      usuarioId: entrada.usuarioId,
      canalId: entrada.canalId,
      guildId,
      commandId: comando.id,
      commandName: comando.name,
      customId: null,
      componentType: null,
      messageId: null,
      ephemeralMessageId: null,
      nonce: entrada.nonce,
      data,
      mensagem: null,
    });
  }

  /** O servidor do canal; 404 para canal inexistente e para conversa direta (F5). */
  private async servidorDoCanal(canalId: string): Promise<string> {
    const canal = await this.prisma.channel.findUnique({
      where: { id: canalId },
      select: { guildId: true },
    });
    if (!canal) throw new NotFoundException("Canal não encontrado");
    if (!canal.guildId) throw new NotFoundException("Mensagem não encontrada");
    return canal.guildId;
  }

  /**
   * A mensagem clicada: normal, ou efêmera **de quem clicou**. Efêmera de outra
   * pessoa é 404, e não 403 — para quem não é o dono ela não existe, como nunca
   * existiu no canal dele. Efêmera vencida também: a faxina só não passou ainda.
   */
  private async origemDoClique(
    messageId: string,
    canalId: string,
    usuarioId: string,
  ): Promise<{
    tipo: "mensagem" | "efemera";
    id: string;
    autorId: string;
    components: ReturnType<typeof lerComponentesGuardados>;
  }> {
    const naoAchou = () => new NotFoundException("Mensagem não encontrada");
    const mensagem = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        channelId: true,
        authorId: true,
        botPayload: { select: { components: true } },
      },
    });
    if (mensagem) {
      if (mensagem.channelId !== canalId) throw naoAchou();
      return {
        tipo: "mensagem",
        id: mensagem.id,
        autorId: mensagem.authorId,
        components: lerComponentesGuardados(mensagem.botPayload?.components),
      };
    }

    const efemera = await this.prisma.ephemeralMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        channelId: true,
        ephemeralFor: true,
        authorId: true,
        components: true,
        expiresAt: true,
      },
    });
    if (
      !efemera ||
      efemera.channelId !== canalId ||
      efemera.ephemeralFor !== usuarioId ||
      efemera.expiresAt.getTime() <= Date.now()
    ) {
      throw naoAchou();
    }
    return {
      tipo: "efemera",
      id: efemera.id,
      autorId: efemera.authorId,
      components: lerComponentesGuardados(efemera.components),
    };
  }

  /**
   * O aplicativo cujo usuário-bot é `botUserId`, e que está no servidor. Autor
   * que não é bot de aplicativo (gente, bot sem `Application`) e bot que saiu
   * do servidor são o mesmo 404: não há quem receba a interação.
   */
  private async aplicacaoNoServidor(
    botUserId: string,
    guildId: string,
  ): Promise<{ id: string; snowflake: bigint; botUserId: string }> {
    const app = await this.prisma.application.findUnique({
      where: { botUserId },
      select: { id: true, snowflake: true },
    });
    if (!app) throw new NotFoundException("Mensagem não encontrada");
    const membro = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: botUserId, guildId } },
      select: { userId: true },
    });
    if (!membro) throw new NotFoundException("Mensagem não encontrada");
    return { id: app.id, snowflake: app.snowflake, botUserId };
  }

  /**
   * Um valor de select de usuário (5), cargo (6), mencionável (7) ou canal (8):
   * cuid → snowflake, e o alvo entra no `resolved`. Alvo que não existe, canal
   * de outro servidor ou fora de `channel_types` → 400.
   */
  private async resolverValorDeSelect(
    tipoDoComponente: number,
    cuid: string,
    guildId: string,
    tiposDeCanal: readonly number[] | undefined,
    resolvido: Resolvido,
  ): Promise<string> {
    switch (tipoDoComponente) {
      case TIPO_DE_COMPONENTE.USER_SELECT:
        // os números de `resolver` são os de **opção** de comando: 6 user, 7 channel, 8 role
        return this.resolver(6, cuid, guildId, resolvido);
      case TIPO_DE_COMPONENTE.ROLE_SELECT:
        return this.resolver(8, cuid, guildId, resolvido);
      case TIPO_DE_COMPONENTE.MENTIONABLE_SELECT: {
        const usuario = await this.dados.usuarioPorCuid(cuid);
        return this.resolver(usuario ? 6 : 8, cuid, guildId, resolvido);
      }
      case TIPO_DE_COMPONENTE.CHANNEL_SELECT: {
        const canal = await this.dados.canalPorCuid(cuid);
        if (!canal || canal.guildId !== guildId) {
          throw new BadRequestException("Canal do select não encontrado");
        }
        if (tiposDeCanal && tiposDeCanal.length > 0 && !tiposDeCanal.includes(tipoDeCanalParaDiscord(canal.type))) {
          throw new BadRequestException("Canal fora dos tipos que o select aceita");
        }
        const chave = String(canal.snowflake);
        resolvido.canais[chave] = canalParaDiscord(canal);
        return chave;
      }
      default:
        throw new BadRequestException("Tipo de select desconhecido");
    }
  }

  /**
   * Os campos do envio do modal com cuid (selects 5–8 e upload 19) trocados
   * por snowflake, e o `resolved` (com `attachments` quando houve upload).
   * `resolved` sai `null` quando nenhum campo precisa dele.
   */
  private async resolverEnvioDoModal(
    modal: ModalDeBot,
    components: ComponenteDoEnvio[],
    guildId: string,
    usuarioId: string,
  ): Promise<{ components: ComponenteDoEnvio[]; resolved: JsonDoDiscord | null }> {
    const definicoes = new Map<string, NonNullable<ReturnType<typeof campoDoLabel>>>();
    for (const c of modal.components) {
      const campo = campoDoLabel(c);
      if (campo) definicoes.set(campo.custom_id, campo);
    }

    const resolvido = novoResolvido();
    const anexos: Record<string, unknown> = {};
    let precisa = false;
    const saida: ComponenteDoEnvio[] = [];

    for (const c of components) {
      if (c.type !== 18) {
        saida.push(c);
        continue;
      }
      const campo = c.component;
      const definido = definicoes.get(campo.custom_id);
      if ((campo.type === 5 || campo.type === 6 || campo.type === 7 || campo.type === 8) && definido) {
        precisa = true;
        const snowflakes: string[] = [];
        for (const cuid of campo.values) {
          snowflakes.push(
            await this.resolverValorDeSelect(
              campo.type,
              cuid,
              guildId,
              definido.type === 8 ? definido.channel_types : undefined,
              resolvido,
            ),
          );
        }
        saida.push({ ...c, component: { ...campo, values: snowflakes } });
        continue;
      }
      if (campo.type === 19 && definido && definido.type === 19) {
        precisa = true;
        const snowflakes = await this.resolverAnexosDoUpload(
          campo.values,
          usuarioId,
          definido.file_types,
          anexos,
        );
        saida.push({ ...c, component: { ...campo, values: snowflakes } });
        continue;
      }
      saida.push(c);
    }

    if (!precisa) return { components: saida, resolved: null };
    return { components: saida, resolved: { ...resolvedDoDiscord(resolvido), attachments: anexos } };
  }

  /**
   * Os arquivos de um upload do modal: cuids de `Attachment` que **quem envia**
   * subiu por `POST /uploads` e que ainda não estão em mensagem nenhuma. Anexo
   * de outra pessoa, já usado ou fora de `file_types` → 400.
   */
  private async resolverAnexosDoUpload(
    cuids: readonly string[],
    usuarioId: string,
    tipos: readonly string[] | undefined,
    anexos: Record<string, unknown>,
  ): Promise<string[]> {
    if (cuids.length === 0) return [];
    const linhas = await this.prisma.attachment.findMany({
      where: { id: { in: [...cuids] }, uploaderId: usuarioId, messageId: null },
      select: {
        id: true,
        snowflake: true,
        filename: true,
        contentType: true,
        size: true,
        width: true,
        height: true,
        key: true,
        externalUrl: true,
      },
    });
    if (linhas.length !== cuids.length) throw new BadRequestException("Arquivo não encontrado");
    const porId = new Map(linhas.map((l): [string, (typeof linhas)[number]] => [l.id, l]));
    return cuids.map((cuid) => {
      const a = porId.get(cuid);
      if (!a) throw new BadRequestException("Arquivo não encontrado");
      if (!arquivoAceito(tipos, a)) throw new BadRequestException(`Tipo de arquivo não aceito: ${a.filename}`);
      const chave = String(a.snowflake);
      const url = urlDoAnexoParaBot(a);
      anexos[chave] = {
        id: chave,
        filename: a.filename,
        size: a.size,
        url,
        // o discord.py lê `proxy_url` sem `.get` (ver `anexoParaDiscord`)
        proxy_url: url,
        content_type: a.contentType,
        width: a.width,
        height: a.height,
      };
      return chave;
    });
  }

  /**
   * O objeto `message` do Discord da mensagem de origem — o que vai no
   * `INTERACTION_CREATE` de componente e de envio de modal. `null` quando não
   * há origem (modal de comando) ou ela sumiu.
   */
  private async mensagemDeOrigemParaBot(origem: {
    messageId?: string | null;
    ephemeralMessageId?: string | null;
    botUserId: string;
  }): Promise<MensagemDoDiscord | null> {
    const achada = await this.origemParaCompat(origem);
    if (!achada) return null;
    const traduzida = mensagemParaDiscord(achada.linha);
    // `|` e não `=`: a efêmera de origem pode ser v2, e o bot precisa das duas
    return achada.efemera ? { ...traduzida, flags: traduzida.flags | FLAG_EFEMERA } : traduzida;
  }

  /**
   * A mensagem de origem de uma interação de componente/modal, no formato que a
   * tradução do Discord consome — para o `INTERACTION_CREATE` e para o
   * `with_response` do callback 6/7 (`rest/interactions.controller.ts`).
   *
   * A linha da compat (`DadosDeCompatService.mensagemPorCuid`) ainda não traz
   * embeds e componentes, então eles vêm de `MessagesService.payloadsDeBot` —
   * o mesmo remendo do `GET /channels/:id/messages`. Sem isso o bot receberia
   * a mensagem clicada **sem** os componentes, e o `message.components` que o
   * discord.js usa para montar o `update()` seguinte sairia vazio.
   */
  async origemParaCompat(origem: {
    messageId?: string | null;
    ephemeralMessageId?: string | null;
    botUserId: string;
  }): Promise<{ linha: LinhaDeMensagemDeBot; efemera: boolean } | null> {
    if (origem.ephemeralMessageId) {
      const linha = await this.linhaEfemeraParaCompat(origem.ephemeralMessageId);
      return linha ? { linha, efemera: true } : null;
    }
    if (origem.messageId) {
      const id = origem.messageId;
      const [linha, payloads] = await Promise.all([
        this.dados.mensagemPorCuid(id, origem.botUserId),
        this.mensagens.payloadsDeBot([id]),
      ]);
      if (!linha) return null;
      return { linha: { ...linha, payloadDeBot: payloads.get(id) ?? null }, efemera: false };
    }
    return null;
  }

  /**
   * Grava a interação 3/4/5, despacha o `INTERACTION_CREATE` e arma o prazo.
   *
   * Bot sem sessão de gateway → `interaction.failed` com `bot_offline` **na
   * hora**, sem esperar os 3 s: não há quem responda, e o Discord também mostra
   * a falha sem demora nesse caso. A rota continua 200 (a interação existe).
   */
  private async criarEDespachar(e: {
    tipo: number;
    app: { id: string; snowflake: bigint; botUserId: string };
    usuarioId: string;
    canalId: string;
    guildId: string;
    commandId?: string;
    commandName?: string;
    customId: string | null;
    componentType: number | null;
    messageId: string | null;
    ephemeralMessageId: string | null;
    nonce: string;
    data: DadosDaInteracao;
    mensagem: MensagemDoDiscord | null;
  }): Promise<InteracaoDeBotCriada> {
    const token = randomBytes(BYTES_DO_TOKEN_DE_INTERACAO).toString("base64url");
    const expiresAt = new Date(Date.now() + VALIDADE_DA_INTERACAO_MS);

    const linha = await this.prisma.interaction.create({
      data: {
        applicationId: e.app.id,
        token,
        userId: e.usuarioId,
        channelId: e.canalId,
        guildId: e.guildId,
        commandId: e.commandId ?? null,
        commandName: e.commandName ?? null,
        type: e.tipo,
        customId: e.customId,
        componentType: e.componentType,
        messageId: e.messageId,
        ephemeralMessageId: e.ephemeralMessageId,
        nonce: e.nonce,
        data: e.data as Prisma.InputJsonValue,
        expiresAt,
      },
      select: { id: true, snowflake: true },
    });

    const evento: EventoDaInteracao = {
      interactionId: linha.id,
      nonce: e.nonce,
      channelId: e.canalId,
      messageId: e.messageId ?? e.ephemeralMessageId,
      customId: e.customId,
    };

    const temSessao = await this.despachar({
      tipo: e.tipo,
      snowflake: linha.snowflake,
      applicationSnowflake: e.app.snowflake,
      botUserId: e.app.botUserId,
      token,
      guildId: e.guildId,
      canalId: e.canalId,
      usuarioId: e.usuarioId,
      data: e.data,
      mensagem: e.mensagem ?? undefined,
    });

    if (temSessao) this.agendarPrazo(evento, e.usuarioId);
    else this.emitirFalha(e.usuarioId, evento, "bot_offline");

    return { id: linha.id, nonce: e.nonce, expiresAt: expiresAt.toISOString() };
  }

  // ── onda 3: o prazo dos 3 s ──────────────────────────────────

  /**
   * Arma o relógio de `PRAZO_DA_RESPOSTA_DO_BOT_MS`. Vencido sem callback, a
   * interação é **invalidada** (`expiresAt` = agora, numa escrita condicional
   * `respondedAt: null`) e quem clicou recebe `interaction.failed` com
   * `sem_resposta`. É o Discord: "the token will be invalidated", e o callback
   * atrasado leva 10062 (`porToken` e `tomarResposta` conferem `expiresAt`).
   *
   * A escrita condicional é o que decide, não o relógio: o callback que
   * chegou a tempo noutra instância já gravou `respondedAt`, e aqui o `count`
   * sai 0 e nada é emitido.
   */
  private agendarPrazo(
    evento: EventoDaInteracao,
    usuarioId: string,
    // o que falta do prazo; menor que os 3 s só na retomada (`retomarPrazos`)
    ms: number = PRAZO_DA_RESPOSTA_DO_BOT_MS,
  ): void {
    const relogio = setTimeout(() => {
      this.prazos.delete(evento.interactionId);
      void this.vencerSemResposta(evento, usuarioId);
    }, ms);
    // o relógio não pode segurar o processo vivo num desligamento
    (relogio as { unref?: () => void }).unref?.();
    this.prazos.set(evento.interactionId, relogio);
  }

  private async vencerSemResposta(evento: EventoDaInteracao, usuarioId: string): Promise<void> {
    try {
      const vencida = await this.prisma.interaction.updateMany({
        where: { id: evento.interactionId, respondedAt: null },
        data: { expiresAt: new Date() },
      });
      if (vencida.count === 0) return;
      this.emitirFalha(usuarioId, evento, "sem_resposta");
    } catch (erro) {
      this.log.error(`interação ${evento.interactionId}: falha ao vencer o prazo: ${String(erro)}`);
    }
  }

  private cancelarPrazo(interactionId: string): void {
    const relogio = this.prazos.get(interactionId);
    if (relogio !== undefined) clearTimeout(relogio);
    this.prazos.delete(interactionId);
  }

  /**
   * ── api-interacoes ── A retomada dos relógios na subida.
   *
   * O relógio dos 3 s é um `setTimeout` em memória: se a instância cai entre o
   * despacho e o prazo, ninguém invalida o token nem emite o `failed`, e um
   * callback atrasado ainda escreveria depois de a web já ter desistido (a rede
   * de segurança dela é de 6 s). Não bloqueia a subida: roda solta, e erro só
   * vai para o log.
   */
  onModuleInit(): void {
    void this.retomarPrazos();
  }

  /**
   * As interações com `nonce` (as que a web acompanha) ainda sem resposta e
   * sem invalidação (`expiresAt` no futuro): prazo vencido → a mesma escrita
   * condicional de `vencerSemResposta` e o `failed`; prazo ainda correndo (a
   * instância caiu há menos de 3 s) → o relógio volta com o que falta.
   *
   * Com várias instâncias, uma que sobe pode pegar interação cujo relógio vive
   * noutra: quem decide continua sendo a escrita condicional, então sai um
   * `failed` só. Interação que já levou `bot_offline` na hora também não tem
   * `respondedAt` e pode receber um segundo `failed`; a web o ignora, porque
   * aquele `nonce` já não está pendente.
   */
  async retomarPrazos(agora: Date = new Date()): Promise<void> {
    try {
      const pendentes = await this.prisma.interaction.findMany({
        where: { respondedAt: null, nonce: { not: null }, expiresAt: { gt: agora } },
        select: {
          id: true,
          userId: true,
          channelId: true,
          messageId: true,
          ephemeralMessageId: true,
          customId: true,
          nonce: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        // teto de segurança: a janela é de 15 min, e numa queda normal cabem
        // poucas interações em voo
        take: 500,
      });
      for (const p of pendentes) {
        if (!p.nonce) continue;
        const evento: EventoDaInteracao = {
          interactionId: p.id,
          nonce: p.nonce,
          channelId: p.channelId,
          messageId: p.messageId ?? p.ephemeralMessageId ?? null,
          customId: p.customId ?? null,
        };
        const falta = p.createdAt.getTime() + PRAZO_DA_RESPOSTA_DO_BOT_MS - agora.getTime();
        if (falta > 0) this.agendarPrazo(evento, p.userId, falta);
        else await this.vencerSemResposta(evento, p.userId);
      }
    } catch (erro) {
      this.log.error(`falha ao retomar os prazos das interações: ${String(erro)}`);
    }
  }

  onModuleDestroy(): void {
    for (const relogio of this.prazos.values()) clearTimeout(relogio);
    this.prazos.clear();
  }

  private emitirFalha(
    usuarioId: string,
    evento: EventoDaInteracao,
    motivo: MotivoDaFalhaDeInteracao,
  ): void {
    const falha: InteracaoFalhouEvent = { ...evento, motivo };
    this.realtime.emitToUser(usuarioId, WS_EVENTS.INTERACTION_FAILED, falha);
  }

  /**
   * O `EventoDaInteracao` de uma interação já autenticada pelo token.
   *
   * Vale para toda interação com `nonce` menos o autocomplete, que tem evento
   * próprio (`interaction.autocomplete`). O comando de barra entra desde que o
   * `POST` dele passou a mandar `nonce` (`interacaoCriarSchema`); o de cliente
   * antigo, sem `nonce`, continua sem evento.
   */
  private eventoDe(interacao: InteracaoAutenticada): EventoDaInteracao | null {
    const tipo = interacao.tipo ?? TIPO_DE_INTERACAO.APPLICATION_COMMAND;
    if (tipo === TIPO_DE_INTERACAO.APPLICATION_COMMAND_AUTOCOMPLETE) return null;
    if (!interacao.nonce) return null;
    return {
      interactionId: interacao.id,
      nonce: interacao.nonce,
      channelId: interacao.canalId,
      messageId: interacao.messageId ?? interacao.ephemeralMessageId ?? null,
      customId: interacao.customId ?? null,
    };
  }

  /**
   * `interaction.success` para quem clicou — em interação 2, 3 e 5 que tenham
   * `nonce` (as que a web acompanha). A mensagem em si chega pelo `message.*` de
   * sempre; isto só tira o "carregando" do componente.
   */
  private emitirSucesso(interacao: InteracaoAutenticada): void {
    const evento = this.eventoDe(interacao);
    if (!evento) return;
    const sucesso: InteracaoConcluidaEvent = evento;
    this.realtime.emitToUser(interacao.usuarioId, WS_EVENTS.INTERACTION_SUCCESS, sucesso);
  }

  /**
   * Roda o que a resposta tomada tem de fazer e avisa a web do resultado. Se
   * a escrita falhar **depois** da tomada (o bot não pode escrever no canal,
   * por exemplo), a interação já está gasta: a web recebe o "falhou" em vez de
   * ficar carregando até a rede de segurança dela.
   */
  private async concluir<T>(interacao: InteracaoAutenticada, trabalho: () => Promise<T>): Promise<T> {
    const resultado = await trabalho().catch((erro: unknown) => {
      const evento = this.eventoDe(interacao);
      if (evento) this.emitirFalha(interacao.usuarioId, evento, "sem_resposta");
      throw erro;
    });
    this.emitirSucesso(interacao);
    return resultado;
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
        // ── onda 3 ── o que os callbacks 6/7/8/9 e o `@original` de componente leem
        type: true,
        customId: true,
        messageId: true,
        ephemeralMessageId: true,
        nonce: true,
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
      tipo: linha.type ?? TIPO_DE_INTERACAO.APPLICATION_COMMAND,
      customId: linha.customId ?? null,
      messageId: linha.messageId ?? null,
      ephemeralMessageId: linha.ephemeralMessageId ?? null,
      nonce: linha.nonce ?? null,
    };
  }

  /**
   * `POST /interactions/:id/:token/callback`.
   *
   * - **4** `CHANNEL_MESSAGE_WITH_SOURCE`: escreve a mensagem no canal.
   * - **5** `DEFERRED_…`: escreve `TEXTO_PENSANDO` com `LOADING`. É uma mensagem
   *   de verdade, porque o Streamz não tem "mensagem que ainda não existe"; o
   *   `editReply` depois vira uma edição normal.
   * - ── onda 3 ── **6** `DEFERRED_UPDATE_MESSAGE`: reconhece o clique sem mudar
   *   nada; o `editReply()` seguinte edita a mensagem de origem.
   * - **7** `UPDATE_MESSAGE`: edita a mensagem de origem (`content`, `embeds`,
   *   `components`, `flags`) e emite `message.updated`.
   * - **8** `APPLICATION_COMMAND_AUTOCOMPLETE_RESULT`: devolve as `choices` ao
   *   navegador que pediu (`interaction.autocomplete`).
   * - **9** `MODAL`: guarda o modal na interação e o entrega **só** a quem
   *   interagiu (`interaction.modal`).
   *
   * Qual callback vale para qual interação é `callbackPermitido`; fora da
   * tabela → 50035, **antes** da tomada. Nas interações 3 e 5 a web recebe
   * `interaction.success` depois de 4, 5, 6 ou 7 (o 9 já é o `interaction.modal`).
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
    const tipoDaInteracao = interacao.tipo ?? TIPO_DE_INTERACAO.APPLICATION_COMMAND;
    const conhecidos: number[] = [
      TIPO_DE_CALLBACK.CHANNEL_MESSAGE_WITH_SOURCE,
      TIPO_DE_CALLBACK.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      TIPO_DE_CALLBACK.DEFERRED_UPDATE_MESSAGE,
      TIPO_DE_CALLBACK.UPDATE_MESSAGE,
      TIPO_DE_CALLBACK.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      TIPO_DE_CALLBACK.MODAL,
    ];
    if (!conhecidos.includes(tipo)) {
      throw corpoInvalido({
        type: { _errors: [{ code: "BASE_TYPE_CHOICES", message: `Unknown callback type ${tipo}` }] },
      });
    }
    // Callback que não vale para esta interação também não gasta a resposta:
    // um `update()` num comando de barra é defeito do bot, e ele ainda pode
    // responder direito depois. O código é o do corpo inválido porque o Discord
    // responde com 400 (o `code` exato dele não foi conferido — ver a entrega).
    // A interação 3 **nasce** com mensagem de origem (`clicarComponente` não grava
    // sem ela); os dois ids nulos aqui querem dizer que ela foi apagada depois
    // (`onDelete: SetNull`). Conta como "tem origem" para o 7 chegar ao
    // `atualizarOrigem` e levar o 10008 Unknown Message do Discord, e não o
    // 50035 de callback que não vale para o tipo. No 5 (envio de modal) os ids
    // nulos são também o modal de comando, que de fato não tem origem.
    const temOrigem =
      Boolean(interacao.messageId || interacao.ephemeralMessageId) ||
      tipoDaInteracao === TIPO_DE_INTERACAO.MESSAGE_COMPONENT;
    if (!callbackPermitido(tipoDaInteracao, tipo, temOrigem)) {
      throw corpoInvalido({
        type: {
          _errors: [
            {
              code: "INTERACTION_CALLBACK_TYPE_INVALID",
              message: `Callback type ${tipo} is not valid for interaction type ${tipoDaInteracao}`,
            },
          ],
        },
      });
    }

    switch (tipo) {
      case TIPO_DE_CALLBACK.DEFERRED_UPDATE_MESSAGE:
        await this.tomarResposta(interacao);
        this.emitirSucesso(interacao);
        return;
      case TIPO_DE_CALLBACK.UPDATE_MESSAGE:
        return this.atualizarOrigem(interacao, dados ?? {});
      case TIPO_DE_CALLBACK.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT:
        return this.devolverAutocomplete(interacao, dados);
      case TIPO_DE_CALLBACK.MODAL:
        return this.abrirModal(interacao, dados);
    }

    // ── onda 3 ── o corpo é validado **antes** da tomada: um `data` inválido
    // (embed longo demais, v2 com `content`) leva 50035 e não pode gastar a
    // única resposta da interação. O callback 5 só lê as `flags` do `data` (é o
    // que o Discord aceita num defer).
    const carregando = tipo === TIPO_DE_CALLBACK.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE;
    const payload = carregando
      ? this.lerCorpo({ flags: dados?.flags })
      : this.lerCorpo(dados ?? {}, { temAnexos: false });

    await this.tomarResposta(interacao);

    if (dados) this.avisarDoQueNaoEntregamos(dados);
    await this.concluir(interacao, () =>
      this.escreverComoBot(interacao, payload, { ehOriginal: true, carregando }),
    );
  }

  /**
   * ── onda 3 ── A tomada da única resposta: escrita condicional
   * (`respondedAt: null` **e** não vencida), e não `if` depois de `findUnique`.
   * Quem perde a corrida leva 40060 em vez de escrever uma segunda mensagem.
   *
   * O `expiresAt` entra no `where` por causa do relógio dos 3 s: sem ele, um
   * callback que passou pelo `porToken` um instante antes de o relógio vencer o
   * token ainda escreveria — e a web já teria mostrado "Esta interação falhou".
   * Com ele, o perdedor é distinguido na releitura: não respondida = vencida
   * (10062, o que o Discord devolve a um callback atrasado), respondida = 40060.
   *
   * `extra` grava junto na mesma escrita (o modal do callback 9).
   */
  private async tomarResposta(
    interacao: InteracaoAutenticada,
    extra: Prisma.InteractionUpdateManyMutationInput = {},
  ): Promise<void> {
    const agora = new Date();
    const tomada = await this.prisma.interaction.updateMany({
      where: { id: interacao.id, respondedAt: null, expiresAt: { gt: agora } },
      data: { respondedAt: agora, ...extra },
    });
    if (tomada.count === 0) {
      const atual = await this.prisma.interaction.findUnique({
        where: { id: interacao.id },
        select: { respondedAt: true },
      });
      if (!atual || atual.respondedAt === null) throw interacaoDesconhecida();
      throw interacaoJaRespondida();
    }
    this.cancelarPrazo(interacao.id);
  }

  /**
   * ── onda 3 ── Callback **7** `UPDATE_MESSAGE`: o `interaction.update()` do
   * discord.js. Edita a mensagem de origem com a semântica do `PATCH` (campo
   * ausente não muda) — pelo `MessagesService.editarComoBot` e `message.updated`
   * no canal, ou, na efêmera, nas colunas dela e `message.updated` só para o
   * dono.
   *
   * Forma **e** conjunto são conferidos antes da tomada: o conjunto depende do
   * que está gravado (um `update({ components: [] })` numa v2 que só tinha
   * componentes a deixaria vazia, por exemplo), e o 50035 não pode gastar a
   * resposta. Origem apagada → 404 `10008`, também sem gastar.
   */
  private async atualizarOrigem(
    interacao: InteracaoAutenticada,
    dados: CorpoDeResposta,
  ): Promise<void> {
    const payload = this.lerCorpo(dados);
    const alvo = await this.origemDaInteracao(interacao);
    if (!alvo) throw mensagemDesconhecida();
    await this.conferirEdicao(alvo, payload);

    await this.tomarResposta(interacao);
    this.avisarDoQueNaoEntregamos(dados);
    await this.concluir(interacao, () => this.editarAlvo(alvo, payload, interacao.botUserId));
  }

  /**
   * ── onda 3 ── Callback **8**: as `choices` (até 25) vão para a sala de quem
   * pediu, casadas pelo `nonce`. `data` inválido → 50035 sem gastar a resposta.
   */
  private async devolverAutocomplete(
    interacao: InteracaoAutenticada,
    dados: CorpoDeResposta | undefined,
  ): Promise<void> {
    const cru = (dados ?? {}) as { choices?: unknown };
    const lido = respostaDeAutocompleteSchema.safeParse({ choices: cru.choices });
    if (!lido.success) {
      throw corpoInvalido(
        errosNoFormatoDoDiscord(
          lido.error.issues.map((i) => ({
            caminho: i.path,
            codigo: i.code === "too_big" ? "BASE_TYPE_BAD_LENGTH" : "BASE_TYPE_INVALID",
            mensagem: i.message,
          })),
        ),
      );
    }

    await this.tomarResposta(interacao);
    const evento: AutocompleteDeBotEvent = {
      interactionId: interacao.id,
      nonce: interacao.nonce ?? "",
      choices: lido.data.choices,
    };
    this.realtime.emitToUser(interacao.usuarioId, WS_EVENTS.INTERACTION_AUTOCOMPLETE, evento);
  }

  /**
   * ── onda 3 ── Callback **9** `MODAL`: o `interaction.showModal()`.
   *
   * O modal é validado (`validarModalDeBot`: título até 45, 1–5 componentes,
   * `custom_id` único, nada desabilitado) e gravado **na mesma escrita** que
   * toma a resposta — é contra ele que o envio (`enviarModal`) confere. Sai
   * **só** para a sala de quem interagiu; as outras sessões dessa pessoa o
   * ignoram porque não têm o `nonce`.
   *
   * Num comando de barra o `nonce` é o do `POST /channels/:id/interactions`
   * (`interacaoCriarSchema`); vazio só quando o cliente é antigo e não o mandou.
   */
  private async abrirModal(
    interacao: InteracaoAutenticada,
    dados: CorpoDeResposta | undefined,
  ): Promise<void> {
    const r = validarModalDeBot(dados ?? {});
    if (!r.ok) throw corpoInvalido(errosNoFormatoDoDiscord(r.erros));

    await this.tomarResposta(interacao, { modal: r.modal as unknown as Prisma.InputJsonValue });

    const app = await this.prisma.application.findUnique({
      where: { id: interacao.applicationId },
      select: { botUser: true },
    });
    if (!app) {
      this.log.error(`interação ${interacao.id}: aplicativo sumiu antes de abrir o modal`);
      return;
    }
    const evento: ModalDeBotAbertoEvent = {
      interactionId: interacao.id,
      nonce: interacao.nonce ?? "",
      channelId: interacao.canalId,
      applicationId: interacao.applicationId,
      bot: toPublicUser(app.botUser),
      modal: r.modal,
    };
    this.realtime.emitToUser(interacao.usuarioId, WS_EVENTS.INTERACTION_MODAL, evento);
  }

  /**
   * `flags: 64` — a efêmera.
   *
   * Vale para o callback **e** para o `deferReply({ ephemeral: true })`: o
   * discord.js manda a flag já no tipo 5, então o "pensando…" nasce efêmero e a
   * edição seguinte encontra a linha efêmera à espera.
   */
  private ehEfemera(payload: PayloadDeBot): boolean {
    return ((payload.flags ?? 0) & FLAG_EFEMERA) !== 0;
  }

  /**
   * ── onda 3 ── O corpo do bot → `PayloadDeBot` validado, ou `50035` com o
   * detalhe por campo. `estado` liga as regras de conjunto, e só vale quando o
   * corpo **é** a mensagem inteira (callback 4 e followup); no `editReply()`
   * quem confere o conjunto é a edição, contra o que está gravado.
   */
  private lerCorpo(dados: CorpoDeResposta, estado?: { temAnexos: boolean }): PayloadDeBot {
    const lido = lerPayloadDeBot(dados, estado);
    if (!lido.ok) throw corpoInvalido(lido.erros);
    return lido.payload;
  }

  /**
   * `PATCH /webhooks/:app/:token/messages/@original` — o `editReply()`.
   *
   * Edita a mensagem que o callback criou. Sem callback antes (`respondedAt`
   * nulo) → 404 `10062`: não há original a editar.
   *
   * ── onda 3 ── numa interação de componente/modal respondida com 6 ou 7, o
   * `@original` é a **mensagem de origem** (`alvoDoOriginal`).
   */
  async editarOriginal(
    interacao: InteracaoAutenticada,
    dados: CorpoDeResposta,
  ): Promise<MessageDTO> {
    const payload = this.lerCorpo(dados);
    const alvo = await this.alvoDoOriginal(interacao);
    this.avisarDoQueNaoEntregamos(dados);
    return this.editarAlvo(alvo, payload, interacao.botUserId);
  }

  /** `GET /webhooks/:app/:token/messages/@original` — o `fetchReply()`. */
  async lerOriginal(interacao: InteracaoAutenticada): Promise<MessageDTO> {
    const alvo = await this.alvoDoOriginal(interacao);
    if (alvo.tipo === "efemera") {
      return efemeraParaDTO(alvo.linha, await this.contextoDaEfemera(alvo.interactionId));
    }
    return this.mensagens.getDTO(alvo.id);
  }

  /** `DELETE /webhooks/:app/:token/messages/@original` — 204. */
  async apagarOriginal(interacao: InteracaoAutenticada): Promise<void> {
    const alvo = await this.alvoDoOriginal(interacao);
    // ── j-bots ── apagar a efêmera é apagar a linha e avisar **só** o dono
    // dela. Não há `emitToChannel` aqui, como não houve na criação: ninguém
    // mais no canal chegou a saber que ela existia.
    if (alvo.tipo === "efemera") {
      await this.prisma.ephemeralMessage.delete({ where: { id: alvo.linha.id } });
      this.realtime.emitToUser(alvo.linha.ephemeralFor, WS_EVENTS.MESSAGE_DELETED, {
        messageId: alvo.linha.id,
        channelId: alvo.linha.channelId,
        parentId: null,
      });
      return;
    }

    const { channelId, parentId } = await this.mensagens.remove(alvo.id, interacao.botUserId);
    // `Interaction.responseMessageId` é `ON DELETE SET NULL`: apagar a mensagem
    // já desfaz a ligação, sem escrita nossa.
    this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_DELETED, {
      messageId: alvo.id,
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
    // ── onda 3 ── validado antes de tomar a original (um followup inválido não
    // pode virar a resposta da interação)
    const payload = this.lerCorpo(dados, { temAnexos: false });
    this.avisarDoQueNaoEntregamos(dados);

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
      // ── onda 3 ── o followup que vira a original também responde ao clique:
      // o relógio dos 3 s não pode mais vencer, e a web sai do "carregando"
      this.cancelarPrazo(interacao.id);
      return this.concluir(interacao, () =>
        this.escreverComoBot(interacao, payload, { ehOriginal: true }),
      );
    }
    return this.escreverComoBot(interacao, payload, { ehOriginal: false });
  }

  // ── onda 3: o alvo de uma edição ───────────────────────────

  /**
   * O que o `@original` aponta, na ordem:
   *
   * 1. a efêmera original desta interação (resposta 4/5 com `flags: 64`);
   * 2. a mensagem criada pelo callback 4/5 (`responseMessageId`);
   * 3. ── onda 3 ── numa interação 3 ou 5 **já respondida** (6, 7, 9 ou
   *    followup efêmero), a mensagem de origem — é o que o `editReply()` depois
   *    de um `deferUpdate()` edita no Discord.
   *
   * Nenhum dos três → 404 `10062`: não há original a editar, ler nem apagar.
   */
  private async alvoDoOriginal(interacao: InteracaoAutenticada): Promise<AlvoDeEdicao> {
    // ── j-bots ── a efêmera vem primeiro, e tem de vir: quando a resposta foi
    // efêmera o `responseMessageId` é null (não há linha de `Message` para
    // apontar), e sem ela o `editReply()` levaria 404 onde o Discord atende.
    const efemera = await this.efemeraOriginal(interacao.id);
    if (efemera) return { tipo: "efemera", linha: efemera, interactionId: interacao.id };
    if (interacao.responseMessageId) return { tipo: "mensagem", id: interacao.responseMessageId };

    if (
      interacao.respondedAt !== null &&
      ehInteracaoDeComponente(interacao.tipo ?? TIPO_DE_INTERACAO.APPLICATION_COMMAND)
    ) {
      const origem = await this.origemDaInteracao(interacao);
      if (origem) return origem;
      // a interação 3 nasceu com origem: sem ela, a mensagem foi apagada, e o
      // Discord responde 10008 (o 5 sem origem é o modal de comando: 10062)
      if (interacao.tipo === TIPO_DE_INTERACAO.MESSAGE_COMPONENT) throw mensagemDesconhecida();
    }
    throw interacaoDesconhecida();
  }

  /**
   * A mensagem de origem de uma interação 3/5, como alvo de edição. A efêmera
   * vencida não volta (a faxina só não passou): `null`, como a apagada.
   */
  private async origemDaInteracao(interacao: InteracaoAutenticada): Promise<AlvoDeEdicao | null> {
    if (interacao.ephemeralMessageId) {
      const linha = await this.prisma.ephemeralMessage.findUnique({
        where: { id: interacao.ephemeralMessageId },
        select: { ...SELECAO_EFEMERA, interactionId: true, expiresAt: true },
      });
      if (!linha || linha.expiresAt.getTime() <= Date.now()) return null;
      return { tipo: "efemera", linha, interactionId: linha.interactionId };
    }
    if (interacao.messageId) return { tipo: "mensagem", id: interacao.messageId };
    return null;
  }

  /**
   * As regras de conjunto da edição, **sem** gravar — para o callback 7 recusar
   * com 50035 antes de gastar a resposta. A edição de verdade roda as mesmas
   * regras de novo (`editarComoBot`/`editarEfemera`), o que é barato e evita
   * que as duas divirjam.
   */
  private async conferirEdicao(alvo: AlvoDeEdicao, payload: PayloadDeBot): Promise<void> {
    if (alvo.tipo === "efemera") {
      const r = gravacaoDaEdicao(this.atualDaEfemera(alvo.linha), payload);
      if (!r.ok) throw corpoInvalido(errosNoFormatoDoDiscord(r.erros));
      return;
    }
    const msg = await this.prisma.message.findUnique({
      where: { id: alvo.id },
      select: {
        content: true,
        suppressEmbeds: true,
        stickerId: true,
        botPayload: { select: { embeds: true, components: true, flags: true } },
        _count: { select: { attachments: true } },
      },
    });
    if (!msg) throw mensagemDesconhecida();
    const r = gravacaoDaEdicao(
      {
        content: msg.content,
        suppressEmbeds: msg.suppressEmbeds,
        payload: msg.botPayload,
        temAnexos: msg._count.attachments > 0 || msg.stickerId !== null,
      },
      payload,
    );
    if (!r.ok) throw corpoInvalido(errosNoFormatoDoDiscord(r.erros));
  }

  /** Edita o alvo e emite o `message.updated` (canal, ou só o dono da efêmera). */
  private async editarAlvo(
    alvo: AlvoDeEdicao,
    payload: PayloadDeBot,
    botUserId: string,
  ): Promise<MessageDTO> {
    if (alvo.tipo === "efemera") return this.editarEfemera(alvo.linha, alvo.interactionId, payload);

    // ── onda 3 ── `editarComoBot`: embeds, componentes e flags, com a semântica
    // do PATCH do Discord (antes, `edit` só com o texto)
    const mensagem = await this.mensagens.editarComoBot(alvo.id, botUserId, payload);
    // o bot não tem socket: o `message.updated` sai daqui, como no
    // `messages.controller.ts` da compat da F1
    this.realtime.emitToChannel(mensagem.channelId, WS_EVENTS.MESSAGE_UPDATED, mensagem);
    return mensagem;
  }

  /** A efêmera no formato que `gravacaoDaEdicao` lê. */
  private atualDaEfemera(linha: LinhaEfemera) {
    return {
      content: linha.content,
      suppressEmbeds: temFlag(linha.flags, FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS),
      payload: linha,
      temAnexos: false,
    };
  }

  /**
   * ── onda 3 ── A mesma semântica de PATCH da mensagem normal (ausente não
   * mexe; `LOADING` sai; v2 não desliga), aplicada às colunas da efêmera.
   * `interactionId` é o da interação **dona** da efêmera: é dela a faixa
   * "usou /play" que o DTO continua desenhando.
   */
  private async editarEfemera(
    efemera: LinhaEfemera,
    interactionId: string,
    payload: PayloadDeBot,
  ): Promise<MessageDTO> {
    const r = gravacaoDaEdicao(this.atualDaEfemera(efemera), payload);
    if (!r.ok) throw corpoInvalido(errosNoFormatoDoDiscord(r.erros));
    const linha = await this.prisma.ephemeralMessage.update({
      where: { id: efemera.id },
      data: {
        content: r.gravacao.content,
        ...colunasDaEfemera(r.gravacao),
        // a primeira edição de um "pensando…" é a resposta, não uma edição
        editedAt: r.gravacao.eraCarregando ? efemera.editedAt : new Date(),
      },
      select: SELECAO_EFEMERA,
    });
    return this.emitirEfemera(interactionId, linha, WS_EVENTS.MESSAGE_UPDATED);
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
    payload: PayloadDeBot,
    opcoes: { ehOriginal: boolean; carregando?: boolean },
  ): Promise<MessageDTO> {
    const { ehOriginal } = opcoes;

    // ── j-bots ── `flags: 64`: a resposta não é do canal, é de uma pessoa.
    if (this.ehEfemera(payload)) {
      return this.escreverEfemera(interacao, payload, opcoes);
    }

    // permissão, modo lento e castigo saem de graça daqui — e é daqui que vem
    // o 403 `50013` quando o bot não enxerga o canal (prova 4 da fase)
    //
    // ── onda 3 ── `criarComoBot`: embeds, componentes e flags gravados junto.
    // O callback 5 grava o texto provisório com `LOADING` ligado, que é o que
    // a web lê para desenhar "<bot> está pensando…"; o texto fica para cliente
    // antigo e para a busca não achar uma mensagem vazia.
    const criada = await this.mensagens.criarComoBot(interacao.canalId, interacao.botUserId, {
      content: opcoes.carregando ? TEXTO_PENSANDO : (payload.content ?? "").trim(),
      embeds: opcoes.carregando ? [] : (payload.embeds ?? []),
      components: opcoes.carregando ? [] : (payload.components ?? []),
      flags: payload.flags ?? 0,
      carregando: opcoes.carregando,
    });

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
    payload: PayloadDeBot,
    opcoes: { ehOriginal: boolean; carregando?: boolean },
  ): Promise<MessageDTO> {
    await this.guilds.assertCanPostChannel(interacao.botUserId, interacao.canalId);

    // ── onda 3 ── as mesmas regras e a mesma máscara de flags da mensagem
    // normal (`gravacaoDaMensagemNova`), gravadas nas colunas da efêmera
    const r = gravacaoDaMensagemNova(
      {
        content: opcoes.carregando ? TEXTO_PENSANDO : (payload.content ?? "").trim(),
        embeds: opcoes.carregando ? [] : (payload.embeds ?? []),
        components: opcoes.carregando ? [] : (payload.components ?? []),
        flags: payload.flags ?? 0,
        carregando: opcoes.carregando,
      },
      { temAnexos: false },
    );
    if (!r.ok) throw corpoInvalido(errosNoFormatoDoDiscord(r.erros));

    const linha = await this.prisma.ephemeralMessage.create({
      data: {
        interactionId: interacao.id,
        channelId: interacao.canalId,
        // a coluna que é a regra inteira
        ephemeralFor: interacao.usuarioId,
        authorId: interacao.botUserId,
        content: r.gravacao.content,
        ...colunasDaEfemera(r.gravacao),
        original: opcoes.ehOriginal,
        // a mesma janela do token: passados os 15 min não há mais o que editar
        expiresAt: interacao.expiresAt,
      },
      select: SELECAO_EFEMERA,
    });

    return this.emitirEfemera(interacao.id, linha, WS_EVENTS.MESSAGE_NEW);
  }

  /**
   * O DTO da efêmera e o `emit` dela — **sempre** por `emitToUser`.
   *
   * Este é o único lugar do arquivo que emite uma efêmera, e é curto para que
   * fique fácil de auditar: se algum dia aparecer um `emitToChannel` com uma
   * efêmera dentro, é aqui que ele não está.
   *
   * ── onda 3 ── `interactionId` é o da interação **dona** da efêmera (a que a
   * criou), e não necessariamente a corrente: o `update()` de um botão numa
   * efêmera de `/play` não pode apagar a faixa "usou /play" dela.
   */
  private async emitirEfemera(
    interactionId: string,
    linha: LinhaEfemera,
    evento: string,
  ): Promise<MessageDTO> {
    const dto = efemeraParaDTO(linha, await this.contextoDaEfemera(interactionId));
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
  private async contextoDaEfemera(interactionId: string): Promise<ContextoDaEfemera> {
    const linha = await this.prisma.interaction.findUnique({
      where: { id: interactionId },
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
      interacaoId: interactionId,
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
  async linhaEfemeraParaCompat(id: string): Promise<LinhaDeMensagemDeBot | null> {
    const linha = await this.prisma.ephemeralMessage.findUnique({
      where: { id },
      select: { ...SELECAO_EFEMERA, authorId: true },
    });
    return linha ? this.linhaEfemeraDeCompat(linha, linha.authorId) : null;
  }

  /** A efêmera original da interação, no formato do Discord (o `with_response`). */
  async linhaEfemeraOriginalParaCompat(
    interactionId: string,
  ): Promise<LinhaDeMensagemDeBot | null> {
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
  ): Promise<LinhaDeMensagemDeBot | null> {
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
   * O que o bot mandou e o Streamz não entrega. Log, e a chamada segue.
   *
   * ── onda 3 ── `embeds` e `components` saíram desta lista: são guardados e
   * desenhados. Sobra `attachments` — não há upload multipart nas rotas de
   * interação — e ele é descartado com aviso, e não recusado, porque o
   * discord.js manda `attachments: []` em todo `reply()`.
   */
  private avisarDoQueNaoEntregamos(dados: CorpoDeResposta): void {
    if (dados.attachments?.length) {
      this.log.warn(`attachments descartados (${dados.attachments.length}): sem upload nesta rota`);
    }
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
    /**
     * ── onda 3 ── o nome da opção em foco num pedido de autocomplete (tipo 4):
     * ela sai com `focused: true` e o `value` **em texto**, que é como o Discord
     * a manda (o `getFocused()` do discord.js devolve o que está digitado).
     */
    emFoco?: string,
  ): Promise<DadosDaInteracao> {
    const usuarios: Record<string, unknown> = {};
    const membros: Record<string, unknown> = {};
    const canais: Record<string, unknown> = {};
    const cargos: Record<string, unknown> = {};

    const saida: JsonDoDiscord[] = [];
    for (const opcao of opcoes) {
      if (emFoco !== undefined && opcao.nome === emFoco) {
        saida.push({ name: opcao.nome, type: opcao.tipo, value: String(opcao.valor), focused: true });
        continue;
      }
      if (!TIPOS_COM_ALVO.has(opcao.tipo)) {
        saida.push({ name: opcao.nome, type: opcao.tipo, value: opcao.valor });
        continue;
      }

      const alvo = String(opcao.valor);
      const resolvido = { usuarios, membros, canais, cargos };
      if (emFoco !== undefined) {
        // ── api-interacoes ── No autocomplete a opção 6/7/8 **não focada** pode
        // estar pela metade (o composer ainda não escolheu o alvo) ou apontar
        // para quem saiu: recusar com 400 tirava as sugestões da opção em foco
        // por causa de outra. Ela é **omitida**, e não mandada com o cuid bruto:
        // sem a entrada no `resolved`, o `_get_namespace` do discord.py levanta
        // dentro da lib; ausente, a lib a lê como "não preenchida".
        const snowflake = await this.resolver(opcao.tipo, alvo, guildId, resolvido).catch(
          (erro: unknown) => {
            if (erro instanceof BadRequestException) return null;
            throw erro;
          },
        );
        if (snowflake !== null) saida.push({ name: opcao.nome, type: opcao.tipo, value: snowflake });
        continue;
      }
      const snowflake = await this.resolver(opcao.tipo, alvo, guildId, resolvido);
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
  private async despachar(entrada: EntradaDoDespacho): Promise<boolean> {
    const sessoes = this.sessoes.porBot(entrada.botUserId);
    if (sessoes.length === 0) {
      // 200 mesmo assim: a interação existe, expira em 15 min e ninguém
      // responde — é o que o Discord faz com um bot offline.
      //
      // ── onda 3 ── o `false` é o que faz a interação de componente avisar
      // `bot_offline` na hora (ver `criarEDespachar`).
      this.log.warn(`interação ${entrada.snowflake}: o bot não tem sessão de gateway aberta`);
      return false;
    }

    let payload: JsonDoDiscord;
    try {
      payload = await this.montarInteractionCreate(entrada);
    } catch (erro) {
      // há sessão, e o relógio dos 3 s (quando houver) dá o "falhou" a quem clicou
      this.log.error(`interação ${entrada.snowflake}: falha ao montar o payload: ${String(erro)}`);
      return true;
    }

    for (const sessao of sessoes) {
      try {
        sessao.despachar("INTERACTION_CREATE", payload);
      } catch (erro) {
        // um socket com defeito não pode derrubar o `POST` do composer
        this.log.error(`interação ${entrada.snowflake}: falha ao despachar: ${String(erro)}`);
      }
    }
    return true;
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
   * - ── onda 3 ── `type` é o da interação (2, 3, 4 ou 5), e `message` (a
   *   mensagem de origem, no formato do Discord) vai em componente e em envio
   *   de modal que saiu de componente: o `MessageComponentInteraction` do
   *   discord.js faz `messages._add(data.message)` sem conferir, e o
   *   `interaction.message.components` é o que o `update()` do bot reaproveita.
   */
  private async montarInteractionCreate(entrada: EntradaDoDespacho): Promise<JsonDoDiscord> {
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
      type: entrada.tipo,
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
    if (entrada.mensagem) payload.message = entrada.mensagem;

    return payload;
  }
}

/** O que `despachar` precisa para montar e entregar o `INTERACTION_CREATE`. */
interface EntradaDoDespacho {
  /** ── onda 3 ── `TIPO_DE_INTERACAO`: 2, 3, 4 ou 5. */
  tipo: number;
  snowflake: bigint;
  applicationSnowflake: bigint;
  botUserId: string;
  token: string;
  guildId: string;
  canalId: string;
  usuarioId: string;
  data: DadosDaInteracao;
  /** ── onda 3 ── a mensagem de origem (componente, e modal aberto por componente). */
  mensagem?: MensagemDoDiscord;
}

/** ── onda 3 ── Os quatro mapas do `resolved`, vazios. */
function novoResolvido(): Resolvido {
  return { usuarios: {}, membros: {}, canais: {}, cargos: {} };
}

/**
 * Os mapas → o `resolved` do Discord. **Os quatro sempre**, mesmo vazios: o
 * `UserSelectMenuInteraction` do discord.js faz `Object.values(users)` sem
 * guarda, e um `users` ausente estoura dentro da lib.
 */
function resolvedDoDiscord(r: Resolvido): JsonDoDiscord {
  return { users: r.usuarios, members: r.membros, roles: r.cargos, channels: r.canais };
}

/**
 * O campo respondível de um componente de modal: o de dentro do `Label`, ou o
 * text input da action row antiga. `null` no text display.
 */
function campoDoLabel(c: ModalDeBot["components"][number]) {
  if (c.type === TIPO_DE_COMPONENTE.LABEL) return c.component;
  if (c.type === TIPO_DE_COMPONENTE.ACTION_ROW) {
    const input = c.components[0];
    return input && input.type === TIPO_DE_COMPONENTE.TEXT_INPUT ? input : null;
  }
  return null;
}

/**
 * ── onda 3 ── As colunas de bot da efêmera a partir da gravação. O
 * `SUPPRESS_EMBEDS` entra em `flags` porque a efêmera não tem a coluna
 * `suppressEmbeds` da `Message` (ver `LinhaEfemera.flags`).
 */
function colunasDaEfemera(g: GravacaoDeBot): {
  embeds: Prisma.InputJsonValue;
  components: Prisma.InputJsonValue;
  flags: number;
} {
  return {
    embeds: (g.payload?.embeds ?? []) as unknown as Prisma.InputJsonValue,
    components: (g.payload?.components ?? []) as unknown as Prisma.InputJsonValue,
    flags: (g.payload?.flags ?? 0) | (g.suppressEmbeds ? FLAGS_DE_MENSAGEM.SUPPRESS_EMBEDS : 0),
  };
}

// A faixa "usou /play" **não** entra aqui: o `MessagesService` a monta com um
// `include` do Prisma e o mapeador puro de `./dto.ts`. Injetar este service lá
// criaria um ciclo de módulos (`InteractionsModule` já importa
// `MessagesModule`), e um `import` de função pura não cria ciclo nenhum.
