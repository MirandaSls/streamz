import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import type { AppCriado, AppDetalhe, AppView, TokenCriado } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { toPublicUser, type PublicUserRow } from "../../common/dto";
import { isUniqueViolation } from "../../common/prisma-errors";
import { gerarToken, hashDoToken } from "./token";

/** O que o service precisa de uma linha de `Application` para montar o DTO. */
interface LinhaDeApp {
  id: string;
  snowflake: bigint;
  name: string;
  description: string | null;
  publico: boolean;
  permissoesPadrao: number;
  createdAt: Date;
}

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
  constructor(private readonly prisma: PrismaService) {}

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
      include: {
        botUser: true,
        // só o token em vigor: os revogados ficam na tabela para auditoria, mas
        // não são o que a tela mostra
        tokens: { where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((a) => {
      const t = a.tokens[0];
      return this.paraDetalhe(
        a,
        a.botUser,
        t ? { prefixo: t.prefixo, criadoEm: t.createdAt.toISOString() } : null,
      );
    });
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
      // o ícone do aplicativo é do portal do desenvolvedor (F4); até lá não há
      // o que servir, e o cliente cai no mesmo padrão do avatar ausente
      iconUrl: null,
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
