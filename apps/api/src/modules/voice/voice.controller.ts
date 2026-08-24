import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { VoiceService } from "./voice.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

@UseGuards(JwtGuard)
@Controller("voice")
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** Devolve um token do LiveKit para entrar no canal de voz. */
  @Post("channels/:channelId/token")
  token(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
  ) {
    return this.voice.createToken(channelId, user.sub, user.username);
  }
}
