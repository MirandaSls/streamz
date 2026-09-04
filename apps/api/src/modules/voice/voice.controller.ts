import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { VoiceService } from "./voice.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

/** Corpo de `POST /guilds/:id/voice/move` (contrato `VoiceMoveInput`). */
class MoveVoiceDto {
  @IsString()
  @Length(1, 64)
  userId!: string;

  @IsString()
  @Length(1, 64)
  channelId!: string;
}

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

  /**
   * Arrasta alguém de um canal de voz para outro do mesmo servidor.
   *
   * REST e não evento de socket porque é uma ação de moderação com resposta:
   * quem arrastou precisa saber se foi recusada (sem permissão, alvo fora da
   * voz) para desfazer o realce e mostrar o toast. O `voice.state` de sempre é
   * quem conta o resultado para o resto do servidor.
   */
  @Post("guilds/:guildId/voice/move")
  move(
    @CurrentUser() user: JwtPayload,
    @Param("guildId") guildId: string,
    @Body() body: MoveVoiceDto,
  ) {
    return this.voice.move(user.sub, guildId, body.userId, body.channelId);
  }
}
