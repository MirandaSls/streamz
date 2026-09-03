import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { HEADER_CLIENTE, WS_EVENTS, normalizarEmail, pareceEmail } from "@streamz/shared";
import type {
  AuthSession,
  AuthTokens,
  ContaLoginInput,
  ContaOk,
  ContaRegistroInput,
  EmailVerificado,
  LoginResult,
  MfaLoginInput,
  MinhaConta,
  PublicUser,
  SessionsRevokedEvent,
  TipoDeDispositivo,
} from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueViolation } from "../../common/prisma-errors";
import { toPublicUser, type PublicUserRow } from "../../common/dto";
import { RealtimeService } from "../realtime/realtime.service";
import { MailService } from "../mail/mail.service";
import { AccountStatusService } from "./account-status.service";
import { expiraEm, gerarTokenDeEmail, hashDeToken, linkDeEmail } from "./email-tokens";
import { aposAcerto, aposFalha, estaBloqueada, semMudanca } from "./lockout";
import {
  normalizarCliente,
  normalizarIp,
  normalizarUserAgent,
  tipoDeDispositivoDaRequisicao,
} from "./sessions";
import { hashDeCodigo, pareceCodigoDeRecuperacao } from "./recovery-codes";
import { validarCodigoTotp } from "./totp";

interface RefreshPayload {
  sub: string;
  username: string;
  jti: string;
}

interface TicketMfaPayload {
  sub: string;
  typ: "mfa";
}

/** O que a requisição HTTP conta sobre o aparelho que está entrando. */
export interface ContextoDeSessao {
  userAgent: string | null;
  ip: string | null;
  /**
   * App de desktop, navegador ou celular. Vem do `X-Streamz-Client` quando o
   * cliente é nosso; o `User-Agent` sozinho não separa o desktop (WebView2)
   * de uma aba do Edge. Guardado na sessão porque o cabeçalho só existe aqui.
   */
  dispositivo: TipoDeDispositivo;
}

/** Ticket de 2FA: curto de propósito — é só a ponte entre os dois fatores. */
const TICKET_MFA_EXPIRA = "5m";

