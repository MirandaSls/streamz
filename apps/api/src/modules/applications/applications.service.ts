import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import * as argon2 from "argon2";
import type {
  AppCriado,
  AppDetalhe,
  AppEditarInput,
  AppView,
  ServidorComOApp,
  TokenCriado,
} from "@streamz/shared";
import { MAX_GUILD_ICON_SIZE } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { InstalacaoService } from "./instalacao.service";
import { toPublicUser, type PublicUserRow } from "../../common/dto";
import { isUniqueViolation } from "../../common/prisma-errors";
import { sniffImage } from "../uploads/media";
import { gerarToken, hashDoToken } from "./token";

/** O que o service precisa de uma linha de `Application` para montar o DTO. */
interface LinhaDeApp {
  id: string;
  snowflake: bigint;
  name: string;
  description: string | null;
  iconKey: string | null;
  publico: boolean;
  permissoesPadrao: number;
  createdAt: Date;
}

/**
 * Extensões reconhecidas, por mime — a chave do bucket carrega a extensão para
 * que um objeto baixado do R2 abra num visualizador sem adivinhação.
 *
 * O mime vem de `sniffImage` (magic bytes), nunca do que o cliente declarou:
 * é a mesma regra do ícone de servidor e do anexo.
 */
const EXTENSAO_POR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Só o token em vigor. Os revogados ficam na tabela para auditoria, mas não
 * são o que a tela mostra — e `take: 1` sobre `createdAt desc` é o que faz o
 * `AppDetalhe` ter um `tokenPrefixo` só.
 */
