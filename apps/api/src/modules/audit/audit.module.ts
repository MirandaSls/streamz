import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/**
 * Só o serviço, sem controller e sem imports.
 *
 * Quem registra auditoria (guilds, channels, invites, moderation) já depende de
 * `GuildsModule`; se este módulo importasse `GuildsModule` para autorizar a
 * leitura do registro, o grafo ficaria circular. A rota de leitura mora no
 * `ModerationModule`, que já tem os dois.
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
