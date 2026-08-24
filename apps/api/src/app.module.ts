import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { GuildsModule } from "./modules/guilds/guilds.module";
import { ChannelsModule } from "./modules/channels/channels.module";
import { MessagesModule } from "./modules/messages/messages.module";
import { InvitesModule } from "./modules/invites/invites.module";
import { GatewayModule } from "./modules/gateway/gateway.module";
import { VoiceModule } from "./modules/voice/voice.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    GuildsModule,
    ChannelsModule,
    MessagesModule,
    InvitesModule,
    GatewayModule,
    VoiceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
