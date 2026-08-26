import { Module } from "@nestjs/common";
import { PollsController } from "./polls.controller";
import { PollsService } from "./polls.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";
import { MessagesModule } from "../messages/messages.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [AuthModule, GuildsModule, MessagesModule, RealtimeModule],
  controllers: [PollsController],
  providers: [PollsService],
  exports: [PollsService],
})
export class PollsModule {}
