import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [AuthModule, GuildsModule, RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
