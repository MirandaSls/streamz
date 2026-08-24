import { Module } from "@nestjs/common";
import { DMsController } from "./dms.controller";
import { DMsService } from "./dms.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DMsController],
  providers: [DMsService],
  exports: [DMsService],
})
export class DMsModule {}
