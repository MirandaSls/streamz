import { Module } from "@nestjs/common";
import { DMsController } from "./dms.controller";
import { DMsService } from "./dms.service";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ReadStateModule } from "../read-state/read-state.module";
import { FriendsModule } from "../friends/friends.module";
import { MessagesModule } from "../messages/messages.module";
import { StorageModule } from "../storage/storage.module";

/**
 * FriendsModule: a barreira do bloqueio (abrir DM, montar grupo).
 * MessagesModule: as mensagens de sistema do grupo ("X adicionou Y") são
 * mensagens como as outras — quem monta o DTO é o MessagesService.
 * StorageModule: ícone do grupo.
 */
@Module({
  imports: [
    AuthModule,
    RealtimeModule,
    ReadStateModule,
    FriendsModule,
    MessagesModule,
    StorageModule,
  ],
  controllers: [DMsController],
  providers: [DMsService],
  exports: [DMsService],
})
export class DMsModule {}
