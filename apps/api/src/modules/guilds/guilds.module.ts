import { Module } from "@nestjs/common";
import { GuildsController } from "./guilds.controller";
import { GuildsService } from "./guilds.service";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ReadStateModule } from "../read-state/read-state.module";

@Module({
  imports: [AuthModule, RealtimeModule, ReadStateModule],
  controllers: [GuildsController],
  providers: [GuildsService],
  exports: [GuildsService],
})
export class GuildsModule {}
