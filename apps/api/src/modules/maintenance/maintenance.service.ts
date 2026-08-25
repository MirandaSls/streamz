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
    const anexos = await this.limparAnexosOrfaos(agora);
    if (tokens || anexos) {
      this.logger.log(`Faxina: ${tokens} refresh token(s) e ${anexos} anexo(s) órfão(s) removidos`);
    }
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
