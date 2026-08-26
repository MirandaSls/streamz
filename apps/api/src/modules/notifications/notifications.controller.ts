import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { notificationSettingSchema, parseWsPayload } from "@streamz/shared";
import { NotificationsService } from "./notifications.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

/**
 * Preferências de notificação do próprio usuário.
 *
 * O corpo é validado pelo mesmo schema zod do contrato compartilhado (e não por
 * um DTO de class-validator paralelo) porque o cliente monta o payload a partir
 * dele — uma regra só, dos dois lados.
 */
@Controller("me")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @UseGuards(JwtGuard)
  @Get("notifications")
  list(@CurrentUser() user: JwtPayload) {
    return this.notifications.list(user.sub);
  }

  @UseGuards(JwtGuard)
  @Patch("notifications")
  update(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = parseWsPayload(notificationSettingSchema, body);
    if (!parsed.ok) throw new BadRequestException(parsed.message);
    return this.notifications.update(user.sub, parsed.data);
  }
}
