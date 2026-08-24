import { Module } from "@nestjs/common";
import { ChannelsController } from "./channels.controller";
import { ChannelsService } from "./channels.service";
import { GuildsModule } from "../guilds/guilds.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [GuildsModule, AuthModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
