import { Module } from "@nestjs/common";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { GifsController } from "./gifs.controller";
import { GifsService } from "./gifs.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";
import { StorageModule } from "../storage/storage.module";

/**
 * Mídia que não é anexo enviado: a busca de GIF do provedor e a galeria de
 * imagens já postadas num canal.
 */
@Module({
  imports: [AuthModule, GuildsModule, StorageModule],
  controllers: [GifsController, AttachmentsController],
  providers: [GifsService, AttachmentsService],
})
export class MediaModule {}
