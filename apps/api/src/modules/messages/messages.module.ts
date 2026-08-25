import { Module } from "@nestjs/common";
import { MessagesController } from "./messages.controller";
import { ReadController } from "./read.controller";
import { ReadStateModule } from "../read-state/read-state.module";
import { MessagesService } from "./messages.service";
import { AuthModule } from "../auth/auth.module";
import { ChannelsModule } from "../channels/channels.module";
import { GuildsModule } from "../guilds/guilds.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  // ChannelsModule entra por causa do modo lento (b-canais): a regra é do canal
  imports: [AuthModule, GuildsModule, StorageModule, ReadStateModule, ChannelsModule],
  controllers: [MessagesController, ReadController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
