import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AttachmentsService } from "./attachments.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

/**
 * Galeria de mídia do canal (aba "Mídia" do painel lateral). Fica num
 * controller próprio, e não no de mensagens, para o domínio de mídia não se
 * espalhar — o prefixo `channels/:id` é o mesmo, o Nest resolve as duas rotas.
 */
@UseGuards(JwtGuard)
@Controller("channels")
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get(":channelId/attachments")
  list(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
    @Query("type") type?: string,
  ) {
    return this.attachments.listForChannel(
      user.sub,
      channelId,
      type === "image" ? "image" : "all",
    );
  }
}
