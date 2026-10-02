import { Controller, Get, Param } from "@nestjs/common";
import { WidgetService } from "./widget.service";
import { WIDGET_THROTTLE } from "../../common/throttle";

/** Sem JwtGuard de propósito: é o widget público embutível em sites. */
@Controller()
export class WidgetController {
  constructor(private readonly widget: WidgetService) {}

  @WIDGET_THROTTLE
  @Get("guilds/:guildId/widget.json")
  obter(@Param("guildId") guildId: string) {
    return this.widget.obter(guildId);
  }
}
