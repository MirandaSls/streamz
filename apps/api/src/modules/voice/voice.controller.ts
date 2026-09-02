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
   * Token do participante de tela (`<userId>#tela`) do app de desktop, para
   * canal de voz **ou** conversa direta — a captura nativa publica por uma
   * conexão própria e precisa de credencial própria. Ver
   * `VoiceService.createScreenToken`.
   */
  @Post("voice/channels/:channelId/tela-token")
  telaToken(@CurrentUser() user: JwtPayload, @Param("channelId") channelId: string) {
    return this.voice.createScreenToken(channelId, user.sub, user.username);
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
