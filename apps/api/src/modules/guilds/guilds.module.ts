import { Module } from "@nestjs/common";
import { GuildsController } from "./guilds.controller";
import { GuildsService } from "./guilds.service";
import { CategoriasPadraoService } from "./categorias-padrao";
import { PermissoesLegadoService } from "./permissoes-legado";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ReadStateModule } from "../read-state/read-state.module";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  // StorageModule: o ícone do servidor vive no mesmo storage dos anexos
  imports: [AuthModule, RealtimeModule, ReadStateModule, StorageModule, AuditModule],
  controllers: [GuildsController],
  // CategoriasPadraoService: passo idempotente do boot que cria as duas
  // categorias padrão nos servidores que nasceram antes delas existirem
  // PermissoesLegadoService: passo idempotente do boot que converte
  // `private`/`readOnly` e a allowlist antiga para overrides (c-cargos)
  providers: [GuildsService, CategoriasPadraoService, PermissoesLegadoService],
  exports: [GuildsService],
})
export class GuildsModule {}
