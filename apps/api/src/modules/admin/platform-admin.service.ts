import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ehAdminDaInstancia, parseAdminEmails } from "./admins";

/**
 * Quem é administrador **da instância**.
 *
 * A lista sai do ambiente (`PLATFORM_ADMIN_EMAILS`, e-mails separados por
 * vírgula) e **não** do banco, de propósito. Papel de instância é a única
 * autorização do projeto que ninguém pode ganhar por dentro do app: não há rota
 * que promova, então não há rota que possa ser abusada para promover. Trocar
 * quem manda é editar o `.env` e reiniciar a API — visível no deploy, revogável
 * na hora, e imune a qualquer escrita no banco.
 *
 * É por isso, também, que o casamento exige **e-mail verificado**: excluir uma
 * conta libera o e-mail (`AccountService.excluir` grava `email: null`), e sem
 * essa condição bastaria registrar uma conta nova com o endereço do admin para
 * herdar o painel. A verificação fecha essa porta — quem entra na lista precisa
 * provar que a caixa é dele.
 *
 * Sem a variável, `configurado()` é `false` e o painel simplesmente não existe
 * para ninguém — o mesmo desenho do LiveKit e do R2 (ver PENDENCIAS.md).
 *
 * A regra em si mora em `admins.ts`, sem Nest nem Prisma, para ser testada
 * direto — este service só lê o ambiente e o banco e a alimenta.
 */
@Injectable()
export class PlatformAdminService implements OnModuleInit {
  private readonly logger = new Logger(PlatformAdminService.name);

  /** Cache curto por conta, como o `AccountStatusService`: e-mail muda pouco. */
  private readonly cache = new Map<string, { admin: boolean; ate: number }>();
  private static readonly TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  /** No boot, diz alto quem manda — um painel invisível por erro de digitação
   *  no `.env` é o tipo de problema que ninguém descobre até precisar dele. */
  async onModuleInit() {
    const emails = this.emails();
    if (emails.length === 0) {
      this.logger.log("PLATFORM_ADMIN_EMAILS vazio: painel do administrador desligado");
      return;
    }
    const contas = await this.prisma.user.findMany({
      // `OR` de `equals` insensível, e não `in`: o e-mail é gravado como a
      // pessoa digitou, e `in` compara byte a byte
      where: {
        OR: emails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
        deletedAt: null,
      },
      select: { username: true, email: true, emailVerifiedAt: true },
    });
    for (const email of emails) {
      const conta = contas.find((c) => c.email?.toLowerCase() === email);
      if (!conta) {
        this.logger.warn(`Admin ${email}: nenhuma conta com esse e-mail (ainda)`);
      } else if (!conta.emailVerifiedAt) {
        this.logger.warn(
          `Admin ${email} (@${conta.username}): e-mail não verificado — o painel só abre depois da verificação`,
        );
      } else {
        this.logger.log(`Admin da instância: @${conta.username} <${email}>`);
      }
    }
  }

  /** true quando há ao menos um e-mail configurado. */
  configurado(): boolean {
    return this.emails().length > 0;
  }

  /** Os e-mails da variável, minúsculos e sem espaços; `[]` quando não há nenhum. */
  emails(): string[] {
    return parseAdminEmails(process.env.PLATFORM_ADMIN_EMAILS);
  }

  /**
   * true se este e-mail é de admin — o que marca a etiqueta na listagem de
   * contas. Não inclui desativada/excluída: a listagem quer dizer "esta é a
   * conta do administrador", e a decisão de deixar entrar é a de `ehAdmin`.
   */
  ehEmailDeAdmin(email: string | null | undefined, verificado: boolean): boolean {
    return ehAdminDaInstancia(this.emails(), {
      email: email ?? null,
      emailVerificado: verificado,
      desativada: false,
      excluida: false,
    });
  }

  /** true se esta conta é admin da instância agora. */
  async ehAdmin(userId: string): Promise<boolean> {
    if (!this.configurado()) return false;

    const agora = Date.now();
    const cacheado = this.cache.get(userId);
    if (cacheado && cacheado.ate > agora) return cacheado.admin;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true, deletedAt: true, disabledAt: true },
    });
    const admin = ehAdminDaInstancia(
      this.emails(),
      user && {
        email: user.email,
        emailVerificado: !!user.emailVerifiedAt,
        desativada: !!user.disabledAt,
        excluida: !!user.deletedAt,
      },
    );

    this.cache.set(userId, { admin, ate: agora + PlatformAdminService.TTL_MS });
    return admin;
  }

  /** Esquece o que sabia de uma conta — trocar de e-mail vale na hora. */
  invalidar(userId: string) {
    this.cache.delete(userId);
  }
}
