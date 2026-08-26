import { Module } from "@nestjs/common";
import { EmojisController } from "./emojis.controller";
import { EmojisService } from "./emojis.service";
import { StickersController } from "./stickers.controller";
import { StickersService } from "./stickers.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { StorageModule } from "../storage/storage.module";

/**
 * Emojis personalizados e figurinhas de servidor — os dois domínios andam
 * juntos: mesma origem (imagem no bucket, escopo de servidor), mesma permissão
 * e o mesmo seletor do lado do cliente.
 */
@Module({
  imports: [AuthModule, GuildsModule, RealtimeModule, StorageModule],
  controllers: [EmojisController, StickersController],
  providers: [EmojisService, StickersService],
  // o envio de mensagem valida figurinha e emoji de reação antes de gravar
  exports: [StickersService, EmojisService],
})
export class EmojisModule {}
