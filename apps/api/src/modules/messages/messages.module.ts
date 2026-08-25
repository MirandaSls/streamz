import { Module } from "@nestjs/common";
import { MessagesController } from "./messages.controller";
import { ReadController } from "./read.controller";
import { ReadStateModule } from "../read-state/read-state.module";
import { MessagesService } from "./messages.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [AuthModule, GuildsModule, StorageModule, ReadStateModule],
  controllers: [MessagesController, ReadController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
