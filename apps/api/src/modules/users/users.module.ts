import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../storage/storage.module";
import { FriendsModule } from "../friends/friends.module";

@Module({
  // FriendsModule: o perfil rico precisa da relação e dos amigos em comum
  imports: [AuthModule, RealtimeModule, StorageModule, FriendsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
