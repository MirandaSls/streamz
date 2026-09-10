import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { doBitfieldDoDiscord } from "@streamz/shared";
import type { RoleInput } from "@streamz/shared";
import { zodBody } from "../../../common/zod.pipe";
import { RolesService } from "../../roles/roles.service";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import { cargoDesconhecido, corpoInvalido, FiltroDeErrosDoDiscord } from "../erros";
import { IdsService } from "../ids.service";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { BotAutenticado, CargoDoDiscord } from "../tipos";
import { cargoParaDiscord } from "../traducao/cargo";
import { cargoAlvo, servidorDoBot } from "./alvos";
import { BotAtual } from "./bot-atual";
import { corDoDiscord, corpoDeCargoSchema, type CorpoDeCargo } from "./corpos-membros";

/**
 * ── F5 membros ── Criar e editar cargo.
 *
 * | Método | Rota |
 * |---|---|
 * | POST | `/guilds/:gid/roles` |
 * | PATCH | `/guilds/:gid/roles/:rid` |
 *
 * (O `GET /guilds/:id/roles` é da F1 e continua no `GuildsCompatController`.)
 *
 * Saiu barato porque o `RolesService` já faz tudo: `MANAGE_ROLES`, a
 * hierarquia (`assertPodeMexerNoCargo`), a recusa de conceder permissão que o
 * próprio ator não tem (`validarPermissoes` — sem ela, `MANAGE_ROLES` seria
 * `ADMINISTRATOR` em duas chamadas), a posição de nascimento logo abaixo do
 * teto do criador, e o `role.created`/`role.updated` que o web e a ponte dos
 * bots já escutam. A casca traduz três coisas na entrada e o cargo inteiro na
 * saída:
 *
 * 1. **`permissions`** — string decimal de 64 bits do Discord →
 *    `doBitfieldDoDiscord` → os nossos 21 bits. Os 35 sem par são descartados
 *    em silêncio (§6): um bot que pede `MANAGE_THREADS` não recebe erro, ele
 *    simplesmente não ganha nada, porque a coisa não existe aqui.
 * 2. **`color`** — inteiro `0xRRGGBB` → `"#rrggbb"`; 0 é "sem cor" (`null`).
 * 3. **A resposta** — `RolesService` devolve o DTO de `@streamz/shared` (cuid,
 *    sem snowflake) e o Discord quer o número; a linha é relida com o
 *    snowflake junto, como o `POST /messages` já fazia.
 *
 * **`PATCH` do `@everyone`:** o `RolesService.update` aceita mudar só as
 * permissões dele (nome, cor e hierarquia do `@everyone` não são editáveis) e
 * ignora o resto em silêncio — que é o comportamento do Discord.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/guilds/:gid/roles")
export class CargosCompatController {
  constructor(
    private readonly dados: DadosDeCompatService,
    private readonly ids: IdsService,
    private readonly cargos: RolesService,
  ) {}

  @Post()
  async criar(
    @BotAtual() bot: BotAutenticado,
    @Param("gid") gid: string,
    @Body(zodBody(corpoDeCargoSchema)) corpo: CorpoDeCargo,
  ): Promise<CargoDoDiscord> {
    const guildId = await servidorDoBot(this.ids, this.dados, bot, gid);
    const criado = await this.cargos.create(bot.botUserId, guildId, paraRoleInput(corpo));
    return this.reler(guildId, criado.id);
  }

  @Patch(":rid")
  async editar(
    @BotAtual() bot: BotAutenticado,
    @Param("gid") gid: string,
    @Param("rid") rid: string,
    @Body(zodBody(corpoDeCargoSchema)) corpo: CorpoDeCargo,
  ): Promise<CargoDoDiscord> {
    const guildId = await servidorDoBot(this.ids, this.dados, bot, gid);
    const alvo = await cargoAlvo(this.dados, guildId, rid);
    await this.cargos.update(bot.botUserId, guildId, alvo.id, paraRoleInput(corpo));
    return this.reler(guildId, alvo.id);
  }

  /** O cargo recém-escrito, relido com o snowflake (o DTO do service não o tem). */
  private async reler(guildId: string, roleId: string): Promise<CargoDoDiscord> {
    const cargos = await this.dados.cargosDoServidor(guildId);
    const linha = cargos.find((c) => c.id === roleId);
    if (!linha) throw cargoDesconhecido();
    return cargoParaDiscord(linha);
  }
}

@Controller("v9/guilds/:gid/roles")
export class CargosCompatControllerV9 extends CargosCompatController {}

/**
 * Corpo do Discord → `RoleInput` do Streamz. Puro, e exportado para o teste.
 *
 * Campo ausente continua ausente (o `RolesService` só toca no que veio); `null`
 * em `color` é "sem cor". `permissions` chega como string decimal — é assim que
 * o discord.js serializa um bitfield de 64 bits, e lê-lo como `number` perderia
 * os bits acima de 2^53 em silêncio.
 */
export function paraRoleInput(corpo: CorpoDeCargo): RoleInput {
  const entrada: RoleInput = {};
  if (corpo.name !== undefined) entrada.name = corpo.name;
  if (corpo.hoist !== undefined && corpo.hoist !== null) entrada.hoist = corpo.hoist;
  if (corpo.mentionable !== undefined && corpo.mentionable !== null) {
    entrada.mentionable = corpo.mentionable;
  }
  const cor = corDoDiscord(corpo.color);
  if (cor !== undefined) entrada.color = cor;
  if (corpo.permissions !== undefined && corpo.permissions !== null) {
    entrada.permissions = doBitfieldDoDiscord(bitsDoDiscord(corpo.permissions));
  }
  return entrada;
}

/** `"137411140374081"` → bigint. Texto que não é número leva 50035. */
function bitsDoDiscord(valor: string | number): bigint {
  try {
    return BigInt(valor);
  } catch {
    throw corpoInvalido({
      permissions: {
        _errors: [{ code: "BASE_TYPE_CHOICES", message: "Value must be a valid permission bitfield" }],
      },
    });
  }
}
