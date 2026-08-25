import { Module } from "@nestjs/common";
import { ReadStateService } from "./read-state.service";

/**
 * Só o service: o endpoint de "marcar como lido" mora no MessagesModule, que já
 * importa GuildsModule para autorizar — importar GuildsModule aqui fecharia um
 * ciclo, já que GuildsModule usa este service para montar os DTOs.
 */
@Module({
  providers: [ReadStateService],
  exports: [ReadStateService],
})
export class ReadStateModule {}
