import { Module } from "@nestjs/common";
import { InvitesController } from "./invites.controller";
import { InvitesService } from "./invites.service";
import { AuditModule } from "../audit/audit.module";
import { GuildsModule } from "../guilds/guilds.module";
import { OnboardingModule } from "../onboarding/onboarding.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AuthModule } from "../auth/auth.module";
import { OptionalJwtGuard } from "../../common/optional-jwt.guard";

@Module({
  imports: [GuildsModule, AuthModule, RealtimeModule, AuditModule, OnboardingModule],
  controllers: [InvitesController],
  providers: [InvitesService, OptionalJwtGuard],
})
export class InvitesModule {}
