import { Injectable, Logger } from "@nestjs/common";
import type {
  AuditAction,
  AuditLogChange,
  AuditLogEntry,
  AuditLogPage,
  AuditTargetType,
} from "@newdisc/shared";
import { AUDIT_PAGE_SIZE, MAX_MODERATION_REASON } from "@newdisc/shared";
import { toPublicUser, type PublicUserRow } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";

/** O que um ponto de moderação informa ao registrar uma ação. */
export interface AuditEntryInput {
  guildId: string;
  /** quem agiu; null para ação do próprio sistema. */
  actorId: string | null;
  action: AuditAction;
  targetId?: string | null;
  targetType?: AuditTargetType | null;
  /** nome legível do alvo — guardado porque o alvo pode deixar de existir. */
  targetName?: string | null;
  changes?: AuditLogChange[];
  reason?: string | null;
}

export interface AuditFilters {
  /** só ações deste moderador. */
  actorId?: string;
  action?: AuditAction;
  /** id do último registro da página anterior. */
  cursor?: string;
}

/**
 * Registro de auditoria do servidor.
 *
 * O serviço é deliberadamente **magro e sem dependências** além do Prisma: ele
 * é chamado de dentro de kick, ban, criação de canal, revogação de convite — de
 * módulos que já dependem de `GuildsService`. Se ele próprio dependesse de
 * `GuildsService` (para checar permissão), o grafo de módulos ficaria circular.
 * Quem chama `list()` é que faz o `assertCanModerate`.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra uma ação. **Nunca lança**: auditoria é efeito colateral do ato de
   * moderar, e falhar em escrever a linha não pode desfazer (nem impedir) o
   * banimento que já aconteceu. O erro vai para o log do servidor.
   */
  async log(entry: AuditEntryInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          guildId: entry.guildId,
          actorId: entry.actorId,
          action: entry.action,
          targetId: entry.targetId ?? null,
          targetType: entry.targetType ?? null,
          targetName: entry.targetName ?? null,
          changes: (entry.changes ?? []) as object[],
          reason: entry.reason?.slice(0, MAX_MODERATION_REASON) || null,
        },
      });
    } catch (e) {
      this.logger.error(
        `Falha ao registrar auditoria (${entry.action} em ${entry.guildId})`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  /**
   * Página do registro, mais recentes primeiro. A permissão é responsabilidade
   * de quem chama (`GuildsService.assertCanModerate`).
   */
  async list(guildId: string, filters: AuditFilters = {}): Promise<AuditLogPage> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        guildId,
        ...(filters.actorId ? { actorId: filters.actorId } : {}),
        ...(filters.action ? { action: filters.action } : {}),
      },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      // pede um a mais para saber se existe página seguinte sem um count()
      take: AUDIT_PAGE_SIZE + 1,
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    });
    const page = rows.slice(0, AUDIT_PAGE_SIZE);
    return {
      entries: page.map((r) => this.toDTO(r)),
      nextCursor: rows.length > AUDIT_PAGE_SIZE ? page[page.length - 1].id : null,
    };
  }

  private toDTO(row: {
    id: string;
    guildId: string;
    action: AuditAction;
    targetId: string | null;
    targetType: AuditTargetType | null;
    targetName: string | null;
    changes: unknown;
    reason: string | null;
    createdAt: Date;
    actor: PublicUserRow | null;
  }): AuditLogEntry {
    return {
      id: row.id,
      guildId: row.guildId,
      actor: row.actor ? toPublicUser(row.actor) : null,
      action: row.action,
      targetId: row.targetId,
      targetType: row.targetType,
      targetName: row.targetName,
      // a coluna é Json: só confiamos nela se for mesmo uma lista
      changes: Array.isArray(row.changes) ? (row.changes as AuditLogChange[]) : [],
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
