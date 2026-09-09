import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

/** Refresh token revogado/expirado só serve para auditoria de curto prazo. */
const RETENCAO_REFRESH_TOKEN_DIAS = 30;
/**
 * Anexo sem mensagem é upload que o usuário abandonou (fechou o composer,
 * perdeu a conexão). 24h é folga suficiente para um envio lento; abaixo disso
 * correríamos o risco de apagar um anexo de rascunho ainda em uso.
 */
const RETENCAO_ANEXO_ORFAO_HORAS = 24;
/**
 * Token de e-mail usado/expirado não autentica mais nada. 7 dias é folga para
 * investigar "cliquei no link e não funcionou" antes de a linha sumir.
 */
const RETENCAO_TOKEN_EMAIL_DIAS = 7;
/** Apagar em lotes evita segurar uma transação longa sobre a tabela inteira. */
const TAMANHO_DO_LOTE = 200;

/**
 * Faxina periódica do banco — equivalente ao "Crond" do stoatchat/Revolt.
 *
 * Roda **por processo**: com mais de uma instância da API os jobs se repetem.
 * É inofensivo (as duas rodadas apagam o mesmo conjunto, e a segunda não acha
 * nada), mas se um dia houver várias instâncias vale um lock no banco.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async faxinaDiaria(): Promise<void> {
    const agora = new Date();
    const tokens = await this.limparRefreshTokens(agora);
    const emails = await this.limparTokensDeEmail(agora);
    const anexos = await this.limparAnexosOrfaos(agora);
    const status = await this.limparStatusPersonalizados(agora);
    const efemeras = await this.limparEfemerasVencidas(agora);
    if (tokens || emails || anexos || status || efemeras) {
      this.logger.log(
        `Faxina: ${tokens} refresh token(s), ${emails} token(s) de e-mail, ` +
          `${anexos} anexo(s) órfão(s), ${status} status personalizado(s) vencido(s) e ` +
          `${efemeras} mensagem(ns) efêmera(s) vencida(s) removidos`,
      );
    }
  }

  // ── j-bots ──
  /**
   * Apaga as mensagens efêmeras vencidas (`expiresAt` = criação + 15 min, a
   * mesma janela do token da interação).
   *
   * Não é só higiene de tabela como o status personalizado: a linha guarda
   * **texto que uma pessoa só podia ver**. Passados os 15 minutos ela não serve
   * mais para nada — o `@original` já leva 404 `10062` — e o certo é não
   * continuar guardando.
   */
  async limparEfemerasVencidas(agora: Date): Promise<number> {
    const { count } = await this.prisma.ephemeralMessage.deleteMany({
      where: { expiresAt: { lt: agora } },
    });
    return count;
  }

  // ── d-social ──
  /**
   * Zera os status personalizados vencidos. A leitura já trata vencido como
   * ausente (`toPublicUser`), então isto é higiene da tabela — não correção.
   */
  async limparStatusPersonalizados(agora: Date): Promise<number> {
    const { count } = await this.prisma.user.updateMany({
      where: { customStatusExpiresAt: { lt: agora } },
      data: { customStatusText: null, customStatusEmoji: null, customStatusExpiresAt: null },
    });
    return count;
  }

  /**
   * Remove refresh tokens que já não autenticam ninguém (revogados pela rotação
   * ou vencidos) e cujo prazo de retenção passou.
   */
  async limparRefreshTokens(agora: Date): Promise<number> {
    const corte = subtrairDias(agora, RETENCAO_REFRESH_TOKEN_DIAS);
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ revokedAt: { lt: corte } }, { expiresAt: { lt: corte } }] },
    });
    return count;
  }

  /**
   * Remove tokens de verificação/redefinição já usados ou vencidos há tempo
   * suficiente. Sem isto a tabela só cresce: cada "reenviar e-mail" deixa uma
   * linha para trás.
   */
  async limparTokensDeEmail(agora: Date): Promise<number> {
    const corte = subtrairDias(agora, RETENCAO_TOKEN_EMAIL_DIAS);
    const { count } = await this.prisma.emailToken.deleteMany({
      where: { OR: [{ usedAt: { lt: corte } }, { expiresAt: { lt: corte } }] },
    });
    return count;
  }

  /**
   * Remove anexos que nunca foram vinculados a uma mensagem — no bucket e no
   * banco. Se o R2 não estiver configurado não há upload nenhum para limpar,
   * e apagar a linha sem poder apagar o objeto só criaria lixo invisível.
   */
  async limparAnexosOrfaos(agora: Date): Promise<number> {
    if (!this.storage.isConfigured()) return 0;

    const corte = subtrairHoras(agora, RETENCAO_ANEXO_ORFAO_HORAS);
    let removidos = 0;

    // Em lotes, sempre relendo o topo da fila: as linhas do lote anterior já
    // saíram, então o `findMany` seguinte devolve as próximas.
    for (;;) {
      const lote = await this.prisma.attachment.findMany({
        where: { messageId: null, createdAt: { lt: corte } },
        select: { id: true, key: true },
        take: TAMANHO_DO_LOTE,
      });
      if (lote.length === 0) break;

      for (const anexo of lote) {
        // `storage.delete` já loga e engole o erro: um objeto que resiste não
        // pode travar a faxina, e a chave fica no log para limpeza manual.
        await this.storage.delete(anexo.key);
      }
      const { count } = await this.prisma.attachment.deleteMany({
        where: { id: { in: lote.map((a) => a.id) } },
      });
      removidos += count;

      if (lote.length < TAMANHO_DO_LOTE) break;
    }

    return removidos;
  }
}

function subtrairDias(data: Date, dias: number): Date {
  return new Date(data.getTime() - dias * 24 * 60 * 60 * 1000);
}

function subtrairHoras(data: Date, horas: number): Date {
  return new Date(data.getTime() - horas * 60 * 60 * 1000);
}
