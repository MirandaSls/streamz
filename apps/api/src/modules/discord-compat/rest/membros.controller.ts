import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Put,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { GuildsService } from "../../guilds/guilds.service";
import { ModerationService } from "../../moderation/moderation.service";
import { RolesService } from "../../roles/roles.service";
import { BotTokenGuard } from "../bot-token.guard";
import { DadosDeCompatService } from "../dados.service";
import {
  banimentoDesconhecido,
  corpoInvalido,
  FiltroDeErrosDoDiscord,
  membroDesconhecido,
  semPermissao,
} from "../erros";
import { IdsService } from "../ids.service";
import { RateLimitDoDiscordInterceptor } from "../rate-limit.interceptor";
import type { BotAutenticado, JsonDoDiscord, MembroDoDiscord } from "../tipos";
import { membroParaDiscord } from "../traducao/membro";
import { usuarioParaDiscord } from "../traducao/usuario";
import { cargoAlvo, membroAlvo, servidorDoBot } from "./alvos";
import { BotAtual } from "./bot-atual";
import {
  banimentoSchema,
  edicaoDeMembroSchema,
  type CorpoDeBanimento,
  type EdicaoDeMembro,
} from "./corpos-membros";
import { zodBody } from "../../../common/zod.pipe";

/**
 * ── F5 membros ── As rotas de escrita sobre um membro: cargo, apelido,
 * castigo e expulsão.
 *
 * | Método | Rota | Exige |
 * |---|---|---|
 * | PUT | `/guilds/:gid/members/:uid/roles/:rid` | `MANAGE_ROLES` + hierarquia |
 * | DELETE | `/guilds/:gid/members/:uid/roles/:rid` | idem |
 * | PATCH | `/guilds/:gid/members/:uid` | conforme o campo |
 * | DELETE | `/guilds/:gid/members/:uid` | `KICK_MEMBERS` + hierarquia |
 *
 * **Nada de regra nova aqui.** `RolesService.assign/unassign`,
 * `ModerationService.timeout/removeTimeout` e `ModerationService.kick` são os
 * mesmos métodos que a tela do Streamz chama; o que esta casca faz é traduzir
 * snowflake → cuid na entrada, o membro para o formato do Discord na saída, e
 * `ForbiddenException`/`NotFoundException` para `50013`/`10007` no meio (§3, "a
 * compatibilidade é uma casca").
 *
 * **O tempo real sai de graça, e é por isso que se chama o service.**
 * `RolesService.assign` termina em `aposMudarCargosDoMembro`, que emite
 * `member.updated` para a sala do servidor; o `useRealtime` do web já o escuta
 * (`apps/web/hooks/useRealtime.ts`) e a lista de membros muda **sem F5**. O
 * mesmo `member.updated` é o que a `PonteDeEventos` traduz em
 * `GUILD_MEMBER_UPDATE` para as outras sessões de bot (`gateway/dispatch.ts`).
 * Se a casca gravasse `GuildMemberRole` na mão, as duas pontas ficariam mudas.
 *
 * **Duas divergências declaradas** (também no §5 do documento):
 *
 * 1. **`nick`** — o Streamz agora tem apelido por servidor (menus de
 *    contexto, `GuildMember.nickname`, exposto na leitura por
 *    `membroParaDiscord`), mas **editar** por aqui continua fora de escopo: o
 *    §6 já lista `MANAGE_NICKNAMES` entre as permissões **sempre apagadas** na
 *    tradução para o Discord, e esta entrega não criou o bit
 *    `CHANGE_NICKNAME`. Um `nick` com texto leva **50013**, que é o que o bot
 *    lê no bitfield antes de tentar; ignorar em silêncio devolveria 200 a uma
 *    mudança que nunca aconteceu. `nick: null` (limpar) é um no-op que passa
 *    mesmo sem apelido — limpar o que já está limpo é verdade.
 * 2. **`mute`/`deaf`/`channel_id`** — silenciar e mover na voz. `mute`/`deaf`
 *    do Discord são estado do servidor sobre a call; o nosso vive no
 *    `VoiceStateStore` (F2) e não no membro. Ignorados em silêncio: são campos
 *    que o discord.js manda junto num `edit()` genérico, e recusá-los quebraria
 *    um PATCH que só queria mexer nos cargos.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/guilds/:gid/members")
export class MembrosCompatController {
  constructor(
    private readonly dados: DadosDeCompatService,
    private readonly ids: IdsService,
    private readonly cargos: RolesService,
    private readonly moderacao: ModerationService,
    private readonly guilds: GuildsService,
  ) {}

  /**
   * Dá um cargo a um membro. **204 sem corpo**, como no Discord.
   *
   * É a rota do `guild.members.addRole()` / `member.roles.add()` — a que três
   * dos quatro bots oficiais usam. A hierarquia é a de `assertPodeMexerNoCargo`:
   * o cargo alvo precisa estar **estritamente abaixo** do cargo mais alto do
   * bot, senão `MANAGE_ROLES` valeria `ADMINISTRATOR` (bastava criar um cargo
   * com tudo ligado e vesti-lo). Quem recusa é o `GuildsService`; aqui o
   * `ForbiddenException` dele vira o `50013` que a lib classifica.
   *
   * Idempotente: dar de novo um cargo que o membro já tem responde 204 (o
   * `upsert` do service não reclama), como no Discord.
   */
  @Put(":uid/roles/:rid")
  @HttpCode(204)
  async darCargo(
    @BotAtual() bot: BotAutenticado,
    @Param("gid") gid: string,
    @Param("uid") uid: string,
    @Param("rid") rid: string,
  ): Promise<void> {
    const guildId = await servidorDoBot(this.ids, this.dados, bot, gid);
    const { userId } = await membroAlvo(this.ids, this.dados, guildId, uid);
    const cargo = await cargoAlvo(this.dados, guildId, rid, { paraAtribuir: true });
    await this.cargos.assign(bot.botUserId, guildId, userId, cargo.id);
  }

  /** Tira o cargo. 204, e tirar o que ele não tem também é 204. */
  @Delete(":uid/roles/:rid")
  @HttpCode(204)
  async tirarCargo(
    @BotAtual() bot: BotAutenticado,
    @Param("gid") gid: string,
    @Param("uid") uid: string,
    @Param("rid") rid: string,
  ): Promise<void> {
    const guildId = await servidorDoBot(this.ids, this.dados, bot, gid);
    const { userId } = await membroAlvo(this.ids, this.dados, guildId, uid);
    const cargo = await cargoAlvo(this.dados, guildId, rid, { paraAtribuir: true });
    await this.cargos.unassign(bot.botUserId, guildId, userId, cargo.id);
  }

  /**
   * Edita o membro: `roles` (substitui o conjunto), `nick` e
   * `communication_disabled_until` (o castigo).
   *
   * `roles` é **substituição**, não soma — é o `member.roles.set([...])` do
   * discord.js. O diff é feito aqui e aplicado cargo a cargo pelo
   * `RolesService`, para que cada um passe pela hierarquia: um `set` que
   * incluísse um cargo acima do bot precisa ser recusado, e um `deleteMany` +
   * `createMany` na mão pularia essa checagem.
   *
   * A ordem — validar tudo, depois aplicar — é de propósito: um PATCH que
   * mexesse nos cargos e só então descobrisse que o castigo é inválido deixaria
   * metade do pedido feito, e o bot não teria como saber qual metade.
   */
  @Patch(":uid")
  async editar(
    @BotAtual() bot: BotAutenticado,
    @Param("gid") gid: string,
    @Param("uid") uid: string,
    @Body(zodBody(edicaoDeMembroSchema)) corpo: EdicaoDeMembro,
    @Headers("x-audit-log-reason") motivo?: string,
  ): Promise<MembroDoDiscord> {
    const guildId = await servidorDoBot(this.ids, this.dados, bot, gid);
    const { userId } = await membroAlvo(this.ids, this.dados, guildId, uid);

    // ── validação, antes de escrever qualquer coisa ──
    // editar apelido por esta casca não existe (ver o cabeçalho da classe)
    if (typeof corpo.nick === "string" && corpo.nick.trim().length > 0) throw semPermissao();

    const desejados = corpo.roles === undefined ? null : await this.cargosPedidos(guildId, corpo.roles);
    const castigo = this.castigoPedido(corpo);

    // ── escrita ──
    if (desejados !== null) {
      const atuais = new Set(await this.guilds.roleIdsOf(guildId, userId));
      const alvo = new Set(desejados);
      for (const id of alvo) if (!atuais.has(id)) await this.cargos.assign(bot.botUserId, guildId, userId, id);
      for (const id of atuais) if (!alvo.has(id)) await this.cargos.unassign(bot.botUserId, guildId, userId, id);
    }

    if (castigo === null) {
      await this.moderacao.removeTimeout(bot.botUserId, guildId, userId, motivo);
    } else if (castigo !== undefined) {
      await this.moderacao.timeout(bot.botUserId, guildId, userId, {
        until: castigo,
        reason: motivo,
      });
    }

    const membro = await this.dados.membroDoServidor(guildId, userId);
    // o membro sumiu entre a escrita e a releitura (saiu, ou foi expulso por
    // outra via): para o bot é o mesmo que não existir
    if (!membro) throw membroDesconhecido();
    return membroParaDiscord(membro);
  }

  /**
   * Expulsa (`member.kick()`). 204.
   *
   * `ModerationService.kick` é o mesmo caminho do botão da tela: ele delega a
   * `GuildsService.kick` (permissão `KICK_MEMBERS`, hierarquia, auditoria,
   * corte das salas ao vivo e `member.left`) e avisa o expulso na DM. A ponte
   * traduz o `member.left` em `GUILD_MEMBER_REMOVE` para os outros bots.
   */
  @Delete(":uid")
  @HttpCode(204)
  async expulsar(
    @BotAtual() bot: BotAutenticado,
    @Param("gid") gid: string,
    @Param("uid") uid: string,
    @Headers("x-audit-log-reason") motivo?: string,
  ): Promise<void> {
    const guildId = await servidorDoBot(this.ids, this.dados, bot, gid);
    const { userId } = await membroAlvo(this.ids, this.dados, guildId, uid);
    await this.moderacao.kick(bot.botUserId, guildId, userId, { reason: motivo });
  }

  // ── internos ───────────────────────────────────────────────

  /**
   * Os snowflakes do `roles` → cuids, recusando o que não é cargo daqui.
   *
   * O `@everyone` é **descartado em silêncio** em vez de virar 50028: no
   * Discord ele é implícito e várias libs o mandam de volta sem querer num
   * `set()` montado a partir de `member.roles.cache`. Recusar o pedido inteiro
   * por causa dele seria pedante; na rota de um cargo só (`PUT .../roles/:rid`)
   * o gesto é explícito e aí o 50028 vale.
   */
  private async cargosPedidos(guildId: string, snowflakes: string[]): Promise<string[]> {
    const cuids: string[] = [];
    for (const s of snowflakes) {
      const cargo = await cargoAlvo(this.dados, guildId, s);
      if (!cargo.isDefault) cuids.push(cargo.id);
    }
    return cuids;
  }

  /**
   * `communication_disabled_until` → o que o `ModerationService` recebe.
   *
   * Três estados: ausente (`undefined`, não mexe), `null` (tira o castigo) e
   * uma data ISO (põe). Data que não é data leva 50035 com o campo apontado —
   * o `calcularFim` recusaria depois, mas com uma frase em português que a lib
   * do bot não classifica.
   */
  private castigoPedido(corpo: EdicaoDeMembro): string | null | undefined {
    const valor = corpo.communication_disabled_until;
    if (valor === undefined) return undefined;
    if (valor === null) return null;
    if (!Number.isFinite(new Date(valor).getTime())) {
      throw corpoInvalido({
        communication_disabled_until: {
          _errors: [{ code: "DATE_TIME_TYPE_CONVERT", message: "Could not parse the datetime." }],
        },
      });
    }
    return valor;
  }

}

