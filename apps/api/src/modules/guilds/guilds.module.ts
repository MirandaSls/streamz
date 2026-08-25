import { Module } from "@nestjs/common";
import { GuildsController } from "./guilds.controller";
import { GuildsService } from "./guilds.service";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ReadStateModule } from "../read-state/read-state.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  // StorageModule: o ícone do servidor vive no mesmo storage dos anexos
  imports: [AuthModule, RealtimeModule, ReadStateModule, StorageModule],
  controllers: [GuildsController],
  providers: [GuildsService],
  exports: [GuildsService],
})
export class GuildsModule {}
