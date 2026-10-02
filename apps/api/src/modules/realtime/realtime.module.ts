import { Module } from "@nestjs/common";
import { PresenceService } from "./presence.service";
import { RealtimeService } from "./realtime.service";

@Module({
  providers: [RealtimeService, PresenceService],
  exports: [RealtimeService, PresenceService],
})
export class RealtimeModule {}
