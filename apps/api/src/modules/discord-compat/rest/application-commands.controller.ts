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
 * > **Falta uma linha de fiação, e ela é do coordenador** (regra do §1 do
 * > `CONTRATO-F3.md`: quem acha uma peça faltando relata, não cria). Este
 * > controller é registrado no `InteractionsModule`, e o Nest constrói o
 * > `BotTokenGuard` no contexto **desse** módulo — mas o `ApplicationsService`
 * > de que o guard depende só é visível de dentro do `DiscordCompatModule`, que
 * > importa o `ApplicationsModule` **sem reexportá-lo**. Sem uma das duas
 * > linhas abaixo, a aplicação não sobe (`Nest can't resolve dependencies of
 * > the BotTokenGuard`), e o erro aparece no `bootstrap`, não aqui:
 * >
 * > - `DiscordCompatModule`: `exports: [… , ApplicationsModule]`, ou
 * > - `InteractionsModule`: `imports: [… , ApplicationsModule]`.
 * >
 * > Conferido num Nest de verdade, com esta forma exata de grafo: sem o
 * > reexport o `NestFactory.create` rejeita; com ele, sobe. As rotas de callback
 * > e followup **não** têm esse problema — elas não têm guard nenhum, o que é
 * > o §3.3 do contrato.
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
 * **O acesso à tabela é por uma interface estrutural** (`RepositorioDeComandos`,
 * no fim do arquivo) e não pelo `prisma.applicationCommand` gerado, porque o
 * modelo `ApplicationCommand` entra no `schema.prisma` pela migration 4, que é
 * do **lote A**: escrever `this.prisma.applicationCommand` nesta branch não
 * compilaria, e duplicar o bloco do schema aqui daria conflito no merge. O
 * formato dos campos é o do §10 do documento, palavra por palavra; quando os
 * dois lotes se juntarem, o `cast` vira redundância inofensiva.
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
    return linhas.map((linha) => this.paraDiscord(bot, escopo, linha));
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

    return linhas.map((linha) => this.paraDiscord(bot, escopo, linha));
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
    repositorio: RepositorioDeComandos,
    doEscopo: { applicationId: string; guildId: string | null },
    comando: ComandoNormalizado,
  ): Promise<void> {
    const dados = {
      description: comando.description,
      type: comando.type,
      options: comando.options,
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
  private comandos(): RepositorioDeComandos {
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

/** O punhado de operações do Prisma que o registro de comandos usa. */
interface RepositorioDeComandos {
  findMany(argumentos: unknown): Promise<LinhaDeComando[]>;
  findFirst(argumentos: unknown): Promise<LinhaDeComando | null>;
  create(argumentos: unknown): Promise<LinhaDeComando>;
  updateMany(argumentos: unknown): Promise<{ count: number }>;
  deleteMany(argumentos: unknown): Promise<{ count: number }>;
}

/**
 * O delegate de `ApplicationCommand`, do cliente ou de uma transação.
 *
 * O `cast` é a ponte entre os dois lotes desta fase e some sozinho quando a
 * migration 4 entrar: a partir daí `cliente.applicationCommand` existe com este
 * mesmo formato, e a interface acima vira a documentação do que a casca usa.
 */
function comandosDe(cliente: unknown): RepositorioDeComandos {
  return (cliente as { applicationCommand: RepositorioDeComandos }).applicationCommand;
}

/** O Json da coluna → a lista de opções que a resposta do Discord leva. */
function opcoes(valor: unknown): OpcaoDeComando[] {
  return Array.isArray(valor) ? (valor as OpcaoDeComando[]) : [];
}

/**
 * 404 para um comando que não existe naquele escopo.
 *
 * O código do Discord para isto é o **10063** (`Unknown application command`), e
 * ele **não está** no mapa `CODIGO` de `erros.ts` — que é do coordenador, e onde
 * a F3 só podia acrescentar os dois atalhos de interação (§2 do `CONTRATO-F3.md`).
 * Até o mapa ganhar o 10063, o código é o 0 genérico e o texto é o do Discord:
 * o `DiscordAPIError` do bot mostra a mensagem certa, e só a classificação
 * numérica fica pobre. **Relatado no PR.**
 */
function comandoDesconhecido(): ErroDoDiscord {
  return new ErroDoDiscord(HttpStatus.NOT_FOUND, CODIGO.GERAL, "Unknown application command");
}