/** Resposta única do login recusado. Ver o comentário em `lockout.ts`. */
const CREDENCIAIS_INVALIDAS = "Credenciais inválidas";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
    private readonly contas: AccountStatusService,
  ) {}

  // ── registro e login ───────────────────────────────────────

  async register(dto: ContaRegistroInput, ctx: ContextoDeSessao): Promise<AuthSession> {
    const email = normalizarEmail(dto.email);
    const passwordHash = await argon2.hash(dto.password);
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          username: dto.username,
          email,
          passwordHash,
          status: "ONLINE",
        },
      });
    } catch (e) {
      // corrida: dois registros do mesmo username/e-mail ao mesmo tempo
      if (isUniqueViolation(e)) throw new ConflictException(this.jaEmUso(e));
      throw e;
    }

    // Registro não dispara e-mail: a conta nasce utilizável e a confirmação do
    // e-mail é a pedido (`POST /me/email/resend` na aba Conta, ou
    // `/auth/resend-verification`). Assim criar conta não depende de SMTP.
    return { user: toPublicUser(user), tokens: await this.issueTokens(user.id, user.username, ctx) };
  }

  /**
   * Login por e-mail **ou** usuário. Toda recusa devolve a mesma mensagem: dizer
   * "conta trancada" ou "e-mail não existe" transformaria o login num oráculo de
   * quais contas existem.
   */
  async login(dto: ContaLoginInput, ctx: ContextoDeSessao): Promise<LoginResult> {
    const identificador = dto.identificador.trim();
    const user = await this.prisma.user.findFirst({
      where: pareceEmail(identificador)
        ? { email: normalizarEmail(identificador) }
        : { username: identificador },
    });
    // conta excluída não volta: o hash já é lixo aleatório, mas cortamos antes
    if (!user || user.deletedAt) throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);

    const agora = new Date();
    const bloqueio = { failedLogins: user.failedLogins, lockedUntil: user.lockedUntil };
    if (estaBloqueada(bloqueio, agora)) throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      const proximo = aposFalha(bloqueio, agora);
      if (!semMudanca(bloqueio, proximo)) {
        await this.prisma.user.update({ where: { id: user.id }, data: proximo });
      }
      throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);
    }

    if (!semMudanca(bloqueio, aposAcerto())) {
      await this.prisma.user.update({ where: { id: user.id }, data: aposAcerto() });
    }

    // 2FA ligado: o primeiro fator passou, mas a sessão só nasce em /auth/mfa
    if (user.mfaEnabledAt) {
      return { mfaRequired: true, ticket: await this.assinarTicketMfa(user.id) };
    }

    return this.abrirSessao(user, ctx);
  }

  /** Segundo fator: fecha o login que parou no desafio. */
  async mfaLogin(dto: MfaLoginInput, ctx: ContextoDeSessao): Promise<AuthSession> {
    const userId = await this.lerTicketMfa(dto.ticket);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || !user.mfaEnabledAt || !user.mfaSecret) {
      throw new UnauthorizedException("Desafio inválido ou expirado");
    }
    await this.consumirCodigoMfa(user.id, user.mfaSecret, dto.code);
    return this.abrirSessao(user, ctx);
  }

  /**
   * Confere o código do app autenticador **ou** um código de recuperação (que é
   * consumido no ato). Lança 401 quando nenhum dos dois serve.
   */
  async consumirCodigoMfa(userId: string, segredo: string, codigo: string): Promise<void> {
    if (pareceCodigoDeRecuperacao(codigo)) {
      const { count } = await this.prisma.mfaRecoveryCode.updateMany({
        where: { userId, codeHash: hashDeCodigo(codigo), usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) throw new UnauthorizedException("Código inválido");
      return;
    }
    if (!validarCodigoTotp(segredo, codigo)) throw new UnauthorizedException("Código inválido");
  }

  /** Abre a sessão de fato: reativa a conta desativada e emite os tokens. */
  private async abrirSessao(
    user: PublicUserRow & { disabledAt: Date | null },
    ctx: ContextoDeSessao,
  ): Promise<AuthSession> {
    // desativar é reversível de propósito: entrar de novo reativa (como no Discord)
    if (user.disabledAt) {
      await this.prisma.user.update({ where: { id: user.id }, data: { disabledAt: null } });
      this.contas.invalidar(user.id);
      this.logger.log(`Conta ${user.id} reativada pelo login`);
    }
    return {
      user: toPublicUser(user),
      tokens: await this.issueTokens(user.id, user.username, ctx),
    };
  }

  // ── sessão (refresh / logout) ──────────────────────────────

  /**
   * Rotação do refresh token **na mesma linha**: o hash antigo é trocado pelo
   * novo num único `updateMany` guardado por `revokedAt: null` e pela expiração.
   * Um token vazado morre no primeiro uso (o hash já não existe) e dois
   * refreshes simultâneos só deixam um passar.
   *
   * Reaproveitar a linha — em vez de revogar e criar outra — é o que dá à sessão
   * uma **identidade estável**: o `id` que a tela "Dispositivos" mostra e a
   * claim `sid` do access token continuam valendo depois de cada renovação.
   */
  async refresh(refreshToken: string, ctx: ContextoDeSessao): Promise<AuthTokens> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Refresh token inválido");
    }
    // tokens emitidos antes da rotação não têm jti → inválidos, mas nunca 500
    if (!payload.jti) throw new UnauthorizedException("Refresh token inválido");

    // a conta pode ter sido desativada/excluída depois do login
    const estado = await this.contas.estado(payload.sub);
    if (!estado.existe || estado.excluida || estado.desativada) {
      await this.revogarPorHash(this.hashJti(payload.jti));
      throw new UnauthorizedException("Sessão encerrada");
    }

    const novoJti = randomBytes(32).toString("hex");
    const novoHash = this.hashJti(novoJti);
    const agora = new Date();

    const { count } = await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashJti(payload.jti),
        revokedAt: null,
        expiresAt: { gt: agora },
      },
      data: {
        tokenHash: novoHash,
        lastUsedAt: agora,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        // reclassifica a cada renovação: sessão criada antes desta coluna
        // (ou antes de o desktop se identificar) se conserta sozinha aqui
        dispositivo: ctx.dispositivo,
        expiresAt: this.expiracaoDoRefresh(agora),
      },
    });
    if (count === 0) throw new UnauthorizedException("Refresh token inválido");

    const sessao = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: novoHash },
      select: { id: true },
    });
    if (!sessao) throw new UnauthorizedException("Refresh token inválido");

    return this.assinarPar(payload.sub, payload.username, novoJti, sessao.id);
  }

  /** Revoga o refresh token no logout (logout deixa de ser só client-side). */
  async logout(refreshToken: string): Promise<ContaOk> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      await this.revogarPorHash(this.hashJti(payload.jti));
    } catch {
      // token inválido/expirado: nada a revogar
    }
    return { ok: true };
  }

  // ── verificação de e-mail ──────────────────────────────────

  /** Confirma o e-mail a partir do token do link. */
  async verifyEmail(token: string): Promise<EmailVerificado> {
    const linha = await this.prisma.emailToken.findUnique({
      where: { tokenHash: hashDeToken(token) },
      include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
    });
    if (!linha || linha.type !== "VERIFY" || linha.usedAt || linha.expiresAt < new Date()) {
      throw new BadRequestException("Link inválido ou expirado. Peça um novo e-mail.");
    }
    // o e-mail pode ter mudado entre a emissão e o clique: o link velho não vale
    if (linha.user.email !== linha.email) {
      throw new BadRequestException("Este link é de um e-mail que não é mais o da conta.");
    }
    if (linha.user.emailVerifiedAt) {
      await this.prisma.emailToken.update({
        where: { id: linha.id },
        data: { usedAt: new Date() },
      });
      return { email: linha.email, alreadyVerified: true };
    }

    await this.prisma.$transaction([
      this.prisma.emailToken.update({ where: { id: linha.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: linha.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
    await this.avisarContaAtualizada(linha.userId);
    return { email: linha.email, alreadyVerified: false };
  }

  /**
   * Reenvia a verificação. Responde 200 mesmo quando o e-mail não existe ou já
   * está verificado — a rota é pública, e distinguir os casos diria quem tem
   * conta aqui.
   */
  async resendVerification(email: string): Promise<ContaOk> {
    const alvo = normalizarEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: alvo } });
    if (user && !user.deletedAt && !user.emailVerifiedAt) {
      await this.enviarVerificacao(user.id, user.username, alvo);
    }
    return { ok: true };
  }

  /**
   * Emite o token de verificação e manda o e-mail (invalidando os anteriores).
   *
   * `propagarFalha` decide o que acontece se o provedor recusar. O padrão é
   * engolir, porque o chamador comum é o registro (a conta já foi criada) e a
   * rota pública de reenvio, que precisa responder 200 sempre para não revelar
   * quem tem conta. Só a rota autenticada de reenvio pede `true`: ali a
   * entrega é a operação inteira.
   */
  async enviarVerificacao(
    userId: string,
    nome: string,
    email: string,
    { propagarFalha = false }: { propagarFalha?: boolean } = {},
  ): Promise<void> {
    const token = gerarTokenDeEmail();
    const agora = new Date();
    await this.prisma.$transaction([
      // um pedido novo invalida os links antigos: só o último vale
      this.prisma.emailToken.updateMany({
        where: { userId, type: "VERIFY", usedAt: null },
        data: { usedAt: agora },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          type: "VERIFY",
          email,
          tokenHash: hashDeToken(token),
          expiresAt: expiraEm("VERIFY", agora),
        },
      }),
    ]);
    // O token já foi gravado acima. Se a entrega falhar e propagarmos, o link
    // novo fica sem uso e o anterior segue invalidado — o pedido seguinte gera
    // outro. É o preço de não mentir sobre o envio.
    const mensagem = this.mail.verificacao(email, nome, linkDeEmail("/verify-email", token));
    if (propagarFalha) await this.mail.enviarOuFalhar(mensagem);
    else await this.mail.enviar(mensagem);
  }

  // ── recuperação de senha ───────────────────────────────────

  /** Sempre 200: a rota é pública e não pode revelar quem tem conta. */
  async forgotPassword(email: string): Promise<ContaOk> {
    const alvo = normalizarEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: alvo } });
    if (user && !user.deletedAt && !user.disabledAt) {
      const token = gerarTokenDeEmail();
      const agora = new Date();
      await this.prisma.$transaction([
        this.prisma.emailToken.updateMany({
          where: { userId: user.id, type: "RESET", usedAt: null },
          data: { usedAt: agora },
        }),
        this.prisma.emailToken.create({
          data: {
            userId: user.id,
            type: "RESET",
            email: alvo,
            tokenHash: hashDeToken(token),
            expiresAt: expiraEm("RESET", agora),
          },
        }),
      ]);
      await this.mail.enviar(
        this.mail.redefinicao(alvo, user.username, linkDeEmail("/reset-password", token)),
      );
    }
    return { ok: true };
  }

  /**
   * Troca a senha pelo token do link e **derruba todas as sessões**: quem pede a
   * redefinição normalmente perdeu o controle de alguma delas.
   */
  async resetPassword(token: string, senhaNova: string): Promise<ContaOk> {
    const linha = await this.prisma.emailToken.findUnique({
      where: { tokenHash: hashDeToken(token) },
    });
    if (!linha || linha.type !== "RESET" || linha.usedAt || linha.expiresAt < new Date()) {
      throw new BadRequestException("Link inválido ou expirado. Peça outro e-mail.");
    }

    const passwordHash = await argon2.hash(senhaNova);
    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.emailToken.update({ where: { id: linha.id }, data: { usedAt: agora } }),
      this.prisma.user.update({
        where: { id: linha.userId },
        // quem provou controlar o e-mail também destrancou a conta
        data: { passwordHash, failedLogins: 0, lockedUntil: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: linha.userId, revokedAt: null },
        data: { revokedAt: agora },
      }),
    ]);
    this.avisarSessoesEncerradas(linha.userId, { all: true, sessionIds: [], motivo: "senha" });

    const user = await this.prisma.user.findUnique({
      where: { id: linha.userId },
      select: { username: true, email: true },
    });
    if (user?.email) await this.mail.enviar(this.mail.senhaAlterada(user.email, user.username));
    return { ok: true };
  }

  // ── peças reutilizadas pelo AccountService ─────────────────

  /** Emite o par de tokens criando a linha de sessão do aparelho. */
  async issueTokens(
    sub: string,
    username: string,
    ctx: ContextoDeSessao,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<AuthTokens> {
    const jti = randomBytes(32).toString("hex");
    const agora = new Date();
    const sessao = await db.refreshToken.create({
      data: {
        userId: sub,
        tokenHash: this.hashJti(jti),
        expiresAt: this.expiracaoDoRefresh(agora),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        dispositivo: ctx.dispositivo,
      },
      select: { id: true },
    });
    return this.assinarPar(sub, username, jti, sessao.id);
  }

  /** Revoga sessões e avisa as abas atingidas. Devolve quantas caíram. */
  async revogarSessoes(
    userId: string,
    where: Prisma.RefreshTokenWhereInput,
    motivo: SessionsRevokedEvent["motivo"],
  ): Promise<number> {
    const alvos = await this.prisma.refreshToken.findMany({
      where: { ...where, userId, revokedAt: null },
      select: { id: true },
    });
    if (alvos.length === 0) return 0;
    const ids = alvos.map((s) => s.id);
    await this.prisma.refreshToken.updateMany({
      where: { id: { in: ids } },
      data: { revokedAt: new Date() },
    });
    this.avisarSessoesEncerradas(userId, { all: false, sessionIds: ids, motivo });
    return ids.length;
  }

  /** Confere a senha atual de uma operação sensível (trocar senha, excluir). */
  async conferirSenha(passwordHash: string, senha: string): Promise<void> {
    if (!(await argon2.verify(passwordHash, senha))) {
      throw new UnauthorizedException("Senha incorreta");
    }
  }

  /** Emite `account.updated` na sala do usuário, com a conta já atualizada. */
  async avisarContaAtualizada(userId: string): Promise<void> {
    const conta = await this.montarMinhaConta(userId);
    if (conta) this.realtime.emitToUser(userId, WS_EVENTS.ACCOUNT_UPDATED, { account: conta });
  }

  /** Emite `user.updated` para todo mundo (nomes aparecem em toda tela). */
  avisarUsuarioAtualizado(user: PublicUser): void {
    this.realtime.emitAll(WS_EVENTS.USER_UPDATED, user);
  }

  avisarSessoesEncerradas(userId: string, evento: SessionsRevokedEvent): void {
    this.realtime.emitToUser(userId, WS_EVENTS.SESSIONS_REVOKED, evento);
  }

  /**
   * `MinhaConta` do usuário — mora aqui (e não no `AccountService`) porque o
   * evento `account.updated` sai de operações dos dois serviços.
   */
  async montarMinhaConta(userId: string): Promise<MinhaConta | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        emailVerifiedAt: true,
        mfaEnabledAt: true,
        createdAt: true,
        _count: { select: { recoveryCodes: { where: { usedAt: null } } } },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      emailVerified: !!user.emailVerifiedAt,
      mfaEnabled: !!user.mfaEnabledAt,
      recoveryCodesLeft: user._count.recoveryCodes,
      createdAt: user.createdAt.toISOString(),
      // OAuth ficou fora do MVP: o modelo existe, nenhum provedor é vinculável
      linkedProviders: [],
    };
  }

  hashJti(jti: string): string {
    return createHash("sha256").update(jti).digest("hex");
  }

  /** Contexto do aparelho a partir da requisição HTTP. */
  contextoDe(req: {
    headers?: Record<string, unknown>;
    ip?: string;
    socket?: { remoteAddress?: string };
  }): ContextoDeSessao {
    const headers = req.headers ?? {};
    const userAgent = normalizarUserAgent(headers["user-agent"]);
    // o header chega em minúsculas no Node, qualquer que seja a caixa do cliente
    const cliente = normalizarCliente(headers[HEADER_CLIENTE.toLowerCase()]);
    return {
      userAgent,
      ip: normalizarIp(headers["x-forwarded-for"] ?? req.ip ?? req.socket?.remoteAddress),
      dispositivo: tipoDeDispositivoDaRequisicao(cliente, userAgent),
    };
  }

  // ── internos ───────────────────────────────────────────────

  private async assinarPar(
    sub: string,
    username: string,
    jti: string,
    sessionId: string,
  ): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      // `sid` = a linha de sessão; é o que deixa `GET /me/sessions` marcar a atual
      this.jwt.signAsync(
        { sub, username, sid: sessionId },
        { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? "15m" },
      ),
      this.jwt.signAsync(
        { sub, username, jti },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  /**
   * O ticket de 2FA é assinado com um segredo **derivado** do `JWT_SECRET`, e
   * não com ele: assinado com o mesmo segredo, o ticket passaria pelo `JwtGuard`
   * como se fosse um access token — o primeiro fator sozinho abriria a API.
   */
  private segredoDoTicket(): string {
    return createHash("sha256")
      .update(`${process.env.JWT_SECRET ?? ""}|mfa-ticket`)
      .digest("hex");
  }

  private assinarTicketMfa(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, typ: "mfa" },
      { secret: this.segredoDoTicket(), expiresIn: TICKET_MFA_EXPIRA },
    );
  }

  private async lerTicketMfa(ticket: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<TicketMfaPayload>(ticket, {
        secret: this.segredoDoTicket(),
      });
      if (payload.typ !== "mfa") throw new Error("tipo errado");
      return payload.sub;
    } catch {
      throw new UnauthorizedException("Desafio inválido ou expirado");
    }
  }

  private async revogarPorHash(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private expiracaoDoRefresh(agora: Date): Date {
    return new Date(agora.getTime() + duracaoEmMs(process.env.JWT_REFRESH_EXPIRES_IN ?? "7d"));
  }

  /** Mensagem do 409: o índice violado diz se foi o usuário ou o e-mail. */
  private jaEmUso(e: unknown): string {
    const alvo = (e as Prisma.PrismaClientKnownRequestError).meta?.target;
    const campos = Array.isArray(alvo) ? alvo.join(",") : String(alvo ?? "");
    return campos.includes("email") ? "E-mail já cadastrado" : "Nome de usuário já em uso";
  }
}

/** `"7d"`, `"15m"`, `"3600"` → milissegundos. Mesmo vocabulário do `jsonwebtoken`. */
export function duracaoEmMs(valor: string): number {
  const m = /^(\d+)\s*([smhdw])?$/i.exec(valor.trim());
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unidade = (m[2] ?? "s").toLowerCase();
  const fator =
    unidade === "s" ? 1000
    : unidade === "m" ? 60_000
    : unidade === "h" ? 3_600_000
    : unidade === "d" ? 86_400_000
    : 604_800_000;
  return n * fator;
}
