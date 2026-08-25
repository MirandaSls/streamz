import { Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
