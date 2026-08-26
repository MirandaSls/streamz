import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { ChannelsController } from "./channels.controller";
import { ChannelsService } from "./channels.service";
import { GuildReadController } from "./guild-read.controller";
import { GuildsModule } from "../guilds/guilds.module";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [GuildsModule, AuthModule, RealtimeModule],
  controllers: [ChannelsController, CategoriesController, GuildReadController],
  providers: [ChannelsService, CategoriesService],
  exports: [ChannelsService, CategoriesService],
})
export class ChannelsModule {}
