import { Module } from "@nestjs/common";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";

@Module({
  imports: [AuthModule, GuildsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
