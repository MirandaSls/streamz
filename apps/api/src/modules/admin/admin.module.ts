import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PlatformAdminGuard } from "./admin.guard";
import { PlatformAdminService } from "./platform-admin.service";
import { AuthModule } from "../auth/auth.module";
import { MessagesModule } from "../messages/messages.module";
import { VoiceModule } from "../voice/voice.module";

/**
 * Painel do administrador da instância (`j-painel-admin`).
 *
 * Importa `MessagesModule` e `VoiceModule` porque lê pelos serviços deles em
 * vez de repetir a montagem do DTO de mensagem e o formato do estado de voz —
 * uma segunda versão dessas duas coisas envelheceria sozinha. `AuthModule`
 * entra pelo `JwtGuard`, como em qualquer módulo com rota autenticada.
 */
@Module({
  imports: [AuthModule, MessagesModule, VoiceModule],
  controllers: [AdminController],
  providers: [AdminService, PlatformAdminService, PlatformAdminGuard],
  exports: [PlatformAdminService],
})
export class AdminModule {}
