import { Module } from "@nestjs/common";
import { ApplicationsModule } from "../applications/applications.module";
import { AuthModule } from "../auth/auth.module";
import { DiscordCompatModule } from "../discord-compat/discord-compat.module";
import { GuildsModule } from "../guilds/guilds.module";
import { MessagesModule } from "../messages/messages.module";
import { RealtimeModule } from "../realtime/realtime.module";
import {
  ApplicationCommandsCompatController,
  ApplicationCommandsCompatControllerV9,
} from "../discord-compat/rest/application-commands.controller";
import {
  InteractionCallbackCompatController,
  InteractionCallbackCompatControllerV9,
} from "../discord-compat/rest/interactions.controller";
import {
  WebhooksCompatController,
  WebhooksCompatControllerV9,
} from "../discord-compat/rest/webhooks.controller";
import { InteractionsController } from "./interactions.controller";
import { InteractionsService } from "./interactions.service";

/**
 * ── j-bots ── comandos de barra e interações (F3), estendido pela **onda 3**
 * com componente, modal e autocomplete (cartão 3a).
 *
 * **Este arquivo é do coordenador; os lotes não o editam.**
 *
 * `InteractionsController` (`interactions.controller.ts`) é o REST **interno**
 * — `Authorization: Bearer` + `JwtGuard`, o que o navegador chama — e reúne
 * hoje cinco rotas: `POST /api/channels/:id/interactions` (comando de barra, F3)
 * e, da onda 3, `POST /api/channels/:id/interactions/componente` (clique em
 * botão/select), `.../modal` (envio do modal aberto pelo bot) e
 * `.../autocomplete` (sugestão da opção em foco), mais
 * `GET /api/guilds/:id/comandos-de-app`. Contrato completo em
 * `docs/CONTRATO-ONDA-3.md` §4.
 *
 * Por que os três controllers de `/api/v10/**` são registrados **aqui**, e não
 * no `DiscordCompatModule` onde os arquivos moram: eles precisam do
 * `InteractionsService`, e o `InteractionsService` precisa do
 * `RegistroDeSessoes` (para o `INTERACTION_CREATE`) e do `IdsService` (para os
 * snowflakes) do `DiscordCompatModule`. Registrar lá criaria um ciclo entre os
 * dois módulos, e a saída seria um `forwardRef` — que funciona, mas esconde a
 * dependência de verdade. Aqui a seta aponta num sentido só:
 *
 * ```
 * InteractionsModule ──imports──▶ DiscordCompatModule
 * ```
 *
 * O caminho da rota não tem nada com o módulo que a registra: o Nest monta o
 * roteador uma vez, com todos os controllers. Os arquivos continuam em
 * `discord-compat/rest/`, como o §5 do documento desenhou — e é lá, no
 * `InteractionCallbackCompatController`, que moram os callbacks 4 a 9
 * (`POST /api/v10/interactions/:id/:token/callback`) e os followups.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9, `docs/CONTRATO-ONDA-3.md` e
 * o `CONTRATO-F3.md` deste diretório (o que já valia antes da onda 3).
 */
@Module({
  imports: [
    DiscordCompatModule,
    // O `BotTokenGuard` dos controllers de compat registrados aqui embaixo
    // injeta o `ApplicationsService`, e o `DiscordCompatModule` importa o
    // `ApplicationsModule` sem reexportá-lo — o guard não resolveria e o Nest
    // morreria no bootstrap com "can't resolve dependencies of the
    // BotTokenGuard". Importar deste lado é o conserto certo: um módulo não
    // deve reexportar o que ele usa por dentro só porque um vizinho precisa.
    ApplicationsModule,
    // O `InteractionsController` é REST interno e usa `JwtGuard`, que injeta o
    // `JwtService`: sem isto o Nest morre no bootstrap do mesmo jeito. É o que
    // o `AdminModule` e o `DiscoveryModule` já fazem.
    AuthModule,
    GuildsModule,
    MessagesModule,
    RealtimeModule,
  ],
  controllers: [
    InteractionsController,
    ApplicationCommandsCompatController,
    ApplicationCommandsCompatControllerV9,
    InteractionCallbackCompatController,
    InteractionCallbackCompatControllerV9,
    WebhooksCompatController,
    WebhooksCompatControllerV9,
  ],
  providers: [InteractionsService],
  exports: [InteractionsService],
})
export class InteractionsModule {}
