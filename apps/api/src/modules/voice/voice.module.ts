import { Module } from "@nestjs/common";
import { VoiceController } from "./voice.controller";
import { CallsController } from "./calls.controller";
import { VoiceService } from "./voice.service";
import { CallsService } from "./calls.service";
import { AuthModule } from "../auth/auth.module";
import { FriendsModule } from "../friends/friends.module";
import { GuildsModule } from "../guilds/guilds.module";
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
export class VoiceModule {}
