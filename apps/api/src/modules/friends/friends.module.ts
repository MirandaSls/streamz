import { Module } from "@nestjs/common";
import { FriendsController } from "./friends.controller";
import { FriendsService } from "./friends.service";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";

/**
 * Amigos e bloqueio. Exporta o service porque a barreira do bloqueio
 * (`assertNotBlocked`) é chamada por quem abre DM, e o perfil rico usa
 * `friendIds`/`relationship` para os "em comum".
 */
@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
