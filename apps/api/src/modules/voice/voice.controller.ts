import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { VoiceService } from "./voice.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

@UseGuards(JwtGuard)
@Controller()
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** Devolve um token do LiveKit para entrar no canal de voz. */
  @Post("voice/channels/:channelId/token")
  token(@CurrentUser() user: JwtPayload, @Param("channelId") channelId: string) {
    return this.voice.createToken(channelId, user.sub, user.username);
  }

  /**
   * Estado inicial de voz do servidor: quem está em qual canal de voz agora.
   * Depois disso o cliente se mantém pelos eventos `voice.state` do gateway.
   */
  @Get("guilds/:guildId/voice-states")
  states(@CurrentUser() user: JwtPayload, @Param("guildId") guildId: string) {
    return this.voice.statesForGuild(user.sub, guildId);
  }
}
