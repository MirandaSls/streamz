import { Module } from "@nestjs/common";
import { DMsController } from "./dms.controller";
import { DMsService } from "./dms.service";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ReadStateModule } from "../read-state/read-state.module";
import { FriendsModule } from "../friends/friends.module";
import { MessagesModule } from "../messages/messages.module";
import { StorageModule } from "../storage/storage.module";
import { VoiceModule } from "../voice/voice.module";

/**
 * FriendsModule: a barreira do bloqueio (abrir DM, montar grupo).
 * MessagesModule: as mensagens de sistema do grupo ("X adicionou Y") são
 * mensagens como as outras — quem monta o DTO é o MessagesService.
 * StorageModule: ícone do grupo.
 * VoiceModule: sair do grupo (ou ser removido dele) tem de derrubar a chamada
 * junto. A seta aponta num sentido só — o `VoiceModule` importa Auth, Friends,
 * Guilds e Realtime, e nenhum deles chega aqui, então não há ciclo.
 */
@Module({
  imports: [
    AuthModule,
    RealtimeModule,
    ReadStateModule,
    FriendsModule,
    MessagesModule,
    StorageModule,
    VoiceModule,
  ],
  controllers: [DMsController],
  providers: [DMsService],
  exports: [DMsService],
})
export class DMsModule {}