@Controller("v9/guilds/:gid/members")
export class MembrosCompatControllerV9 extends MembrosCompatController {}

/**
 * ── F5 membros ── Banimento: `PUT`, `DELETE` e a lista.
 *
 * | Método | Rota | Exige |
 * |---|---|---|
 * | GET | `/guilds/:gid/bans` | `BAN_MEMBERS` |
 * | PUT | `/guilds/:gid/bans/:uid` | `BAN_MEMBERS` + `MODERATE_MEMBERS` |
 * | DELETE | `/guilds/:gid/bans/:uid` | `BAN_MEMBERS` |
 *
 * **A regra é a do `ModerationService.ban`**, não uma cópia: ele valida a
 * hierarquia, apaga as mensagens recentes do banido (é o
 * `delete_message_seconds` do Discord, convertido para as horas que ele
 * recebe), chama o `GuildsService.ban` — que grava a linha de `Ban`, tira o
 * membro, registra a auditoria e emite `member.left` — e avisa o banido na DM.
 *
 * **Divergência declarada:** banir pela casca exige `MODERATE_MEMBERS` **além**
 * de `BAN_MEMBERS`, porque o `assertPodeAgirSobre` do `ModerationService` pede
 * a primeira antes de qualquer coisa. No Discord `BAN_MEMBERS` basta. Não
 * duplicamos a regra para consertar a diferença: um segundo caminho de
 * autorização é exatamente o que o ADR-0002 proíbe. Fica no §5 do documento, e
 * na prática o cargo de um bot de moderação tem as duas.
 */
