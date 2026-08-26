import { Module } from "@nestjs/common";
import { DiscoveryController } from "./discovery.controller";
import { DiscoveryService } from "./discovery.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";
import { OnboardingModule } from "../onboarding/onboarding.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [AuthModule, GuildsModule, RealtimeModule, OnboardingModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
