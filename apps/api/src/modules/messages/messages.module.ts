import { Module } from "@nestjs/common";
import { GuildMessagesController, MessagesController } from "./messages.controller";
import { ReadController } from "./read.controller";
import { InboxController } from "./inbox.controller";
import { PinsController } from "./pins.controller";
import { ThreadsController } from "./threads.controller";
import { ReadStateModule } from "../read-state/read-state.module";
import { MessagesService } from "./messages.service";
import { InboxService } from "./inbox.service";
import { PinsService } from "./pins.service";
import { ThreadsService } from "./threads.service";
import { AuthModule } from "../auth/auth.module";
import { ChannelsModule } from "../channels/channels.module";
import { FriendsModule } from "../friends/friends.module";
import { GuildsModule } from "../guilds/guilds.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../storage/storage.module";
import { EmojisModule } from "../emojis/emojis.module";
import { OnboardingModule } from "../onboarding/onboarding.module";

@Module({
  // ChannelsModule entra por causa do modo lento (b-canais): a regra é do canal
  imports: [
    AuthModule,
    GuildsModule,
    StorageModule,
    ReadStateModule,
    ChannelsModule,
    RealtimeModule,
    EmojisModule,
    // h-moderacao: aceite de regras entra no caminho de escrita
    OnboardingModule,
    // d-social: o bloqueio entra no caminho de escrita da conversa direta.
    // Não fecha ciclo: o FriendsModule só depende de Auth e Realtime.
    FriendsModule,
  ],
  controllers: [
    MessagesController,
    GuildMessagesController,
    ReadController,
    InboxController,
    PinsController,
    ThreadsController,
  ],
  providers: [MessagesService, InboxService, PinsService, ThreadsService],
  exports: [MessagesService],
})
export class MessagesModule {}
