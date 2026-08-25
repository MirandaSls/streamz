import { BadRequestException, Injectable } from "@nestjs/common";
import {
  GLOBAL_NOTIFICATION_SCOPE,
  WS_EVENTS,
  channelNotificationScope,
  guildNotificationScope,
  type NotificationSetting,
  type NotificationSettingUpdate,
} from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";

/** Linha do Prisma que vira DTO (o enum do banco é o mesmo literal do shared). */
type Row = {
  scope: string;
  guildId: string | null;
  channelId: string | null;
  level: NotificationSetting["level"];
  muted: boolean;
  mutedUntil: Date | null;
};

function toDTO(row: Row): NotificationSetting {
  return {
    scope: row.scope,
    guildId: row.guildId,
    channelId: row.channelId,
    level: row.level,
    muted: row.muted,
    mutedUntil: row.mutedUntil ? row.mutedUntil.toISOString() : null,
  };
}

/**
 * Preferências de notificação por escopo (canal, servidor ou o padrão global).
 *
 * Guardar é tudo o que a API faz: quem decide notificar é o cliente, que tem o
 * contexto que o servidor não tem (janela visível, canal aberto, "não perturbe"
 * local). O contrato da decisão mora em `@newdisc/shared`
 * (`effectiveNotificationLevel` / `shouldNotifyMessage`), para os dois lados
 * responderem igual.
 *
 * Não autoriza por conta própria: canal passa por `assertCanViewChannel` e
 * servidor por `assertMember` — silenciar algo que não se enxerga não faz
 * sentido e vazaria a existência do id.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Todas as preferências do usuário (a global vem junto, se existir). */
  async list(userId: string): Promise<NotificationSetting[]> {
    const rows = await this.prisma.notificationSetting.findMany({ where: { userId } });
    return rows.map(toDTO);
  }

  /**
   * Cria ou atualiza a preferência do escopo informado. Campo ausente no corpo
   * fica como está — o menu do sino manda só o que mudou (nível *ou* silêncio).
   */
  async update(userId: string, input: NotificationSettingUpdate): Promise<NotificationSetting> {
    const scope = await this.resolveScope(userId, input);
    const mutedUntil = input.mutedUntil === undefined ? undefined : parseInstant(input.mutedUntil);

    const row = await this.prisma.notificationSetting.upsert({
      where: { userId_scope: { userId, scope } },
      create: {
        userId,
        scope,
        guildId: input.guildId ?? null,
        channelId: input.channelId ?? null,
        level: input.level ?? "ALL",
        muted: input.muted ?? false,
        mutedUntil: mutedUntil ?? null,
      },
      update: {
        ...(input.level !== undefined ? { level: input.level } : {}),
        ...(input.muted !== undefined ? { muted: input.muted } : {}),
        ...(mutedUntil !== undefined ? { mutedUntil } : {}),
      },
    });

    const dto = toDTO(row);
    // as outras abas/dispositivos do mesmo usuário refletem na hora
    this.realtime.emitToUser(userId, WS_EVENTS.NOTIFICATION_UPDATED, dto);
    return dto;
  }

  /** Escopo canônico do corpo, já autorizado. */
  private async resolveScope(userId: string, input: NotificationSettingUpdate): Promise<string> {
    if (input.channelId) {
      await this.guilds.assertCanViewChannel(userId, input.channelId);
      return channelNotificationScope(input.channelId);
    }
    if (input.guildId) {
      await this.guilds.assertMember(userId, input.guildId);
      return guildNotificationScope(input.guildId);
    }
    return GLOBAL_NOTIFICATION_SCOPE;
  }
}

/** ISO → Date; null limpa a expiração ("até eu reativar"). */
function parseInstant(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("mutedUntil inválido");
  return date;
}
