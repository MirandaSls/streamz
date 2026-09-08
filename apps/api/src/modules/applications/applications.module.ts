import { Module } from "@nestjs/common";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";

/**
 * ── j-bots ── o registro de um bot.
 *
 * `AuthModule` entra porque o `JwtGuard` depende do `JwtService` e do
 * `AccountStatusService` — é o mesmo import que todo módulo com rota
 * autenticada faz.
 *
 * `StorageModule` entra na F4, pelo ícone do aplicativo: é o mesmo import que
 * `emojis` e `soundboard` fazem para guardar um objeto no R2.
 *
 * O `ApplicationsService` é exportado porque o `BotTokenGuard` da fase
 * seguinte precisa do `verificarToken`.
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
