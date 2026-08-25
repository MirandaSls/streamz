import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { StorageModule } from "../storage/storage.module";
import { MaintenanceService } from "./maintenance.service";

@Module({
  imports: [ScheduleModule.forRoot(), StorageModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
