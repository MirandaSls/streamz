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
 * `GET /api/v10/applications/@me`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * `{id, name, description, icon: null, bot_public: false,
 *   bot_require_code_grant: false, flags: 0, bot: <user do bot>, owner: …}`.
 * O discord.js instancia `ClientApplication` com o `application` do READY e
 * completa por aqui quando alguém toca em `client.application.fetch()`.
 *
 * Não confundir com `/api/applications` (sem `v10`), que é o REST **interno**
 * da F0, autenticado com `Bearer` pelo dono do bot.
 *
 * **Divergência registrada:** `description` sai `null` e `owner` não sai. Os
 * dois moram na linha de `Application`, e a única porta de leitura da casca
 * (`DadosDeCompatService`) não tem — nem pode ganhar sem o coordenador — um
 * método para essa tabela; o `BotAutenticado` do `tipos.ts` traz só id, snowflake
 * e nome. O discord.js trata os dois campos como opcionais (`owner` ausente vira
 * `null`), então nada quebra. Ver o PR.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/applications")
export class ApplicationsCompatController {
  constructor(private readonly dados: DadosDeCompatService) {}

  @Get("@me")
  async eu(@BotAtual() bot: BotAutenticado): Promise<JsonDoDiscord> {
    const usuario = await this.dados.usuarioPorCuid(bot.botUserId);
    if (!usuario) throw usuarioDesconhecido();

    return {
      id: String(bot.applicationSnowflake),
      name: bot.applicationName,
      icon: null,
      description: null,
      // instalar bot dos outros é a F4 (a tela de "Adicionar ao servidor"): até
      // lá, nenhum aplicativo é público
      bot_public: false,
      bot_require_code_grant: false,
      flags: 0,
      bot: usuarioParaDiscord(usuario),
    };
  }
}

@Controller("v9/applications")
export class ApplicationsCompatControllerV9 extends ApplicationsCompatController {}
