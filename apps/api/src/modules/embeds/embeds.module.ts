import { Module } from "@nestjs/common";
import { EmbedsController } from "./embeds.controller";
import { EmbedsService } from "./embeds.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [EmbedsController],
  providers: [EmbedsService],
})
export class EmbedsModule {}
