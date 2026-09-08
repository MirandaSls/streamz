import { Controller, Get, HttpCode, Param, Post, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { WS_EVENTS } from "@streamz/shared";
import { toPublicUser } from "../../../common/dto";
import { GuildsService } from "../../guilds/guilds.service";
import { RealtimeService } from "../../realtime/realtime.service";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import { canalDesconhecido, FiltroDeErrosDoDiscord, servidorDesconhecido } from "../erros";
import { IdsService } from "../ids.service";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { BotAutenticado, CanalDoDiscord } from "../tipos";
import { canalParaDiscord, categoriaParaDiscord } from "../traducao/canal";
import { BotAtual } from "./bot-atual";

/**
 * `GET /api/v10/channels/:id` e `POST /api/v10/channels/:id/typing`.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * O `:id` pode ser um `Channel` **ou** uma `Category` (categoria no Discord é
 * canal, tipo 4) — use `IdsService.cuidDeCanalOuCategoria`. É o detalhe do §4
 * que é fácil esquecer e que faz `parent_id` apontar para o nada.
 *
 * `typing` responde **204 sem corpo** e emite `typing` pelo `RealtimeService`,
 * como o gateway do web faz.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/channels")
export class ChannelsCompatController {
  constructor(
    private readonly dados: DadosDeCompatService,
    private readonly ids: IdsService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get(":id")
  async canal(@BotAtual() bot: BotAutenticado, @Param("id") id: string): Promise<CanalDoDiscord> {
    const alvo = await this.ids.cuidDeCanalOuCategoria(id);
    if (!alvo) throw canalDesconhecido();

    if (alvo.tipo === "categoria") {
      const categoria = await this.dados.categoriaPorCuid(alvo.id);
      if (!categoria) throw canalDesconhecido();
      // categoria não tem `assertCanViewChannel` (não é canal para nós): a
      // barreira é participar do servidor dela
      const membro = await this.dados.membroDoServidor(categoria.guildId, bot.botUserId);
      if (!membro) throw servidorDesconhecido();
      return categoriaParaDiscord(categoria);
    }

    // a autorização é a de sempre: cargos + overrides do canal. Ela lança
    // Forbidden/NotFound, e o filtro os traduz.
    await this.guilds.assertCanViewChannel(bot.botUserId, alvo.id);
    const canal = await this.dados.canalPorCuid(alvo.id);
    if (!canal) throw canalDesconhecido();
    return canalParaDiscord(canal);
  }

  @Post(":id/typing")
  @HttpCode(204)
  async digitando(@BotAtual() bot: BotAutenticado, @Param("id") id: string): Promise<void> {
    // categoria não recebe mensagem, logo ninguém digita nela
    const alvo = await this.ids.cuidDeCanalOuCategoria(id);
    if (!alvo || alvo.tipo !== "canal") throw canalDesconhecido();
    const canalId = alvo.id;
    await this.guilds.assertCanViewChannel(bot.botUserId, canalId);

    const usuario = await this.dados.usuarioPorCuid(bot.botUserId);
    if (!usuario) throw canalDesconhecido();

    // O mesmo evento e a mesma forma do `chat.gateway` (`{channelId, user}`), para
    // o navegador mostrar "fulano está digitando" sem saber que veio de um bot.
    // `avatarUrl`/`status` saem nulos: `LinhaDeUsuario` não os traz, e o
    // indicador de digitação só usa o nome.
    this.realtime.emitToChannel(canalId, WS_EVENTS.TYPING, {
      channelId: canalId,
      user: toPublicUser({
        id: usuario.id,
        username: usuario.username,
        displayName: usuario.displayName,
        avatarUrl: null,
        status: "OFFLINE",
        isBot: usuario.isBot,
      }),
    });
  }
}

@Controller("v9/channels")
export class ChannelsCompatControllerV9 extends ChannelsCompatController {}
