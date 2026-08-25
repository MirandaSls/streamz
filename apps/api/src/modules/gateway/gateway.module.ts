import { Module } from "@nestjs/common";
import { ChatGateway } from "./chat.gateway";
import { AuthModule } from "../auth/auth.module";
import { MessagesModule } from "../messages/messages.module";
import { GuildsModule } from "../guilds/guilds.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { VoiceModule } from "../voice/voice.module";

@Module({
  imports: [AuthModule, MessagesModule, GuildsModule, RealtimeModule, VoiceModule],
  providers: [ChatGateway],
})
export class GatewayModule {}
