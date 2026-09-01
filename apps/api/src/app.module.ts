import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { GuildsModule } from "./modules/guilds/guilds.module";
import { ChannelsModule } from "./modules/channels/channels.module";
import { MessagesModule } from "./modules/messages/messages.module";
import { InvitesModule } from "./modules/invites/invites.module";
import { DMsModule } from "./modules/dms/dms.module";
import { GatewayModule } from "./modules/gateway/gateway.module";
import { VoiceModule } from "./modules/voice/voice.module";
import { StorageModule } from "./modules/storage/storage.module";
import { UploadsModule } from "./modules/uploads/uploads.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { ReadStateModule } from "./modules/read-state/read-state.module";
import { EmbedsModule } from "./modules/embeds/embeds.module";
import { RolesModule } from "./modules/roles/roles.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { FriendsModule } from "./modules/friends/friends.module";
import { EmojisModule } from "./modules/emojis/emojis.module";
import { MediaModule } from "./modules/media/media.module";
// ── h-moderacao ──
import { AuditModule } from "./modules/audit/audit.module";
import { ModerationModule } from "./modules/moderation/moderation.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { PollsModule } from "./modules/polls/polls.module";
import { DiscoveryModule } from "./modules/discovery/discovery.module";
import { DownloadsModule } from "./modules/downloads/downloads.module";
import { MailModule } from "./modules/mail/mail.module";
// ── j-painel-admin ──
import { AdminModule } from "./modules/admin/admin.module";
import { UpdatesModule } from "./modules/updates/updates.module";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { redisClient } from "./modules/realtime/redis";
import { HealthController } from "./health.controller";
import { DEFAULT_THROTTLE } from "./common/throttle";
import { validateEnv } from "./common/env";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
      validate: validateEnv,
    }),
    // com REDIS_URL o teto por IP vale para todas as instâncias; sem, por processo
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const redis = redisClient();
        return {
          throttlers: [DEFAULT_THROTTLE],
          // THROTTLE_DISABLED=1 só para bateria e2e local: os passeios criam
          // dezenas de contas de um IP só e o teto de registro é 5/hora.
          // Nunca em produção — o env.ts recusa a combinação.
          skipIf: () => process.env.THROTTLE_DISABLED === "1",
          ...(redis ? { storage: new ThrottlerStorageRedisService(redis) } : {}),
        };
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    GuildsModule,
    ChannelsModule,
    MessagesModule,
    InvitesModule,
    DMsModule,
    GatewayModule,
    VoiceModule,
    StorageModule,
    UploadsModule,
    MaintenanceModule,
    ReadStateModule,
    EmbedsModule,
    RolesModule,
    NotificationsModule,
    FriendsModule,
    EmojisModule,
    MediaModule,
    UpdatesModule,
    // ── h-moderacao ──
    AuditModule,
    ModerationModule,
    OnboardingModule,
    PollsModule,
    DiscoveryModule,
    DownloadsModule,
    MailModule,
    // ── j-painel-admin ──
    AdminModule,
  ],
  controllers: [HealthController],
  // guard global: o teto padrão vale para toda rota; ver common/throttle.ts
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
