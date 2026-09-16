import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  AUDIT_ACTIONS,
  MAX_APELIDO_NO_SERVIDOR,
  MAX_BULK_DELETE,
  MAX_MODERATION_REASON,
  MAX_REPORT_DETAILS,
  MAX_TIMEOUT_MINUTES,
  REPORT_REASONS,
} from "@streamz/shared";
import { Permission } from "@streamz/shared";
import type { AuditAction, ReportReason } from "@streamz/shared";
import { ModerationService } from "./moderation.service";
import { AuditService } from "../audit/audit.service";
import { GuildsService } from "../guilds/guilds.service";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";

const REPORT_REASON_VALUES = REPORT_REASONS.map((r) => r.value);

class ReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MODERATION_REASON)
  reason?: string;
}

class TimeoutDto extends ReasonDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_TIMEOUT_MINUTES)
  minutes?: number;

  /** alternativa aos presets: data explícita de fim. */
  @IsOptional()
  @IsISO8601()
  until?: string;
}

class BanDto extends ReasonDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 7)
  deleteMessageHours?: number;
}

class BulkDeleteDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}

class DeleteAfterDto {
  @IsString()
  messageId!: string;
}

class ReportDto {
  @IsIn(REPORT_REASON_VALUES)
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_REPORT_DETAILS)
  details?: string;
}

class ResolveDto {
  @IsBoolean()
  resolved!: boolean;
}

export class NicknameDto {
  /** `null` (ou ausente) apaga o apelido; `normalizarApelido` ainda apara espaço. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_APELIDO_NO_SERVIDOR)
  apelido?: string | null;
}

/**
 * Rotas de moderação: castigo, expulsão/banimento com contexto, remoção de
 * mensagens em lote, denúncias e a leitura do registro de auditoria.
 *
 * O registro de auditoria é lido daqui, e não de um `AuditModule` com
 * controller próprio, para que o `AuditService` continue sem depender do
 * `GuildsService` — quem autoriza a leitura é este controller.
 */
@UseGuards(JwtGuard)
@Controller()
export class ModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly audit: AuditService,
    private readonly guilds: GuildsService,
  ) {}

  // ── registro de auditoria ──────────────────────────────────

  @Get("guilds/:guildId/audit-log")
  async auditLog(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Query("action") action?: string,
    @Query("userId") userId?: string,
    @Query("cursor") cursor?: string,
  ) {
    await this.guilds.assertCanModerate(user.sub, guildId, Permission.MANAGE_GUILD);
    return this.audit.list(guildId, {
      // filtro vindo da query: só aceita ação conhecida, o resto é ignorado
      action: action && AUDIT_ACTIONS.includes(action as AuditAction) ? (action as AuditAction) : undefined,
      actorId: userId || undefined,
      cursor: cursor || undefined,
    });
  }

  // ── castigo ────────────────────────────────────────────────

  @Post("guilds/:guildId/members/:userId/timeout")
  timeout(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("userId") userId: string,
    @Body() dto: TimeoutDto,
  ) {
    return this.moderation.timeout(user.sub, guildId, userId, dto);
  }

  @Delete("guilds/:guildId/members/:userId/timeout")
  removeTimeout(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("userId") userId: string,
  ) {
    return this.moderation.removeTimeout(user.sub, guildId, userId);
  }

  // ── expulsão e banimento com contexto ──────────────────────

  @Post("guilds/:guildId/members/:userId/kick")
  kick(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("userId") userId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.moderation.kick(user.sub, guildId, userId, dto);
  }

  @Post("guilds/:guildId/members/:userId/ban")
  ban(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("userId") userId: string,
    @Body() dto: BanDto,
  ) {
    return this.moderation.ban(user.sub, guildId, userId, dto);
  }

  /**
   * Apelido de **outro** membro (como no Discord). Para o próprio, a regra
   * continua sendo `PATCH /guilds/:guildId/membership` (qualquer membro pode).
   */
  @Patch("guilds/:guildId/members/:userId/nickname")
  setNickname(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("userId") userId: string,
    @Body() dto: NicknameDto,
  ) {
    return this.moderation.alterarApelidoDeMembro(user.sub, guildId, userId, dto.apelido ?? null);
  }

  // ── mensagens em lote ──────────────────────────────────────

  @Delete("channels/:channelId/messages")
  bulkDelete(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Body() dto: BulkDeleteDto,
  ) {
    return this.moderation.bulkDelete(user.sub, channelId, dto.ids.slice(0, MAX_BULK_DELETE));
  }

  @Post("channels/:channelId/messages/delete-after")
  deleteAfter(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Body() dto: DeleteAfterDto,
  ) {
    return this.moderation.deleteAfter(user.sub, channelId, dto.messageId);
  }

  // ── denúncias ──────────────────────────────────────────────

  @Post("messages/:messageId/report")
  report(
    @CurrentUser() user: JwtPayload,
    @Param("messageId") messageId: string,
    @Body() dto: ReportDto,
  ) {
    return this.moderation.report(user.sub, messageId, dto.reason, dto.details);
  }

  @Get("guilds/:guildId/reports")
  reports(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Query("resolved") resolved?: string,
  ) {
    return this.moderation.listReports(user.sub, guildId, resolved === "true");
  }

  @Patch("guilds/:guildId/reports/:reportId")
  resolveReport(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Param("reportId") reportId: string,
    @Body() dto: ResolveDto,
  ) {
    return this.moderation.resolveReport(user.sub, guildId, reportId, dto.resolved);
  }
}
