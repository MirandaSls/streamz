import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { StorageModule } from "../storage/storage.module";
import { UsersModule } from "../users/users.module";
import { MaintenanceService } from "./maintenance.service";

@Module({
  imports: [ScheduleModule.forRoot(), StorageModule, UsersModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
