import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Prisma } from "@prisma/client";
import { ehSnowflake, type OpcaoDeComando } from "@streamz/shared";
import { zodBody } from "../../../common/zod.pipe";
import { PrismaService } from "../../../prisma/prisma.service";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import {
  CODIGO,
  ErroDoDiscord,
  FiltroDeErrosDoDiscord,
  naoImplementado,
  semAcesso,
  servidorDesconhecido,
} from "../erros";
import { IdsService } from "../ids.service";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { BotAutenticado, JsonDoDiscord } from "../tipos";
import { BotAtual } from "./bot-atual";
import {
  comandoParaRegistrarSchema,
  comandosParaRegistrarSchema,
  normalizarComando,
  TIPO_CHAT_INPUT,
  type ComandoNormalizado,
  type ComandoParaRegistrar,
} from "./corpos-f3";

/**
 * O registro de comandos de barra: o que o `deploy-commands.js` de todo
 * tutorial do discord.js chama.
 *
 * ── Lote B (REST compat) implementa. ──
 *
 * ```
 * GET    /api/v10/applications/:app/commands
 * PUT    /api/v10/applications/:app/commands                   (sobrescrita em bloco)
 * POST   /api/v10/applications/:app/commands                   (um comando)
 * DELETE /api/v10/applications/:app/commands/:cmd
 * GET    /api/v10/applications/:app/guilds/:gid/commands
 * PUT    /api/v10/applications/:app/guilds/:gid/commands
 * POST   /api/v10/applications/:app/guilds/:gid/commands
 * DELETE /api/v10/applications/:app/guilds/:gid/commands/:cmd
 * ```
 *
 * Autenticação: `BotTokenGuard`. O `:app` do caminho tem que ser o snowflake da
 * `Application` do token — outro valor é **403 `50001`**, não 404: o bot existe,
 * mas não é dele.
 *
 * > **A fiação que faltava, e que já foi feita.** Este controller é registrado
 * > no `InteractionsModule`, e o Nest constrói o `BotTokenGuard` no contexto
 * > **desse** módulo — mas o `ApplicationsService` de que o guard depende só era
 * > visível de dentro do `DiscordCompatModule`, que importa o
 * > `ApplicationsModule` sem reexportá-lo. Sem isso a aplicação não subia
 * > (`Nest can't resolve dependencies of the BotTokenGuard`), e o erro aparecia
 * > no `bootstrap`, não aqui. O conserto foi `imports: [… , ApplicationsModule]`
 * > no `InteractionsModule` — o lado certo: um módulo não deve reexportar o que
 * > usa por dentro só porque um vizinho precisa. As rotas de callback e followup
 * > nunca tiveram esse problema, porque não têm guard nenhum (§3.3 do contrato).
 *
 * O `PUT` é sobrescrita em bloco: o que não veio no corpo **some**. É assim no
 * Discord, e é o que faz o `deploy-commands.js` ser idempotente.
 *
 * Este arquivo é novo e separado de `applications.controller.ts` (o
 * `/applications/@me` da F1) de propósito: dois lotes editando o mesmo arquivo
 * é a colisão que o §6.4 do processo manda evitar, e o `@me` não muda na F3.
 *
 * ## Por que o Prisma aparece aqui, e não um service
 *
 * A F3 dividiu o domínio em `InteractionsService` (lote A) e a casca REST (lote
 * B), e o registro de comandos ficou inteiro na casca: não há regra de negócio
 * nele — é CRUD de uma tabela que só a casca escreve, e o único consumidor do
 * outro lado (`comandosDoServidor`, do lote A) só lê. Um service no meio seria
 * uma camada de repasse.
 *
 * **O acesso à tabela é pelo delegate gerado do Prisma**, por `comandosDe` (no
 * fim do arquivo). Enquanto os lotes A e B corriam em paralelo isto era uma
 * interface estrutural com um `cast`, porque o modelo `ApplicationCommand` só
 * entrava no `schema.prisma` pela migration 4, do lote A. **Na integração o
 * `cast` saiu**, e é de propósito: com o tipo de verdade, o `tsc` confere nome
 * de campo por nome de campo contra o schema — um `cast` compila igualzinho com
 * o nome errado, e a casca e a migration divergiriam em silêncio.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/applications/:app")
export class ApplicationCommandsCompatController {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly ids: IdsService,
    protected readonly dados: DadosDeCompatService,
  ) {}

  // ── comandos globais ───────────────────────────────────────

  @Get("commands")
  async listarGlobais(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
  ): Promise<JsonDoDiscord[]> {
    return this.listar(bot, await this.escopoGlobal(bot, app));
  }

  /**
   * A **prova 1 da fase**: o `deploy-commands.js` do guia do discord.js.
   *
   * Sobrescrita em bloco, numa transação: o que não veio no corpo é apagado, o
   * que veio é criado ou atualizado **pelo nome**. Atualizar em vez de recriar
   * preserva o `id` de um comando que não mudou — é o que o Discord faz, e é o
   * que evita que rodar o script duas vezes invalide o `commandId` que o
   * composer já carregou.
   */
  @Put("commands")
  async sobrescreverGlobais(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
    @Body(zodBody(comandosParaRegistrarSchema)) comandos: ComandoParaRegistrar[],
  ): Promise<JsonDoDiscord[]> {
    return this.sobrescrever(bot, await this.escopoGlobal(bot, app), comandos.map(normalizarComando));
  }

  @Post("commands")
  async criarGlobal(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
    @Body(zodBody(comandoParaRegistrarSchema)) comando: ComandoParaRegistrar,
  ): Promise<JsonDoDiscord> {
    return this.criarOuAtualizar(bot, await this.escopoGlobal(bot, app), normalizarComando(comando));
  }

  @Get("commands/:cmd")
  async umGlobal(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
    @Param("cmd") cmd: string,
  ): Promise<JsonDoDiscord> {
    const escopo = await this.escopoGlobal(bot, app);
    return this.paraDiscord(bot, escopo, await this.acharOuFalhar(bot, escopo, cmd));
  }

  @Patch("commands/:cmd")
  async editarGlobal(): Promise<never> {
    throw naoImplementado("PATCH /applications/:app/commands/:id");
  }

  @Delete("commands/:cmd")
  @HttpCode(HttpStatus.NO_CONTENT)
  async apagarGlobal(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
    @Param("cmd") cmd: string,
  ): Promise<void> {
    await this.apagar(bot, await this.escopoGlobal(bot, app), cmd);
  }

  // ── comandos por servidor ──────────────────────────────────

  @Get("guilds/:gid/commands")
  async listarDoServidor(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
    @Param("gid") gid: string,
  ): Promise<JsonDoDiscord[]> {
    return this.listar(bot, await this.escopoDoServidor(bot, app, gid));
  }

  @Put("guilds/:gid/commands")
  async sobrescreverDoServidor(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
    @Param("gid") gid: string,
    @Body(zodBody(comandosParaRegistrarSchema)) comandos: ComandoParaRegistrar[],
  ): Promise<JsonDoDiscord[]> {
    return this.sobrescrever(
      bot,
      await this.escopoDoServidor(bot, app, gid),
      comandos.map(normalizarComando),
    );
  }

  @Post("guilds/:gid/commands")
  async criarNoServidor(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
    @Param("gid") gid: string,
    @Body(zodBody(comandoParaRegistrarSchema)) comando: ComandoParaRegistrar,
  ): Promise<JsonDoDiscord> {
    return this.criarOuAtualizar(
      bot,
      await this.escopoDoServidor(bot, app, gid),
      normalizarComando(comando),
    );
  }

  @Get("guilds/:gid/commands/:cmd")
  async umDoServidor(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
    @Param("gid") gid: string,
    @Param("cmd") cmd: string,
  ): Promise<JsonDoDiscord> {
    const escopo = await this.escopoDoServidor(bot, app, gid);
    return this.paraDiscord(bot, escopo, await this.acharOuFalhar(bot, escopo, cmd));
  }

  @Patch("guilds/:gid/commands/:cmd")
  async editarDoServidor(): Promise<never> {
    throw naoImplementado("PATCH /applications/:app/guilds/:id/commands/:id");
  }

  @Delete("guilds/:gid/commands/:cmd")
  @HttpCode(HttpStatus.NO_CONTENT)
  async apagarDoServidor(
    @BotAtual() bot: BotAutenticado,
    @Param("app") app: string,
    @Param("gid") gid: string,
    @Param("cmd") cmd: string,
  ): Promise<void> {
    await this.apagar(bot, await this.escopoDoServidor(bot, app, gid), cmd);
  }

  // ── o escopo (global ou por servidor) ──────────────────────

  /**
   * Confere o `:app` do caminho.
   *
   * `@me` é aceito como apelido do aplicativo do token: o Discord não o aceita
   * nessa rota, mas nada se perde em aceitá-lo aqui — e um bot que use o
   * apelido, em vez de 403, funciona.
   */
  protected conferirApp(bot: BotAutenticado, app: string): void {
    if (app === "@me" || app === String(bot.applicationSnowflake)) return;
    // 403 e não 404: o aplicativo existe (ou não, e não é da conta de quem
    // perguntou) — o que este token não pode é falar por ele
    throw semAcesso();
  }

  protected async escopoGlobal(bot: BotAutenticado, app: string): Promise<Escopo> {
    this.conferirApp(bot, app);
    return { guildId: null, guildSnowflake: null };
  }

  /**
   * O `:gid` do caminho → cuid do servidor, com duas recusas.
   *
   * Servidor que não existe é 404 `10004`. Servidor onde o **usuário-bot não é
   * membro** é 403 `50001`, como no Discord: registrar comando num servidor de
   * onde o bot foi removido gravaria linhas que ninguém jamais veria, e o dono
   * do bot só descobriria pelo silêncio do composer.
   *
   * (Na F3 "estar no servidor" é ter linha de `GuildMember` — a `GuildApplication`
   * é a migration 3, da F4. Divergência já registrada no `CONTRATO-F3.md` §3.2.)
   */
  protected async escopoDoServidor(
    bot: BotAutenticado,
    app: string,
    gid: string,
  ): Promise<Escopo> {
    this.conferirApp(bot, app);

    const guildId = ehSnowflake(gid) ? await this.ids.cuidDeServidor(gid) : null;
    if (!guildId) throw servidorDesconhecido();

    const membro = await this.dados.membroDoServidor(guildId, bot.botUserId);
    if (!membro) throw semAcesso();

    return { guildId, guildSnowflake: gid };
  }

  // ── as operações ───────────────────────────────────────────

  protected async listar(bot: BotAutenticado, escopo: Escopo): Promise<JsonDoDiscord[]> {
    const linhas = await this.comandos().findMany({
      where: { applicationId: bot.applicationId, guildId: escopo.guildId },
      orderBy: { name: "asc" },
    });
    return linhas.map((linha: LinhaDeComando) => this.paraDiscord(bot, escopo, linha));
  }

  /**
   * O `PUT`: o corpo passa a ser a lista inteira do escopo.
   *
   * Numa transação, e nesta ordem: apaga o que não veio, depois grava o que
   * veio. Duas execuções seguidas do mesmo `deploy-commands.js` deixam o banco
   * idêntico — é o que "idempotente" quer dizer aqui.
   *
   * O `updateMany` + `create` faz o papel de um `upsert`, que o Prisma não
   * consegue por `@@unique([applicationId, guildId, name])` quando `guildId` é
   * nulo: um `where` composto do Prisma não aceita `null` num dos campos, e
   * comando global tem `guildId` nulo por definição.
   */
  protected async sobrescrever(
    bot: BotAutenticado,
    escopo: Escopo,
    comandos: ComandoNormalizado[],
  ): Promise<JsonDoDiscord[]> {
    const doEscopo = { applicationId: bot.applicationId, guildId: escopo.guildId };

    const linhas = await this.prisma.$transaction(async (tx) => {
      const repositorio = comandosDe(tx);

      await repositorio.deleteMany({
        where:
          // lista vazia é "apaga tudo", escrito assim e não como `notIn: []`:
          // um `notIn` vazio depende de o Prisma o traduzir para "sempre
          // verdadeiro", e apagar comando nenhum quando o dono do bot pediu
          // para apagar todos seria um defeito silencioso
          comandos.length === 0
            ? doEscopo
            : { ...doEscopo, name: { notIn: comandos.map((c) => c.name) } },
      });
      for (const comando of comandos) {
        await this.gravar(repositorio, doEscopo, comando);
      }

      return repositorio.findMany({ where: doEscopo, orderBy: { name: "asc" } });
    });

    return linhas.map((linha: LinhaDeComando) => this.paraDiscord(bot, escopo, linha));
  }

  /**
   * O `POST`: cria o comando, ou atualiza o de mesmo nome.
   *
   * É o que o Discord faz — `ApplicationCommandManager.create()` com um nome que
   * já existe devolve o comando atualizado, e não um 400.
   */
  protected async criarOuAtualizar(
    bot: BotAutenticado,
    escopo: Escopo,
    comando: ComandoNormalizado,
  ): Promise<JsonDoDiscord> {
    const doEscopo = { applicationId: bot.applicationId, guildId: escopo.guildId };
    await this.gravar(this.comandos(), doEscopo, comando);

    const linha = await this.comandos().findFirst({ where: { ...doEscopo, name: comando.name } });
    // acabou de ser gravado na linha de cima; se sumiu, alguém apagou no meio
    if (!linha) throw comandoDesconhecido();
    return this.paraDiscord(bot, escopo, linha);
  }

  protected async apagar(bot: BotAutenticado, escopo: Escopo, cmd: string): Promise<void> {
    const linha = await this.acharOuFalhar(bot, escopo, cmd);
    await this.comandos().deleteMany({ where: { id: linha.id } });
  }

  // ── internos ───────────────────────────────────────────────

  /** Grava um comando: atualiza o de mesmo nome, ou cria. */
  private async gravar(
    repositorio: PrismaService["applicationCommand"],
    doEscopo: { applicationId: string; guildId: string | null },
    comando: ComandoNormalizado,
  ): Promise<void> {
    const dados = {
      description: comando.description,
      type: comando.type,
      // A coluna é `Json`, e o input de Json do Prisma é `InputJsonValue` — um
      // tipo estrutural que **não** aceita um array de interface nomeada (falta
      // a index signature). O `cast` é sobre a forma do JSON, não sobre o nome
      // das colunas: essas o `tsc` continua conferindo, no `where` e no `create`
      // logo abaixo, que é justamente por que o delegate aqui é o gerado.
      options: comando.options as unknown as Prisma.InputJsonValue,
      defaultMemberPermissions: comando.defaultMemberPermissions,
    };

    const alterados = await repositorio.updateMany({
      where: { ...doEscopo, name: comando.name },
      data: dados,
    });
    if (alterados.count === 0) {
      await repositorio.create({ data: { ...doEscopo, name: comando.name, ...dados } });
    }
  }

  /** O `:cmd` do caminho (snowflake) → a linha, dentro do escopo pedido. */
  protected async acharOuFalhar(
    bot: BotAutenticado,
    escopo: Escopo,
    cmd: string,
  ): Promise<LinhaDeComando> {
    // `BigInt("lixo")` lança `SyntaxError`, que viraria 500; um id que não é
    // snowflake simplesmente não existe
    if (!ehSnowflake(cmd)) throw comandoDesconhecido();

    const linha = await this.comandos().findFirst({
      where: {
        snowflake: BigInt(cmd),
        applicationId: bot.applicationId,
        guildId: escopo.guildId,
      },
    });
    if (!linha) throw comandoDesconhecido();
    return linha;
  }

  /**
   * A linha → o objeto `ApplicationCommand` do Discord.
   *
   * O `_patch` do discord.js lê `id`, `application_id`, `name`, `description`,
   * `type`, `options`, `guild_id`, `version` e `default_member_permissions`.
   * Todos saem daqui, preenchidos, mesmo os inertes: campo faltando quebra
   * **dentro** da lib, e a lição da F1 (o `GUILD_CREATE` que levantava `KeyError`
   * no discord.py) é literalmente esta.
   *
   * `version` no Discord é um snowflake que muda a cada atualização do comando;
   * aqui é o snowflake do próprio comando — opaco, estável, e as libs só o
   * guardam. `guild_id` só aparece no comando por servidor, como lá.
   */
  protected paraDiscord(
    bot: BotAutenticado,
    escopo: Escopo,
    linha: LinhaDeComando,
  ): JsonDoDiscord {
    return {
      id: String(linha.snowflake),
      application_id: String(bot.applicationSnowflake),
      version: String(linha.snowflake),
      type: linha.type ?? TIPO_CHAT_INPUT,
      name: linha.name,
      name_localizations: null,
      description: linha.description,
      description_localizations: null,
      options: opcoes(linha.options),
      default_member_permissions: linha.defaultMemberPermissions,
      nsfw: false,
      ...(escopo.guildSnowflake === null
        ? // `dm_permission` só existe em comando global; no Discord ele diz se o
          // comando vale em DM. Bot em DM é F5, então o valor é `false` — e é
          // honesto: um `/play` na DM não teria canal onde responder.
          { dm_permission: false }
        : { guild_id: escopo.guildSnowflake }),
    };
  }

  /** O repositório fora de transação. Ver o cabeçalho do arquivo. */
  private comandos(): PrismaService["applicationCommand"] {
    return comandosDe(this.prisma);
  }
}