const INCLUI_TOKEN_EM_VIGOR = {
  tokens: { where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
} as const;

/**
 * Aplicativos (bots): criar, listar os meus e regenerar o token.
 *
 * É o REST **interno** — autenticado como usuário normal (`JwtGuard`), sob o
 * prefixo `/api` de sempre. Não confundir com a casca de compatibilidade em
 * `/api/v10/**`, que é a fase seguinte e fala com o bot, não com o dono.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §10 e §12 (F0).
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly instalacao: InstalacaoService,
  ) {}

  /**
   * Cria o aplicativo, o usuário-bot e o primeiro token, de uma vez.
   *
   * O token em claro sai **só aqui**. Depois disso o banco tem apenas o
   * sha256, e nem o dono o recupera: a saída é regenerar.
   */
  async criar(donoId: string, name: string): Promise<AppCriado> {
    const botUser = await this.criarUsuarioBot(name);

    const app = await this.prisma.application.create({
      data: { ownerId: donoId, name, botUserId: botUser.id },
    });

    const token = await this.emitirToken(app.id, botUser.snowflake);
    return { app: this.paraDetalhe(app, botUser, token), token };
  }

  /** Os aplicativos de quem chamou, do mais novo para o mais antigo. */
  async listarMinhas(donoId: string): Promise<AppDetalhe[]> {
    const rows = await this.prisma.application.findMany({
      where: { ownerId: donoId },
      include: { botUser: true, ...INCLUI_TOKEN_EM_VIGOR },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((a) => this.detalheDaLinha(a));
  }

  /**
   * Regenera o token: emite um novo e revoga todos os anteriores.
   *
   * O bot que estiver rodando com o antigo para de funcionar **na hora** — é o
   * comportamento do Discord, e a tela avisa antes de chamar isto.
   */
  async regenerarToken(donoId: string, appId: string): Promise<TokenCriado> {
    const app = await this.prisma.application.findUnique({
      where: { id: appId },
      include: { botUser: { select: { snowflake: true } } },
    });
    if (!app) throw new NotFoundException("Aplicativo não encontrado");
    if (app.ownerId !== donoId) throw new ForbiddenException("Este aplicativo não é seu");

    await this.prisma.botToken.updateMany({
      where: { applicationId: app.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.emitirToken(app.id, app.botUser.snowflake);
  }

  // ── j-bots · F4 · portal do desenvolvedor ──────────────────

  /**
   * Edita nome, descrição, visibilidade no diretório e permissões sugeridas.
   *
   * **Só o que veio é escrito.** `appEditarSchema` é `.partial()`, e a
   * diferença entre "não mandei" (`undefined`) e "apague" (`null`, só a
   * descrição) é o que permite o interruptor "Publicar no diretório" salvar
   * sozinho sem carregar o formulário inteiro junto.
   *
   * O nome **não** propaga para o `displayName` do usuário-bot de propósito: o
   * bot já está em servidores com aquele nome na lista de membros, e renomear
   * o aplicativo no portal não é renomear o membro. Quem quiser os dois iguais
   * troca os dois — é o que o Discord faz.
   */
  async editar(donoId: string, appId: string, patch: AppEditarInput): Promise<AppDetalhe> {
    await this.doMeuApp(donoId, appId);

    const app = await this.prisma.application.update({
      where: { id: appId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.publico !== undefined ? { publico: patch.publico } : {}),
        ...(patch.permissoesPadrao !== undefined
          ? { permissoesPadrao: patch.permissoesPadrao }
          : {}),
      },
      include: { botUser: true, ...INCLUI_TOKEN_EM_VIGOR },
    });
    return this.detalheDaLinha(app);
  }

  /**
   * Apaga o aplicativo — a rota perigosa do portal. A ordem importa:
   *
   * 1. desfaz cada instalação (tira o membro-bot, apaga o cargo, emite os
   *    eventos, manda `GUILD_DELETE`);
   * 2. só então apaga o **usuário-bot**. A `Application` cai junto pelo
   *    `onDelete: Cascade` de `botUser`, e com ela tokens, comandos e
   *    interações.
   *
   * Apagar a `Application` sozinha deixaria um `User` órfão com `isBot: true`
   * — uma conta que não faz login, não tem dono e continua na lista de membros
   * de todo servidor onde entrou.
   *
   * **A junção A↔B, ligada na integração da F4.** O passo 1 chama o
   * `InstalacaoService.desinstalar` do lote B, e não uma segunda
   * implementação: duas rotinas que tiram o mesmo bot do mesmo servidor
   * divergem no primeiro evento novo.
   *
   * O `onDelete: Cascade` do banco (`User` → `GuildMember`,
   * `Application` → `GuildApplication`) já deixava o **banco** consistente
   * sozinho. O que ele não faz é o **evento**: sem o laço abaixo, as telas
   * abertas continuariam mostrando o bot na lista de membros até alguém
   * recarregar, e um bot conectado nunca receberia o `GUILD_DELETE`.
   *
   * Sem transação por cima do laço, de propósito. Cada `desinstalar` já é
   * atômico no seu servidor e emite os eventos dele **depois** do commit; uma
   * transação por fora só serviria para segurar N servidores reféns de uma
   * falha no último, e não daria como desfazer os eventos que já saíram.
   */
  async apagar(donoId: string, appId: string): Promise<void> {
    const app = await this.doMeuApp(donoId, appId);

    // 1. sai de cada servidor onde está, com os eventos que isso implica
    for (const inst of await this.instalacao.instalacoesDoApp(appId)) {
      await this.instalacao.desinstalar(inst.id, inst.guildId, app.botUserId, inst.roleId);
    }

    // o objeto do bucket sai antes do banco: depois do `delete` não há mais
    // linha que guarde a chave, e ela viraria um órfão que ninguém sabe nomear
    if (app.iconKey) await this.storage.delete(app.iconKey);

    // 2. o usuário-bot. A `Application` cai junto pelo cascade de `botUser`.
    await this.prisma.user.delete({ where: { id: app.botUserId } });
  }

  /**
   * Ícone do aplicativo — o padrão do **ícone de servidor**, não o do avatar.
   *
   * `Application` não tem coluna `iconUrl` (o §10 não a declarou): só a chave,
   * e a URL é derivada em `iconUrl()` a cada leitura. Isso quer dizer que a
   * troca do ícone não precisa reescrever URL nenhuma — mas quer dizer também
   * que existe uma rota pública de leitura, `GET /applications/:id/icone`,
   * pelo mesmo motivo de `GET /guilds/:id/icon`: `<img src>` não manda token.
   */
  async atualizarIcone(
    donoId: string,
    appId: string,
    file: { buffer: Buffer; size: number },
  ): Promise<AppDetalhe> {
    const antes = await this.doMeuApp(donoId, appId);
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        "Armazenamento (R2) não configurado. Ver PENDENCIAS.md.",
      );
    }
    if (!file?.buffer?.length) throw new BadRequestException("Arquivo vazio");
    if (file.size > MAX_GUILD_ICON_SIZE) {
      throw new PayloadTooLargeException(`Ícone acima de ${MAX_GUILD_ICON_SIZE / 1024 / 1024} MB`);
    }
    const image = sniffImage(file.buffer);
    if (!image) {
      throw new BadRequestException("O ícone precisa ser uma imagem (PNG, JPEG, GIF ou WebP)");
    }

    const key = `app-icons/${appId}/${randomUUID()}.${EXTENSAO_POR_MIME[image.mime] ?? "bin"}`;
    await this.storage.put(key, file.buffer, image.mime);
    const app = await this.prisma.application.update({
      where: { id: appId },
      data: { iconKey: key },
      include: { botUser: true, ...INCLUI_TOKEN_EM_VIGOR },
    });
    // o arquivo antigo sai depois de o banco já apontar para o novo: se apagar
    // falhar sobra um objeto órfão, não um ícone quebrado
    if (antes.iconKey) await this.storage.delete(antes.iconKey);

    return this.detalheDaLinha(app);
  }

  /** Remove o ícone (a lista volta para a inicial do nome). Só o dono. */
  async removerIcone(donoId: string, appId: string): Promise<AppDetalhe> {
    const antes = await this.doMeuApp(donoId, appId);
    const app = await this.prisma.application.update({
      where: { id: appId },
      data: { iconKey: null },
      include: { botUser: true, ...INCLUI_TOKEN_EM_VIGOR },
    });
    if (antes.iconKey) await this.storage.delete(antes.iconKey);
    return this.detalheDaLinha(app);
  }

  /**
   * Corpo + content-type do ícone para o proxy público
   * (`GET /applications/:id/icone`).
   *
   * Público de propósito, como o ícone de servidor: a tag `<img>` não manda
   * `Authorization`. O que ele revela é o ícone de um aplicativo — a mesma
   * imagem que o diretório mostra a qualquer um.
   */
  async iconeStream(appId: string): Promise<{ body: Readable; contentType: string }> {
    const app = await this.prisma.application.findUnique({
      where: { id: appId },
      select: { iconKey: true },
    });
    if (!app?.iconKey) throw new NotFoundException("Sem ícone");
    // o content-type real foi validado no upload; o proxy sempre serve imagem
    return { body: await this.storage.get(app.iconKey), contentType: "image/*" };
  }

  /**
   * Tela 5 do portal: em que servidores este aplicativo meu está instalado.
   *
   * Ligada na integração da F4, sobre a `GuildApplication` do lote B.
   *
   * É a lista **do dono**, não a de quem instalou: `doMeuApp` já recusou o app
   * de outra pessoa. Por isso ela mostra servidores em que o dono do app pode
   * não estar — é justamente a pergunta que a tela faz ("onde este aplicativo
   * meu está instalado?"), e o nome do servidor não é segredo de ninguém que
   * já convive com o bot ali.
   */
  async servidoresComOApp(donoId: string, appId: string): Promise<ServidorComOApp[]> {
    await this.doMeuApp(donoId, appId);

    const linhas = await this.prisma.guildApplication.findMany({
      where: { applicationId: appId },
      orderBy: { createdAt: "asc" },
      select: {
        permissions: true,
        createdAt: true,
        guild: { select: { id: true, name: true, iconUrl: true } },
      },
    });

    return linhas.map((l) => ({
      guildId: l.guild.id,
      guildName: l.guild.name,
      guildIconUrl: l.guild.iconUrl,
      permissions: l.permissions,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  /**
   * O token em claro → a aplicação a que ele pertence, ou `null`.
   *
   * É o que o `BotTokenGuard` da F1 vai chamar a **cada** requisição, e por
   * isso o caminho é um `findUnique` por índice sobre o sha256: sem argon2,
   * sem varredura. Token desconhecido ou revogado devolve `null` — quem
   * transforma isso em 401 é o guard, não este método.
   */
  async verificarToken(token: string): Promise<{
    application: { id: string; snowflake: bigint; name: string };
    botUserId: string;
  } | null> {
    const linha = await this.prisma.botToken.findUnique({
      where: { tokenHash: hashDoToken(token) },
      include: { application: true },
    });
    if (!linha || linha.revokedAt) return null;

    // "visto por último" do token, para a tela do dono saber qual está em uso.
    await this.prisma.botToken.update({
      where: { id: linha.id },
      data: { lastUsedAt: new Date() },
    });

    const { id, snowflake, name, botUserId } = linha.application;
    return { application: { id, snowflake, name }, botUserId };
  }

  // ── internos ───────────────────────────────────────────────

  /**
   * O aplicativo, se ele existe **e** é de quem chamou.
   *
   * **404** para o que não existe, **403** para o de outra pessoa — é o que
   * `regenerarToken` já fazia, e agora todas as rotas do portal passam por
   * aqui em vez de repetir as duas linhas.
   */
  private async doMeuApp(donoId: string, appId: string) {
    const app = await this.prisma.application.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException("Aplicativo não encontrado");
    if (app.ownerId !== donoId) throw new ForbiddenException("Este aplicativo não é seu");
    return app;
  }

  /** Linha com `botUser` e o token em vigor → `AppDetalhe`. */
  private detalheDaLinha(
    app: LinhaDeApp & { botUser: PublicUserRow; tokens: { prefixo: string; createdAt: Date }[] },
  ): AppDetalhe {
    const t = app.tokens[0];
    return this.paraDetalhe(
      app,
      app.botUser,
      t ? { prefixo: t.prefixo, criadoEm: t.createdAt.toISOString() } : null,
    );
  }

  /**
   * Cria o `User` do bot: `isBot`, sem e-mail e com uma senha que ninguém
   * conhece.
   *
   * `passwordHash` é obrigatório e não existe "sem senha" no esquema — então o
   * hash é de 32 bytes aleatórios descartados aqui mesmo. Como o login exige
   * username/e-mail **e** senha, e esta é irrecuperável, a conta não entra por
   * caminho nenhum.
   *
   * O username é único no banco: tenta criar e trata a colisão (`P2002`), em
   * vez de consultar antes — o findUnique-then-create tem corrida entre a
   * checagem e a inserção, e é o mesmo motivo do código de convite.
   */
  private async criarUsuarioBot(name: string) {
    const passwordHash = await argon2.hash(randomBytes(32).toString("hex"));
    const base = baseDoUsernameDoBot(name);

    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      // "Música do Zé" vira `musica-do-ze`; o segundo com o mesmo nome, `musica-do-ze-2`
      const username = tentativa === 1 ? base : `${base}-${tentativa}`;
      try {
        return await this.prisma.user.create({
          data: { username, displayName: name, passwordHash, isBot: true },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    // cinco nomes ocupados: desiste da legibilidade e usa aleatório
    return this.prisma.user.create({
      data: {
        username: `${base}-${randomBytes(4).toString("hex")}`,
        displayName: name,
        passwordHash,
        isBot: true,
      },
    });
  }

  private async emitirToken(applicationId: string, snowflakeDoBot: bigint): Promise<TokenCriado> {
    const { token, hash, prefixo } = gerarToken(snowflakeDoBot);
    const linha = await this.prisma.botToken.create({
      data: { applicationId, tokenHash: hash, prefixo },
    });
    return { token, prefixo, criadoEm: linha.createdAt.toISOString() };
  }

  /**
   * Linha → DTO, campo a campo.
   *
   * Campo a campo e não `...app` porque a linha tem `snowflake` (`BigInt`), e
   * `JSON.stringify` de um `bigint` lança `TypeError`. Aqui ele vira string
   * decimal, que é como o Discord serializa qualquer id.
   */
  private paraDetalhe(
    app: LinhaDeApp,
    botUser: PublicUserRow,
    token: { prefixo: string; criadoEm: string } | null,
  ): AppDetalhe {
    const view: AppView = {
      id: app.id,
      snowflake: app.snowflake.toString(),
      name: app.name,
      description: app.description,
      iconUrl: iconeDoApp(app.id, app.iconKey),
      publico: app.publico,
      permissoesPadrao: app.permissoesPadrao,
      createdAt: app.createdAt.toISOString(),
      botUser: toPublicUser(botUser),
    };
    return {
      ...view,
      tokenPrefixo: token?.prefixo ?? null,
      tokenCriadoEm: token?.criadoEm ?? null,
    };
  }
}

/**
 * Chave do ícone no bucket → a URL que o `<img>` do cliente usa.
 *
 * A `Application` **não tem coluna `iconUrl`** (o §10 do documento não a
 * declarou, ao contrário da `Guild`): a URL é derivada aqui, a cada leitura.
 * A decisão foi reaproveitar o proxy da própria API — `GET /applications/:id/icone`,
 * irmão de `GET /guilds/:id/icon` — em vez de expor a base pública do bucket:
 *
 * - o bucket pode ser privado (`R2_PUBLIC_BASE_URL` é opcional), e uma URL de
 *   objeto privado seria um `<img>` quebrado em produção;
 * - o proxy já existe, já põe `nosniff` e `Cache-Control: immutable`, e é o
 *   caminho que o resto do app usa para ícone de servidor.
 *
 * O UUID da chave vai na query como `v`: o `immutable` do proxy só é seguro
 * porque a URL muda quando o ícone muda.
 *
 * Exportada porque o diretório (lote B) monta o mesmo `iconUrl` a partir da
 * mesma chave — duas derivações divergentes dariam dois caches.
 */
export function iconeDoApp(appId: string, iconKey: string | null): string | null {
  if (!iconKey) return null;
  const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(/\/+$/, "");
  // o nome do arquivo é o UUID+extensão; basta ele para a versão
  const v = iconKey.split("/").pop() ?? "";
  return `${api}/api/applications/${appId}/icone?v=${v}`;
}

/**
 * Nome do aplicativo → base do username do usuário-bot.
 *
 * O `username` do Streamz aceita `[a-zA-Z0-9_.-]`, de 3 a 32 caracteres
 * (`packages/shared/src/auth.ts`). "Música do Zé" vira `musica-do-ze`. Nome de
 * que não sobra nada (só emoji, só CJK) cai em `bot`, e a unicidade fica a
 * cargo do sufixo de quem chama.
 *
 * O corte é em 23 e não em 32 porque o sufixo de desempate ainda precisa caber
 * nos 32 do contrato — o maior é `-a1b2c3d4`, de nove caracteres.
 */
export function baseDoUsernameDoBot(name: string): string {
  // NFD separa a letra do acento; o intervalo é o bloco de diacríticos
  const semAcento = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const limpo = semAcento
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 23)
    .replace(/[-._]+$/g, "");
  return limpo.length >= 3 ? limpo : "bot";
}
