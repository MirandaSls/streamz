import { Module, type OnModuleInit } from "@nestjs/common";
import { ApplicationsModule } from "../applications/applications.module";
import { ChannelsModule } from "../channels/channels.module";
import { GuildsModule } from "../guilds/guilds.module";
import { MessagesModule } from "../messages/messages.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { RolesModule } from "../roles/roles.module";
import { BotTokenGuard } from "./bot-token.guard";
import { DadosDeCompatService } from "./dados.service";
import { IdsService } from "./ids.service";
import { RateLimitDoDiscordInterceptor } from "./rate-limit.interceptor";
import { PonteDeEventos } from "./gateway/dispatch";
import { RegistroDeSessoes } from "./gateway/sessao";
import { GatewayCompatService } from "./gateway/servidor";
import { ApplicationsCompatController, ApplicationsCompatControllerV9 } from "./rest/applications.controller";
import { ChannelsCompatController, ChannelsCompatControllerV9 } from "./rest/channels.controller";
import { GatewayCompatController, GatewayCompatControllerV9 } from "./rest/gateway.controller";
import { GuildsCompatController, GuildsCompatControllerV9 } from "./rest/guilds.controller";
import { MessagesCompatController, MessagesCompatControllerV9 } from "./rest/messages.controller";
import { UsersCompatController, UsersCompatControllerV9 } from "./rest/users.controller";

/**
 * ── j-bots ── a casca de compatibilidade com o Discord.
 *
 * Montada **ao lado** do REST atual, em `/api/v10/**` (e `/api/v9/**` como
 * alias). Nada do REST existente muda, e nada aqui dentro implementa regra de
 * negócio: os controllers chamam `MessagesService`, `GuildsService`,
 * `ChannelsService` e `RolesService` como o gateway do web chama, e traduzem a
 * entrada e a saída. Se um dia a casca sair, o Streamz continua inteiro (§3).
 *
 * **Este arquivo é escrito pelo coordenador e não é editado pelos lotes.**
 * Provider novo, controller novo: relate; não acrescente sozinho — três
 * branches editando o mesmo `@Module` é exatamente a colisão que o §6.4 do
 * processo manda evitar.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §5, §6, §7 e o
 * `CONTRATO-F1.md` deste diretório.
 */
@Module({
  imports: [
    // ApplicationsModule exporta o `verificarToken` que o BotTokenGuard usa
    ApplicationsModule,
    GuildsModule,
    ChannelsModule,
    MessagesModule,
    RolesModule,
    RealtimeModule,
  ],
  controllers: [
    GatewayCompatController,
    GatewayCompatControllerV9,
    UsersCompatController,
    UsersCompatControllerV9,
    ApplicationsCompatController,
    ApplicationsCompatControllerV9,
    GuildsCompatController,
    GuildsCompatControllerV9,
    ChannelsCompatController,
    ChannelsCompatControllerV9,
    MessagesCompatController,
    MessagesCompatControllerV9,
  ],
  providers: [
    IdsService,
    DadosDeCompatService,
    BotTokenGuard,
    RateLimitDoDiscordInterceptor,
    RegistroDeSessoes,
    GatewayCompatService,
    PonteDeEventos,
  ],
  exports: [GatewayCompatService],
})
export class DiscordCompatModule implements OnModuleInit {
  constructor(private readonly ponte: PonteDeEventos) {}

  /**
   * Liga a ponte de eventos assim que o módulo sobe.
   *
   * Aqui, e não no `main.ts`, porque não depende do servidor HTTP — depende só
   * do `RealtimeService`, que é um provider. O que depende do servidor HTTP é o
   * `'upgrade'` do gateway, e esse o `main.ts` liga depois do `listen()`.
   */
  onModuleInit() {
    this.ponte.iniciar();
  }
}
