import { Module } from "@nestjs/common";
import { ChatGateway } from "./chat.gateway";
import { AuthModule } from "../auth/auth.module";
import { MessagesModule } from "../messages/messages.module";
import { DMsModule } from "../dms/dms.module";
import { GuildsModule } from "../guilds/guilds.module";

@Module({
  imports: [AuthModule, MessagesModule, DMsModule, GuildsModule],
  providers: [ChatGateway],
})
export class GatewayModule {}
