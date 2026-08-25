import { Module } from "@nestjs/common";
import { DMsController } from "./dms.controller";
import { DMsService } from "./dms.service";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ReadStateModule } from "../read-state/read-state.module";

@Module({
  imports: [AuthModule, RealtimeModule, ReadStateModule],
  controllers: [DMsController],
  providers: [DMsService],
  exports: [DMsService],
})
export class DMsModule {}
