import { Module } from "@nestjs/common";
import { GuildsController } from "./guilds.controller";
import { GuildsService } from "./guilds.service";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [GuildsController],
  providers: [GuildsService],
  exports: [GuildsService],
})
export class GuildsModule {}
