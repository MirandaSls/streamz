import { Module } from "@nestjs/common";
import { SoundboardController } from "./soundboard.controller";
import { SoundboardService } from "./soundboard.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../storage/storage.module";
import { VoiceModule } from "../voice/voice.module";

/**
 * Painel de efeitos sonoros.
 *
 * Módulo próprio, e não uma seção do `EmojisModule`, apesar de a mecânica de
 * arquivo ser a mesma: o que faz o soundboard existir é o **disparo na
 * chamada**, e isso o obriga a depender da voz (quem está na sala agora). Pôr
 * essa dependência dentro do módulo de expressões faria o seletor de emoji
 * arrastar o LiveKit junto.
 */
@Module({
  imports: [AuthModule, GuildsModule, RealtimeModule, StorageModule, VoiceModule],
  controllers: [SoundboardController],
  providers: [SoundboardService],
})
export class SoundboardModule {}
