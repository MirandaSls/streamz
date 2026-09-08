import { Module } from "@nestjs/common";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { AuthModule } from "../auth/auth.module";

/**
 * ── j-bots ── o registro de um bot.
 *
 * `AuthModule` entra porque o `JwtGuard` depende do `JwtService` e do
 * `AccountStatusService` — é o mesmo import que todo módulo com rota
 * autenticada faz.
 *
 * O `ApplicationsService` é exportado porque o `BotTokenGuard` da fase
 * seguinte precisa do `verificarToken`.
 */
@Module({
  imports: [AuthModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
