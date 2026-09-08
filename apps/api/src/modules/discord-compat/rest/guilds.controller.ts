import { Controller, Get, Param, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import { FiltroDeErrosDoDiscord, membroDesconhecido, servidorDesconhecido } from "../erros";
import { IdsService } from "../ids.service";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { BotAutenticado, CanalDoDiscord, CargoDoDiscord, JsonDoDiscord, MembroDoDiscord } from "../tipos";
import { canalParaDiscord, categoriaParaDiscord } from "../traducao/canal";
import { cargoParaDiscord } from "../traducao/cargo";
import { membroParaDiscord } from "../traducao/membro";
import { servidorParaDiscord } from "../traducao/servidor";
import { BotAtual } from "./bot-atual";

/**
 * `GET /api/v10/guilds/:id` e os três filhos que a F1 precisa.
 *
 * ── Lote A (REST compat) implementa. ──
 *
 * | Rota | Nota |
 * |---|---|
 * | `GET /guilds/:id` | forma reduzida (`servidorParaDiscord(g, false)`) |
 * | `GET /guilds/:id/channels` | **inclui as categorias como tipo 4** |
 * | `GET /guilds/:id/members/:uid` | |
 * | `GET /guilds/:id/roles` | o `@everyone` sai com `id == guild.id` |
 *
 * Todas checam antes que o **usuário-bot é membro** do servidor: bot fora dele
 * leva `10004 Unknown Guild` (e não 403 — o Discord não confirma a existência
 * de um servidor de que o bot não participa).
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/guilds")
export class GuildsCompatController {
  constructor(
    private readonly dados: DadosDeCompatService,
    private readonly ids: IdsService,
  ) {}

  @Get(":id")
  async servidor(@BotAtual() bot: BotAutenticado, @Param("id") id: string): Promise<JsonDoDiscord> {
    const guildId = await this.doBot(bot, id);
    const servidor = await this.dados.servidorCompleto(guildId);
    // o servidor sumiu entre a checagem de associação e esta leitura
    if (!servidor) throw servidorDesconhecido();
    return servidorParaDiscord(servidor, false);
  }

  @Get(":id/channels")
  async canais(@BotAtual() bot: BotAutenticado, @Param("id") id: string): Promise<CanalDoDiscord[]> {
    const guildId = await this.doBot(bot, id);
    const { canais, categorias } = await this.dados.estruturaDoServidor(guildId);
    // as categorias vêm primeiro porque são o `parent_id` dos canais: quem
    // constrói o cache lendo a lista em ordem já tem o pai quando chega no filho
    return [...categorias.map(categoriaParaDiscord), ...canais.map(canalParaDiscord)];
  }

  @Get(":id/roles")
  async cargos(@BotAtual() bot: BotAutenticado, @Param("id") id: string): Promise<CargoDoDiscord[]> {
    const guildId = await this.doBot(bot, id);
    return (await this.dados.cargosDoServidor(guildId)).map(cargoParaDiscord);
  }

  @Get(":id/members/:uid")
  async membro(
    @BotAtual() bot: BotAutenticado,
    @Param("id") id: string,
    @Param("uid") uid: string,
  ): Promise<MembroDoDiscord> {
    const guildId = await this.doBot(bot, id);
    const userId = await this.ids.cuidDeUsuario(uid);
    const membro = userId ? await this.dados.membroDoServidor(guildId, userId) : null;
    if (!membro) throw membroDesconhecido();
    return membroParaDiscord(membro);
  }

  /**
   * O cuid do servidor, **se** o bot participa dele. Se não, `10004`.
   *
   * Um 403 aqui contaria ao bot que o servidor existe; o Discord não confirma a
   * existência de servidor de que o bot não participa, e é o mesmo motivo de o
   * snowflake desconhecido cair no mesmo erro.
   */
  private async doBot(bot: BotAutenticado, snowflake: string): Promise<string> {
    const guildId = await this.ids.cuidDeServidor(snowflake);
    if (!guildId) throw servidorDesconhecido();
    // "estar no servidor" na F1 é ter linha de `GuildMember` (a instalação por
    // UI e a `GuildApplication` são a F4)
    const membro = await this.dados.membroDoServidor(guildId, bot.botUserId);
    if (!membro) throw servidorDesconhecido();
    return guildId;
  }
}

@Controller("v9/guilds")
export class GuildsCompatControllerV9 extends GuildsCompatController {}
