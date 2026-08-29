import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PlatformAdminGuard } from "./admin.guard";
import { PlatformAdminService } from "./platform-admin.service";
import { AuthModule } from "../auth/auth.module";
import { MessagesModule } from "../messages/messages.module";
import { VoiceModule } from "../voice/voice.module";
import { DMsModule } from "../dms/dms.module";
import { RealtimeModule } from "../realtime/realtime.module";

/**
 * Painel do administrador da instância (`j-painel-admin`).
 *
 * Importa `MessagesModule` e `VoiceModule` porque lê pelos serviços deles em
 * vez de repetir a montagem do DTO de mensagem e o formato do estado de voz —
 * uma segunda versão dessas duas coisas envelheceria sozinha. `AuthModule`
 * entra pelo `JwtGuard`, como em qualquer módulo com rota autenticada.
 *
 * `DMsModule` e `RealtimeModule` são da mensagem direta do painel: abrir a
 * conversa é o `DMsService.openWith` de sempre, e a entrega ao vivo é a mesma
 * do gateway — o painel não inventa um segundo caminho para nenhum dos dois.
 */
@Module({
  imports: [AuthModule, MessagesModule, VoiceModule, DMsModule, RealtimeModule],
  controllers: [AdminController],
  providers: [AdminService, PlatformAdminService, PlatformAdminGuard],
  exports: [PlatformAdminService],
})
export class AdminModule {}
