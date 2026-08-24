import { Module } from "@nestjs/common";
import { ChatGateway } from "./chat.gateway";
import { AuthModule } from "../auth/auth.module";
import { MessagesModule } from "../messages/messages.module";

@Module({
  imports: [AuthModule, MessagesModule],
  providers: [ChatGateway],
})
export class GatewayModule {}
