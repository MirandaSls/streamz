import { Module } from "@nestjs/common";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { DiretorioController } from "./diretorio.controller";
import { DiretorioService } from "./diretorio.service";
import { InstalacaoController } from "./instalacao.controller";
import { InstalacaoService } from "./instalacao.service";
import { AuthModule } from "../auth/auth.module";
import { GuildsModule } from "../guilds/guilds.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { RolesModule } from "../roles/roles.module";

/**
 * ── j-bots ── o registro de um bot.
 *
 * `AuthModule` entra porque o `JwtGuard` depende do `JwtService` e do
 * `AccountStatusService` — é o mesmo import que todo módulo com rota
 * autenticada faz.
 *
 * O `ApplicationsService` é exportado porque o `BotTokenGuard` da fase
 * seguinte precisa do `verificarToken`.
 *
 * ── F4, lote B ── `GuildsModule`, `RolesModule` e `RealtimeModule` entram por
 * causa do `InstalacaoService`: `assertCanModerate`/`permissionsOf`/`rank`,
 * `validarPermissoes` e os `emit`/`join` do tempo real. O contrato dava ao lote
 * B só os arrays `controllers:` e `providers:`, mas um provider não resolve uma
 * dependência sem o módulo que a exporta — três linhas no `imports:`, e a
 * divergência está registrada no PR. São **acréscimos** a uma lista, que é o
 * caso que o §1.2 do contrato manda o coordenador resolver.
 *
 * O `InstalacaoService` é exportado porque o **lote A** precisa dele para
 * apagar um aplicativo: antes de apagar o usuário-bot, é preciso desfazer cada
 * instalação (é a dependência A → B do §3.1).
 *
 * **`DiretorioController` vem primeiro na lista** de propósito. Ele e o
 * `ApplicationsController` compartilham o prefixo `applications`, e o Express
 * casa o primeiro padrão registrado — a ordem do array é o que garante que
 * `GET /applications/publicas` continue chegando ao diretório mesmo que o
 * portal ganhe um `@Get(":id…")` depois.
 */
@Module({
  imports: [AuthModule, GuildsModule, RolesModule, RealtimeModule],
  controllers: [DiretorioController, ApplicationsController, InstalacaoController],
  providers: [ApplicationsService, DiretorioService, InstalacaoService],
  exports: [ApplicationsService, InstalacaoService],
})
export class ApplicationsModule {}
