import { Controller, Get, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import { FiltroDeErrosDoDiscord, usuarioDesconhecido } from "../erros";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { BotAutenticado, JsonDoDiscord } from "../tipos";
import { usuarioParaDiscord } from "../traducao/usuario";
import { BotAtual } from "./bot-atual";

/**
 * `GET /api/v10/applications/@me` e `GET /api/v10/oauth2/applications/@me`.
 *
 * ── Lote A (REST compat) implementa; a rota `oauth2` e o `owner` entraram na
 * integração, ver abaixo. ──
 *
 * As **duas** rotas existem porque as duas libs pedem coisas diferentes:
 *
 * - o discord.js instancia `ClientApplication` com o `application` do READY e
 *   completa por `/applications/@me` quando alguém toca em
 *   `client.application.fetch()`;
 * - o `commands.Bot` do discord.py chama **`/oauth2/applications/@me`** no
 *   login, para descobrir o dono (é assim que `is_owner()` funciona). O §5 do
 *   documento não lista essa rota — foi a prova 4 da F1 que a encontrou, e o
 *   documento é corrigido no PR final.
 *
 * O `AppInfo` do discord.py lê `id`, `name`, `description`, `icon`,
 * `bot_public`, `bot_require_code_grant`, `owner` e `verify_key` **sem `.get`**:
 * qualquer um faltando é `KeyError` dentro da lib, no meio do `login()`. Por
 * isso o payload é completo mesmo onde o valor é vazio.
 *
 * Não confundir com `/api/applications` (sem `v10`), que é o REST **interno** da
 * F0, autenticado com `Bearer` pelo dono do bot.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/applications")
export class ApplicationsCompatController {
  constructor(protected readonly dados: DadosDeCompatService) {}

  @Get("@me")
  async eu(@BotAtual() bot: BotAutenticado): Promise<JsonDoDiscord> {
    return this.aplicacao(bot);
  }

  protected async aplicacao(bot: BotAutenticado): Promise<JsonDoDiscord> {
    const app = await this.dados.aplicacaoPorCuid(bot.applicationId);
    if (!app) throw usuarioDesconhecido();

    return {
      id: String(app.snowflake),
      name: app.name,
      icon: null,
      // string vazia e não `null`: o `AppInfo` do discord.py guarda o valor como
      // veio e o `__repr__` dele concatena — `None` ali vira "None" na tela do
      // dono. O Discord também manda "" para aplicativo sem descrição.
      description: app.description ?? "",
      // instalar bot dos outros é a F4 (a tela de "Adicionar ao servidor"): até
      // lá, nenhum aplicativo é público
      bot_public: false,
      bot_require_code_grant: false,
      flags: 0,
      bot: usuarioParaDiscord(app.bot),
      owner: usuarioParaDiscord(app.dono),
      // Não assinamos interações por chave pública: as nossas chegam pelo
      // gateway, nunca por webhook HTTP (decisão D6). O campo existe porque as
      // libs o leem; o valor é inerte.
      verify_key: "",
      rpc_origins: [],
      team: null,
    };
  }
}

@Controller("v9/applications")
export class ApplicationsCompatControllerV9 extends ApplicationsCompatController {}

/**
 * `GET /api/v10/oauth2/applications/@me` — a rota que o discord.py usa.
 *
 * Mesmo payload, outro caminho. **Não** implementamos mais nada de `/oauth2/*`:
 * o fluxo de autorização do Discord é uma página no `discord.com`, e o nosso
 * equivalente é a nossa própria tela (§13).
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/oauth2/applications")
export class OAuth2ApplicationsCompatController extends ApplicationsCompatController {}

@Controller("v9/oauth2/applications")
export class OAuth2ApplicationsCompatControllerV9 extends OAuth2ApplicationsCompatController {}
