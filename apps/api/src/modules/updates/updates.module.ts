import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { PlatformAdminGuard } from "../admin/admin.guard";
import { AuthModule } from "../auth/auth.module";
import { PublicacaoController } from "./publicacao.controller";
import { PublicacaoMacosService } from "./publicacao-macos.service";
import { UpdatesController } from "./updates.controller";
import { UpdatesService } from "./updates.service";

/**
 * `AuthModule` (JwtGuard) e `AdminModule` (PlatformAdminService, de que o
 * `PlatformAdminGuard` depende) entram só pela rota de publicação do macOS.
 */
@Module({
  imports: [AuthModule, AdminModule],
  controllers: [UpdatesController, PublicacaoController],
  providers: [UpdatesService, PublicacaoMacosService, PlatformAdminGuard],
  exports: [UpdatesService],
})
export class UpdatesModule {}