@SkipThrottle()
@UseFilters(FiltroDeErrosDoDiscord)
@UseInterceptors(RateLimitDoDiscordInterceptor)
@UseGuards(BotTokenGuard)
@Controller("v10/guilds/:gid/bans")
export class BanimentosCompatController {
  constructor(
    private readonly dados: DadosDeCompatService,
    private readonly ids: IdsService,
    private readonly guilds: GuildsService,
    private readonly moderacao: ModerationService,
  ) {}

  /**
   * A lista de banidos, no formato do Discord (`[{ reason, user }]`).
   *
   * `GuildsService.listBans` faz a checagem de permissão e a leitura; o que
   * falta é o snowflake de cada banido, que o DTO interno não carrega —
   * `snowflakesEmLote` resolve todos numa consulta só.
   *
   * **Sem paginação:** o Discord aceita `?limit&before&after` aqui. Um servidor
   * do Streamz tem dezenas de banidos, não milhares, e o `guild.bans.fetch()`
   * do discord.js lê a lista inteira quando não passa cursor — que é o caso de
   * todo bot que a usa para um `/banidos`. Declarado no §5.
   */
  @Get()
  async lista(
    @BotAtual() bot: BotAutenticado,
    @Param("gid") gid: string,
  ): Promise<JsonDoDiscord[]> {
    const guildId = await servidorDoBot(this.ids, this.dados, bot, gid);
    const banidos = await this.guilds.listBans(bot.botUserId, guildId);
    const snowflakes = await this.ids.snowflakesEmLote(
      "user",
      banidos.map((b) => b.user.id),
    );
    return banidos
      .filter((b) => snowflakes.has(b.user.id))
      .map((b) => ({
        reason: b.reason,
        user: usuarioParaDiscord({
          id: b.user.id,
          snowflake: snowflakes.get(b.user.id) as bigint,
          username: b.user.username,
          displayName: b.user.displayName,
          isBot: b.user.bot ?? false,
        }),
      }));
  }

