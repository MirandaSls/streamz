import { Module, type OnModuleInit } from "@nestjs/common";
import { VoiceController } from "./voice.controller";
import { CallsController } from "./calls.controller";
import { VoiceService } from "./voice.service";
import { CallsService } from "./calls.service";
import { AuthModule } from "../auth/auth.module";
import { FriendsModule } from "../friends/friends.module";
import { GuildsModule } from "../guilds/guilds.module";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  // FriendsModule entra por causa do bloqueio: quem bloqueou não pode ser
  // chamado numa conversa que já existia antes do bloqueio
  imports: [AuthModule, FriendsModule, GuildsModule, RealtimeModule],
  controllers: [VoiceController, CallsController],
  providers: [VoiceService, CallsService],
  // o gateway usa os dois para tratar voice.join/leave/update e call.*
  exports: [VoiceService, CallsService],
})
export class VoiceModule implements OnModuleInit {
  constructor(
    private readonly guilds: GuildsService,
    private readonly voice: VoiceService,
  ) {}

  /**
   * Pluga a voz no `GuildsService`: kick, ban e saída do servidor precisam
   * tirar a pessoa da chamada, e não só das salas do Socket.IO.
   *
   * A ligação é feita **daqui** porque a seta entre os módulos aponta num
   * sentido só — `VoiceModule` ──imports──▶ `GuildsModule` —, e injetar
   * `VoiceService` lá dentro fecharia o ciclo. Ver o comentário de
   * `GuildsService.registrarDesligamentoDeVoz`.
   */
  onModuleInit(): void {
    this.guilds.registrarDesligamentoDeVoz((userId, guildId) =>
      this.voice.desligarDoServidor(userId, guildId),
    );
  }
}
