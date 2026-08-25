import { Module } from "@nestjs/common";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [AuthModule, GuildsModule, RealtimeModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