  /**
   * Bane. 204 sem corpo, e **idempotente**: banir quem já está banido responde
   * 204 no Discord.
   *
   * `delete_message_seconds` (0..604800) é o campo de hoje; o antigo
   * `delete_message_days` também é aceito. Os dois viram **horas**, que é a
   * unidade do `ModerationService.ban` — arredondadas para cima, para que
   * "apaga a última hora" nunca apague menos do que o bot pediu.
   */
  @Put(":uid")
  @HttpCode(204)
  async banir(
    @BotAtual() bot: BotAutenticado,
    @Param("gid") gid: string,
    @Param("uid") uid: string,
    @Body(zodBody(banimentoSchema)) corpo: CorpoDeBanimento,
    @Headers("x-audit-log-reason") motivoDoCabecalho?: string,
  ): Promise<void> {
    const guildId = await servidorDoBot(this.ids, this.dados, bot, gid);
    const { userId } = await membroAlvo(this.ids, this.dados, guildId, uid);
    // **Divergência declarada:** no Discord dá para banir quem nunca entrou no
    // servidor (o `guild.bans.create()` aceita um id qualquer). Aqui não: a
    // regra do Streamz mora no `ModerationService`, que age sobre um
    // `GuildMember` — sem linha de membro não há hierarquia a comparar. Quem
    // não é membro (inclusive quem já está banido) leva **10007**, e não um
    // 204 mentiroso. Ver o §5 do documento.
    await this.moderacao.ban(bot.botUserId, guildId, userId, {
      reason: corpo.reason ?? motivoDoCabecalho,
      deleteMessageHours: horasDeLimpeza(corpo),
    });
  }

  /** Desbane. 204; quem não estava banido leva **10026 Unknown Ban**. */
  @Delete(":uid")
  @HttpCode(204)
  async desbanir(
    @BotAtual() bot: BotAutenticado,
    @Param("gid") gid: string,
    @Param("uid") uid: string,
  ): Promise<void> {
    const guildId = await servidorDoBot(this.ids, this.dados, bot, gid);
    // o banido **não é membro** do servidor: `membroAlvo` não serve aqui, e o
    // usuário é resolvido pelo id global
    const userId = await this.ids.cuidDeUsuario(uid);
    if (!userId || !(await this.guilds.isBanned(guildId, userId))) throw banimentoDesconhecido();
    await this.guilds.unban(bot.botUserId, guildId, userId);
  }
}

@Controller("v9/guilds/:gid/bans")
export class BanimentosCompatControllerV9 extends BanimentosCompatController {}

/**
 * `delete_message_seconds`/`delete_message_days` → horas, arredondadas para
 * cima. Exportada para o teste: é aritmética de unidade, e errar aqui apaga
 * mensagem a mais (ou a menos) sem que nada dê erro.
 */
export function horasDeLimpeza(corpo: CorpoDeBanimento): number {
  const segundos =
    corpo.delete_message_seconds ??
    (corpo.delete_message_days === undefined ? 0 : corpo.delete_message_days * 86_400);
  return Math.ceil(segundos / 3600);
}
