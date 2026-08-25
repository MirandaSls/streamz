import { Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
import { GuildsModule } from "../guilds/guilds.module";

@Module({
  // GuildsModule: o proxy de leitura autoriza pelo canal da mensagem do anexo
  imports: [AuthModule, StorageModule, GuildsModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
