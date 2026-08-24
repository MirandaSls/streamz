import { Module } from "@nestjs/common";
import { VoiceController } from "./voice.controller";
import { VoiceService } from "./voice.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";

@Module({
  imports: [AuthModule, GuildsModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