@Controller("v9/applications/:app")
export class ApplicationCommandsCompatControllerV9 extends ApplicationCommandsCompatController {}

/** Global (`guildId` nulo) ou de um servidor. */
interface Escopo {
  /** cuid do servidor; null = comando global. */
  guildId: string | null;
  /** o snowflake do caminho, que é o que sai na resposta. */
  guildSnowflake: string | null;
}

/**
 * A linha de `ApplicationCommand` (§10 do documento, migration 4 do lote A).
 *
 * Escrita à mão porque o cliente do Prisma desta branch ainda não conhece o
 * modelo — ver o cabeçalho do arquivo.
 */
interface LinhaDeComando {
  id: string;
  snowflake: bigint;
  applicationId: string;
  guildId: string | null;
  name: string;
  description: string;
  type: number;
  /** `OpcaoDeComando[]` gravado como Json. */
  options: unknown;
  defaultMemberPermissions: string | null;
}

/**
 * O delegate de `ApplicationCommand`, do cliente ou de dentro de uma transação.
 *
 * Enquanto os lotes A e B corriam em paralelo isto era uma interface estrutural
 * com um `cast`, porque o modelo só entrava no `schema.prisma` pela migration 4,
 * que é do lote A. **Na integração o `cast` saiu**, e é de propósito: com o
 * delegate gerado, o `tsc` confere nome de campo por nome de campo contra o
 * schema. Era o único jeito de a migration e a casca não divergirem em silêncio
 * — um `cast` compila igualzinho com o nome errado.
 */
function comandosDe(cliente: {
  applicationCommand: PrismaService["applicationCommand"];
}): PrismaService["applicationCommand"] {
  return cliente.applicationCommand;
}

/** O Json da coluna → a lista de opções que a resposta do Discord leva. */
function opcoes(valor: unknown): OpcaoDeComando[] {
  return Array.isArray(valor) ? (valor as OpcaoDeComando[]) : [];
}

/**
 * 404 para um comando que não existe naquele escopo.
 *
 * O 10063 entrou no mapa `CODIGO` na integração da fase, exatamente por causa
 * desta função: é o código que a lib do bot usa para distinguir "esse comando eu
 * mesmo apaguei" de "deu ruim no servidor".
 */
function comandoDesconhecido(): ErroDoDiscord {
  return new ErroDoDiscord(
    HttpStatus.NOT_FOUND,
    CODIGO.COMANDO_DESCONHECIDO,
    "Unknown application command",
  );
}
