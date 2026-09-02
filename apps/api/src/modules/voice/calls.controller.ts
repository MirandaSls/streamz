import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CallsService } from "./calls.service";
import { VoiceService } from "./voice.service";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";

/**
 * Começar uma chamada é a única parte de conversa direta que passa por REST:
 * quem liga precisa do token de mídia na resposta. Atender, recusar e desligar
 * são eventos do gateway (`call.accept`/`call.decline`/`call.end`), como todo o
 * resto do tempo real.
 *
 * A rota mora no módulo de voz, não no de DMs, porque o que ela cria é uma sala
 * de voz — o `DMsService` continua cuidando só de abrir/listar/sair da conversa.
 * Pelo mesmo motivo a leitura do estado da chamada fica aqui ao lado.
 */
@UseGuards(JwtGuard)
@Controller("dms")
export class CallsController {
  constructor(
    private readonly calls: CallsService,
    private readonly voice: VoiceService,
  ) {}

  @Post(":id/call")
  start(@CurrentUser() user: JwtPayload, @Param("id") channelId: string) {
    return this.calls.start(user.sub, user.username, channelId);
  }

  /**
   * Quem está na chamada desta conversa agora — o par de
   * `GET /guilds/:id/voice-states` para conversa direta. É o que o cliente lê
   * ao abrir a conversa e ao recarregar a página no meio de uma chamada.
   */
  @Get(":id/voice-states")
  states(@CurrentUser() user: JwtPayload, @Param("id") channelId: string) {
    return this.voice.statesForDM(user.sub, channelId);
  }
}
