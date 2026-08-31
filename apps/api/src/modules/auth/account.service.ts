import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { toDataURL } from "qrcode";
import {
  NOME_USUARIO_EXCLUIDO,
  USUARIO_EXCLUIDO_PREFIXO,
  normalizarEmail,
} from "@streamz/shared";
import type {
  ContaEncerrada,
  ContaOk,
  MfaAtivado,
  MfaSetup,
  MinhaConta,
  SessaoView,
} from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { isUniqueViolation } from "../../common/prisma-errors";
import { toPublicUser } from "../../common/dto";
import { MailService } from "../mail/mail.service";
import { StorageService } from "../storage/storage.service";
import { AccountStatusService } from "./account-status.service";
import { AuthService } from "./auth.service";
import { gerarCodigosDeRecuperacao, hashDeCodigo } from "./recovery-codes";
import { gerarSegredoTotp, otpauthUrl, validarCodigoTotp } from "./totp";
import { toSessaoView } from "./sessions";

/** Emissor mostrado pelo app autenticador ao lado do código. */
const EMISSOR_TOTP = "Streamz";

/**
 * Tudo o que o dono da conta faz com ela: ver, listar sessões, trocar senha e
 * e-mail, ligar/desligar 2FA, desativar e excluir.
 *
 * Fica ao lado do `AuthService` (mesmo módulo) porque divide com ele as peças
 * que ninguém mais deveria tocar — emissão de token, revogação de sessão,
 * conferência de senha e o DTO de `MinhaConta`.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly contas: AccountStatusService,
  ) {}

  // ── leitura ────────────────────────────────────────────────

  async minhaConta(userId: string): Promise<MinhaConta> {
    const conta = await this.auth.montarMinhaConta(userId);
    if (!conta) throw new NotFoundException("Conta não encontrada");
    return conta;
  }

  // ── sessões ────────────────────────────────────────────────

  /** Sessões vivas, da mais recente para a mais antiga; a atual vem marcada. */
  async listarSessoes(userId: string, sessaoAtual: string | null): Promise<SessaoView[]> {
    const linhas = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
    return linhas.map((l) => toSessaoView(l, sessaoAtual));
  }

  /** Encerra uma sessão do próprio usuário (404 quando não é dele). */
  async encerrarSessao(userId: string, sessionId: string): Promise<ContaOk> {
    const quantas = await this.auth.revogarSessoes(userId, { id: sessionId }, "logout");
    if (quantas === 0) throw new NotFoundException("Sessão não encontrada");
    return { ok: true };
  }

  /** Encerra todas menos a atual — o "sair dos outros aparelhos" do Discord. */
  async encerrarOutrasSessoes(userId: string, sessaoAtual: string | null): Promise<ContaOk> {
    await this.auth.revogarSessoes(
      userId,
      sessaoAtual ? { id: { not: sessaoAtual } } : {},
      "logout",
    );
    return { ok: true };
  }

  // ── senha e e-mail ─────────────────────────────────────────

  /**
   * Troca a senha. Derruba as **outras** sessões: quem trocou a senha continua
   * onde está, e quem tinha a senha antiga em outro aparelho não continua.
   */
  async alterarSenha(
    userId: string,
    atual: string,
    nova: string,
    sessaoAtual: string | null,
  ): Promise<ContaOk> {
    const user = await this.exigirUsuario(userId);
    await this.auth.conferirSenha(user.passwordHash, atual);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(nova), failedLogins: 0, lockedUntil: null },
    });
    await this.auth.revogarSessoes(
      userId,
      sessaoAtual ? { id: { not: sessaoAtual } } : {},
      "senha",
    );
    if (user.email) await this.mail.enviar(this.mail.senhaAlterada(user.email, user.username));
    return { ok: true };
  }

  /** Troca o e-mail: volta a ficar não verificado e um link novo é enviado. */
  async alterarEmail(userId: string, email: string, senha: string): Promise<MinhaConta> {
    this.mail.exigirEntrega();
    const user = await this.exigirUsuario(userId);
    await this.auth.conferirSenha(user.passwordHash, senha);

    const alvo = normalizarEmail(email);
    if (alvo === user.email) throw new BadRequestException("Este já é o e-mail da conta.");

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { email: alvo, emailVerifiedAt: null },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException("E-mail já cadastrado");
      throw e;
    }
    await this.auth.enviarVerificacao(userId, user.username, alvo);
    const conta = await this.minhaConta(userId);
    await this.auth.avisarContaAtualizada(userId);
    return conta;
  }

  /** Reenvia a verificação para quem já está autenticado. */
  async reenviarVerificacao(userId: string): Promise<ContaOk> {
    this.mail.exigirEntrega();
    const user = await this.exigirUsuario(userId);
    if (!user.email) throw new BadRequestException("Sua conta não tem e-mail cadastrado.");
    if (user.emailVerifiedAt) throw new BadRequestException("Seu e-mail já está verificado.");
    // Rota autenticada e explícita: aqui `{ok:true}` sem entrega é mentira, e a
    // pessoa fica clicando "reenviar" para sempre. Diferente da rota pública de
    // reenvio, que responde 200 sempre para não revelar quem tem conta.
    await this.auth.enviarVerificacao(userId, user.username, user.email, {
      propagarFalha: true,
    });
    return { ok: true };
  }

  // ── 2FA (TOTP) ─────────────────────────────────────────────

  /**
   * Passo 1: gera o segredo e o QR. O segredo é gravado **desativado** — só
   * vira 2FA quando `enable` confirma que o app já lê o código, senão daria
   * para trancar a própria conta com um segredo que nunca foi escaneado.
   */
  async mfaSetup(userId: string): Promise<MfaSetup> {
    const user = await this.exigirUsuario(userId);
    if (user.mfaEnabledAt) {
      throw new ConflictException("A verificação em duas etapas já está ativa.");
    }
    const secret = gerarSegredoTotp();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });

    const url = otpauthUrl(EMISSOR_TOTP, user.email ?? user.username, secret);
    return {
      secret,
      otpauthUrl: url,
      // o QR é gerado aqui, e não na web: o segredo não precisa passar por mais
      // nenhuma biblioteca de terceiros do lado do cliente
      qrDataUrl: await toDataURL(url, { margin: 1, width: 200 }),
    };
  }

  /** Passo 2: confirma o código e entrega os códigos de recuperação (uma vez). */
  async mfaEnable(userId: string, codigo: string): Promise<MfaAtivado> {
    const user = await this.exigirUsuario(userId);
    if (user.mfaEnabledAt) {
      throw new ConflictException("A verificação em duas etapas já está ativa.");
    }
    if (!user.mfaSecret) {
      throw new BadRequestException("Comece pelo QR: peça o segredo antes de confirmar.");
    }
    if (!validarCodigoTotp(user.mfaSecret, codigo)) {
      throw new BadRequestException("Código incorreto. Confira o app autenticador.");
    }

    const codigos = gerarCodigosDeRecuperacao();
    await this.prisma.$transaction([
      // uma ativação nova invalida os códigos da anterior
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: codigos.map((codigo) => ({ userId, codeHash: hashDeCodigo(codigo) })),
      }),
      this.prisma.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } }),
    ]);
    await this.auth.avisarContaAtualizada(userId);
    return { recoveryCodes: codigos };
  }

  /** Desligar pede senha **e** código: só ter a aba aberta não basta. */
  async mfaDisable(userId: string, senha: string, codigo: string): Promise<ContaOk> {
    const user = await this.exigirUsuario(userId);
    if (!user.mfaEnabledAt || !user.mfaSecret) {
      throw new BadRequestException("A verificação em duas etapas não está ativa.");
    }
    await this.auth.conferirSenha(user.passwordHash, senha);
    await this.auth.consumirCodigoMfa(userId, user.mfaSecret, codigo);

    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaSecret: null, mfaEnabledAt: null },
      }),
    ]);
    await this.auth.avisarContaAtualizada(userId);
    return { ok: true };
  }

  /** Gera um conjunto novo de códigos (os antigos deixam de valer). */
  async mfaRegerarCodigos(userId: string, senha: string): Promise<MfaAtivado> {
    const user = await this.exigirUsuario(userId);
    if (!user.mfaEnabledAt) {
      throw new BadRequestException("A verificação em duas etapas não está ativa.");
    }
    await this.auth.conferirSenha(user.passwordHash, senha);

    const codigos = gerarCodigosDeRecuperacao();
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: codigos.map((codigo) => ({ userId, codeHash: hashDeCodigo(codigo) })),
      }),
    ]);
    await this.auth.avisarContaAtualizada(userId);
    return { recoveryCodes: codigos };
  }

  // ── fim de vida da conta ───────────────────────────────────

  /**
   * Desativa: some da lista, cai de todas as sessões e **volta ao entrar de
   * novo**. Nada é apagado — é o passo reversível antes da exclusão.
   */
  async desativar(userId: string, senha: string): Promise<ContaEncerrada> {
    const user = await this.exigirUsuario(userId);
    await this.auth.conferirSenha(user.passwordHash, senha);

    await this.prisma.user.update({
      where: { id: userId },
      data: { disabledAt: new Date(), status: "OFFLINE", manualStatus: null },
    });
    this.contas.invalidar(userId);
    await this.auth.revogarSessoes(userId, {}, "conta");
    this.auth.avisarSessoesEncerradas(userId, { all: true, sessionIds: [], motivo: "conta" });
    return { outcome: "disabled" };
  }

  /**
   * Exclui (soft delete): a conta é anonimizada e não volta. As mensagens ficam,
   * como no Discord — apagá-las abriria buracos nas conversas de terceiros.
   *
   * O que sai: e-mail, avatar, 2FA, tokens, participações em
   * servidores e conversas. O que fica: a linha `User` anonimizada, para as
   * mensagens antigas continuarem tendo autor.
   */
  async excluir(userId: string, senha: string, codigo?: string): Promise<ContaEncerrada> {
    const user = await this.exigirUsuario(userId);
    await this.auth.conferirSenha(user.passwordHash, senha);
    if (user.mfaEnabledAt && user.mfaSecret) {
      if (!codigo) throw new BadRequestException("Informe o código da verificação em duas etapas.");
      await this.auth.consumirCodigoMfa(userId, user.mfaSecret, codigo);
    }

    await this.resolverServidoresDoDono(userId);

    const agora = new Date();
    const anonimo = `${USUARIO_EXCLUIDO_PREFIXO}${randomBytes(6).toString("hex")}`;
    const [atualizado] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          username: anonimo,
          displayName: NOME_USUARIO_EXCLUIDO,
          email: null,
          emailVerifiedAt: null,
          avatarKey: null,
          avatarUrl: null,
          mfaSecret: null,
          mfaEnabledAt: null,
          failedLogins: 0,
          lockedUntil: null,
          disabledAt: null,
          deletedAt: agora,
          status: "OFFLINE",
          manualStatus: null,
          // ninguém entra numa conta excluída: o hash deixa de casar com senha alguma
          passwordHash: `excluida:${randomBytes(32).toString("hex")}`,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: agora },
      }),
      this.prisma.emailToken.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.oAuthAccount.deleteMany({ where: { userId } }),
      this.prisma.guildMember.deleteMany({ where: { userId } }),
      this.prisma.channelMember.deleteMany({ where: { userId } }),
    ]);

    if (user.avatarKey) await this.storage.delete(user.avatarKey);
    this.contas.invalidar(userId);
    this.auth.avisarSessoesEncerradas(userId, { all: true, sessionIds: [], motivo: "conta" });
    // o nome anonimizado precisa chegar às telas de quem conversou com ele
    this.auth.avisarUsuarioAtualizado(toPublicUser(atualizado));
    this.logger.log(`Conta ${userId} excluída (anonimizada como ${anonimo})`);
    return { outcome: "deleted" };
  }

  // ── internos ───────────────────────────────────────────────

  /**
   * Um servidor não pode ficar sem dono. Ao excluir a conta, cada servidor dela
   * passa para o membro mais antigo que sobra (ADMIN antes de MEMBER); sem mais
   * ninguém, o servidor é apagado junto.
   *
   * A alternativa — recusar a exclusão até o dono transferir na mão — travaria a
   * conta para sempre, porque o MVP não tem tela de transferir propriedade.
   */
  private async resolverServidoresDoDono(userId: string): Promise<void> {
    const servidores = await this.prisma.guild.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    for (const servidor of servidores) {
      const sucessor = await this.prisma.guildMember.findFirst({
        where: { guildId: servidor.id, userId: { not: userId } },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      });
      if (!sucessor) {
        await this.prisma.guild.delete({ where: { id: servidor.id } });
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.guild.update({
          where: { id: servidor.id },
          data: { ownerId: sucessor.userId },
        }),
        this.prisma.guildMember.update({
          where: { id: sucessor.id },
          data: { role: "OWNER" },
        }),
      ]);
      this.logger.log(`Servidor ${servidor.id} transferido para ${sucessor.userId}`);
    }
  }

  private async exigirUsuario(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException("Conta não encontrada");
    return user;
  }
}
