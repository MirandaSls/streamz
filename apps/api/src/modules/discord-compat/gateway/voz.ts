import { Injectable, Logger } from "@nestjs/common";
import { Permission, hasPermission } from "@streamz/shared";
import { GuildsService } from "../../guilds/guilds.service";
import { VoiceService } from "../../voice/voice.service";
import { DadosDeCompatService } from "../dados.service";
import { IdsService } from "../ids.service";
import { membroParaDiscord } from "../traducao/membro";
import type { JsonDoDiscord, MembroDoDiscord } from "../tipos";
import { RegistroDeSessoes, type SessaoDoBot } from "./sessao";

/**
 * O `op 4 VOICE_STATE_UPDATE` — a porta de entrada da voz (§8, D5.6/D5.7).
 *
 * ── Lote B da F2 implementa. ──
 *
 * O caminho inteiro, na ordem do §8:
 *
 * ```
 * bot → op 4 {guild_id, channel_id, self_mute, self_deaf}
 *   ├─ traduz os snowflakes (IdsService)
 *   ├─ confere que o canal é de VOZ **daquele** servidor
 *   ├─ checa CONNECT e SPEAK pelo caminho de permissões que já existe
 *   ├─ assina o JWT da ponte (VoiceService.assinarTokenDaPonte)
 *   ├─ VoiceService.join(bot, canal, {muted:false, deafened:true, …})
 *   │     └─► voice.state → o bot aparece na coluna e no palco do web,
 *   │         sem uma linha de UI nova
 *   ├─ despacha VOICE_STATE_UPDATE (com o session_id **desta** sessão)
 *   └─ e logo atrás VOICE_SERVER_UPDATE {token, guild_id, endpoint}
 * ```
 *
 * `channel_id: null` é sair: `voice.leave` e o `VOICE_STATE_UPDATE` com
 * `channel_id: null` — **sem** `VOICE_SERVER_UPDATE` atrás.
 *
 * **Por que a ordem importa:** o `@discordjs/voice` guarda o pacote de estado
 * (`addStatePacket`, que só grava) e é o pacote de **servidor** que dispara o
 * `configureNetworking()`. Mandar o `VOICE_SERVER_UPDATE` antes do
 * `VOICE_STATE_UPDATE` faria a lib tentar conectar sem `session_id` — que é
 * justamente o que ela manda no `IDENTIFY` do gateway de voz.
 *
 * **Por que assinamos o token antes de entrar na sala:** sem `PONTE_VOZ_SEGREDO`
 * ou sem as credenciais do LiveKit não há áudio possível. Entrar assim mesmo
 * poria o bot na coluna do web mudo para sempre — e o dono ficaria procurando o
 * defeito no bot. Falhando cedo, o `voice.join` nem acontece.
 *
 * **Um op 4 inválido não fecha a conexão.** O Discord ignora o que não entende
 * aqui, e um close por causa de uma atualização de presença de voz malformada
 * derrubaria um bot que funciona. Recusa vira log, não `FECHAMENTO`.
 */

/** O `d` do op 4, do que nos interessa. */
export interface CorpoDaAtualizacaoDeVoz {
  guild_id: string;
  /** `null` = sair do canal. */
  channel_id: string | null;
  self_mute: boolean;
  self_deaf: boolean;
}

/** Recusa de leitura: vira log, nunca close (ver o cabeçalho). */
export type RecusaDeVoz = { ok: false; razao: string };

function objeto(d: unknown): Record<string, unknown> | null {
  if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
  return d as Record<string, unknown>;
}

/**
 * Lê o `d` do op 4 como o discord.js o manda.
 *
 * O payload real do `@discordjs/voice` (`VoiceConnection.sendVoiceStateUpdate`)
 * é `{guild_id, channel_id, self_deaf, self_mute}` — os dois booleanos sempre
 * presentes, o `channel_id` `null` na saída. O `guild_id` chega como string
 * decimal; um número aqui (algum cliente antigo) é aceito e convertido, porque
 * recusar custaria a conexão de voz inteira por causa de um tipo.
 */
export function lerAtualizacaoDeVoz(
  d: unknown,
): { ok: true; corpo: CorpoDaAtualizacaoDeVoz } | RecusaDeVoz {
  const corpo = objeto(d);
  if (!corpo) return { ok: false, razao: "op 4 sem corpo" };

  const guildId = comoSnowflake(corpo.guild_id);
  if (guildId === null) return { ok: false, razao: "op 4 sem guild_id" };

  const canalBruto = corpo.channel_id;
  let channelId: string | null;
  if (canalBruto === null || canalBruto === undefined) {
    channelId = null;
  } else {
    channelId = comoSnowflake(canalBruto);
    if (channelId === null) return { ok: false, razao: "op 4 com channel_id inválido" };
  }

  return {
    ok: true,
    corpo: {
      guild_id: guildId,
      channel_id: channelId,
      self_mute: corpo.self_mute === true,
      self_deaf: corpo.self_deaf === true,
    },
  };
}

/** String decimal não vazia (ou número inteiro, que alguns clientes mandam). */
function comoSnowflake(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() === "" ? null : valor.trim();
  if (typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0) return String(valor);
  return null;
}

/** O que o `VOICE_STATE_UPDATE` precisa saber, já em snowflake. */
export interface EstadoDeVozParaDiscord {
  /** `null` dentro do `GUILD_CREATE`, onde o campo **não** existe. */
  guildSnowflake: string | null;
  /** `null` = saiu do canal. */
  canalSnowflake: string | null;
  usuarioSnowflake: string;
  sessionId: string;
  membro: MembroDoDiscord | null;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  selfStream: boolean;
}

/**
 * Monta o `d` de um `VOICE_STATE_UPDATE` (e cada item de `voice_states` no
 * `GUILD_CREATE`, que é o mesmo objeto **sem** `guild_id`).
 *
 * O que as libs leem sem default, e por isso está tudo aqui: `session_id`
 * (`@discordjs/voice` o repassa ao gateway de voz), `channel_id`, `user_id`,
 * `deaf`/`mute` (o silenciamento **do servidor**, que não temos: sempre false) e
 * `self_deaf`/`self_mute`/`self_video`/`self_stream` (o do próprio usuário, que
 * é o nosso estado de voz). `suppress` e `request_to_speak_timestamp` são de
 * palco (stage), que não existe aqui.
 */
export function estadoDeVozParaDiscord(e: EstadoDeVozParaDiscord): JsonDoDiscord {
  const estado: JsonDoDiscord = {
    channel_id: e.canalSnowflake,
    user_id: e.usuarioSnowflake,
    session_id: e.sessionId,
    deaf: false,
    mute: false,
    self_deaf: e.selfDeaf,
    self_mute: e.selfMute,
    self_video: e.selfVideo,
    self_stream: e.selfStream,
    suppress: false,
    request_to_speak_timestamp: null,
  };
  // Dentro do `GUILD_CREATE` o Discord manda o estado **sem** `guild_id` (é
  // implícito); num dispatch solto ele é obrigatório.
  if (e.guildSnowflake !== null) estado.guild_id = e.guildSnowflake;
  if (e.membro) estado.member = { ...e.membro };
  return estado;
}

/**
 * Como o bot entra na sala, do lado do estado de voz.
 *
 * Fixo, e não o que o op 4 pediu, porque é o que a **ponte** realmente faz: ela
 * publica (`canPublish: true`) e não assina nada (`canSubscribe: false`, §D5.6 —
 * bot de música não escuta). Um `self_deaf: false` vindo do bot seria uma
 * promessa que o desenho não cumpre, e apareceria na coluna do web como "está
 * ouvindo".
 */
const FLAGS_DO_BOT = { muted: false, deafened: true, video: false, screen: false } as const;

@Injectable()
export class VozDoGateway {
  private readonly logger = new Logger(VozDoGateway.name);

  /**
   * Onde cada bot **pediu** para estar (`botUserId:guildId` → canal e sessão).
   *
   * É o que separa "o bot entrou pelo op 4" (o `voice.state` que o próprio
   * `join` emite, já tratado) de "um moderador moveu o bot" (um `voice.state`
   * para um canal que o bot não pediu). Só neste segundo caso o áudio precisa
   * de token novo: o Lavalink segue preso à sala velha da ponte até receber
   * um `VOICE_SERVER_UPDATE` com o endpoint/token da sala nova.
   */
  private readonly canalPedidoPeloBot = new Map<string, { canalId: string; sessaoId: string }>();

  constructor(
    private readonly ids: IdsService,
    private readonly dados: DadosDeCompatService,
    private readonly guilds: GuildsService,
    private readonly voz: VoiceService,
    private readonly registro: RegistroDeSessoes,
  ) {}

  /** O `op 4` inteiro. Nunca lança: quem chama é o laço do socket. */
  async tratarAtualizacaoDeVoz(sessao: SessaoDoBot, d: unknown): Promise<void> {
    const lido = lerAtualizacaoDeVoz(d);
    if (!lido.ok) {
      this.logger.warn(`op 4 recusado na sessão ${sessao.id}: ${lido.razao}`);
      return;
    }

    const guildId = await this.ids.cuidDeServidor(lido.corpo.guild_id);
    if (!guildId) {
      this.logger.warn(`op 4 para o servidor desconhecido ${lido.corpo.guild_id}`);
      return;
    }

    if (lido.corpo.channel_id === null) {
      await this.sair(sessao, guildId, lido.corpo.guild_id);
      return;
    }
    await this.entrar(sessao, guildId, lido.corpo);
  }

  /**
   * A ponte avisou que a sessão de voz caiu (§4 do CONTRATO-F2, §D5.7).
   *
   * Bot que caiu, caiu: a carência de 45 s do gateway do web **não** se aplica.
   * Devolve `false` quando não havia o que desconectar — a rota responde 204 do
   * mesmo jeito, porque uma ponte reavisando não é erro.
   */
  async desconectarPelaPonte(botSnowflake: string, canalSnowflake: string): Promise<boolean> {
    const botUserId = await this.ids.cuidDeUsuario(botSnowflake);
    const alvo = await this.ids.cuidDeCanalOuCategoria(canalSnowflake);
    if (!botUserId || !alvo || alvo.tipo !== "canal") {
      this.logger.warn(
        `ponte avisou a queda de bot=${botSnowflake} canal=${canalSnowflake}, que não existem aqui`,
      );
      return false;
    }

    const canal = await this.dados.canalPorCuid(alvo.id);
    const saiu = await this.voz.leave(botUserId, alvo.id);
    if (!saiu) {
      this.logger.debug(`ponte avisou a queda de ${botSnowflake}, que já não estava em ${alvo.id}`);
      return false;
    }

    if (canal?.guildId) this.canalPedidoPeloBot.delete(`${botUserId}:${canal.guildId}`);
    this.logger.log(`ponte caiu: ${botSnowflake} tirado do canal ${canalSnowflake}`);
    await this.despacharSaida(
      this.registro.porBot(botUserId),
      canal?.guildId ?? null,
      botUserId,
      botSnowflake,
      canal?.guildSnowflake === null || canal?.guildSnowflake === undefined
        ? null
        : String(canal.guildSnowflake),
    );
    return true;
  }

  // ── entrar ─────────────────────────────────────────────────

  private async entrar(
    sessao: SessaoDoBot,
    guildId: string,
    corpo: CorpoDaAtualizacaoDeVoz,
  ): Promise<void> {
    const canalSnowflake = corpo.channel_id;
    if (canalSnowflake === null) return; // já tratado em `tratarAtualizacaoDeVoz`

    const alvo = await this.ids.cuidDeCanalOuCategoria(canalSnowflake);
    if (!alvo || alvo.tipo !== "canal") {
      this.logger.warn(`op 4 para o canal desconhecido ${canalSnowflake}`);
      return;
    }

    const canal = await this.dados.canalPorCuid(alvo.id);
    // O canal tem de ser de voz **e daquele** servidor: sem a segunda metade,
    // um `guild_id` qualquer com o canal de outro servidor entraria numa sala
    // que o bot não deveria alcançar.
    if (!canal || canal.guildId !== guildId || canal.type !== "VOICE") {
      this.logger.warn(
        `op 4 recusado: o canal ${canalSnowflake} não é um canal de voz do servidor ${corpo.guild_id}`,
      );
      return;
    }

    // A permissão sai do mesmo caminho da web (a casca não reimplementa
    // permissão, §3): `assertCanViewChannel` lança quando o bot nem vê o canal.
    let permissoes: number;
    try {
      const acesso = await this.guilds.assertCanViewChannel(sessao.botUserId, alvo.id);
      permissoes = acesso.permissions;
    } catch (erro) {
      this.logger.warn(`op 4 recusado: o bot não vê ${canalSnowflake} — ${(erro as Error).message}`);
      return;
    }
    if (!hasPermission(permissoes, Permission.CONNECT)) {
      this.logger.warn(`op 4 recusado: o bot não tem CONNECT em ${canalSnowflake}`);
      return;
    }
    // SPEAK também, e antes de assinar: o token da ponte concede
    // `canPublish: true` sempre (§3), e assinar um para quem não pode falar
    // seria a permissão do Streamz valendo na coluna e não valendo no áudio.
    if (!hasPermission(permissoes, Permission.SPEAK)) {
      this.logger.warn(`op 4 recusado: o bot não tem SPEAK em ${canalSnowflake}`);
      return;
    }

    const aplicacao = await this.dados.aplicacaoPorCuid(sessao.applicationId);
    const botSnowflake = aplicacao?.bot.snowflake;
    if (!aplicacao || botSnowflake === undefined) {
      this.logger.error(`op 4: a aplicação ${sessao.applicationId} sumiu do banco`);
      return;
    }

    let assinado: { token: string; tamanho: number; endpoint: string };
    try {
      assinado = await this.voz.assinarTokenDaPonte({
        botSnowflake: String(botSnowflake),
        guildSnowflake: corpo.guild_id,
        sessionId: sessao.id,
        canalId: alvo.id,
        canalSnowflake,
        nome: aplicacao.name,
        botUserId: sessao.botUserId,
      });
    } catch (erro) {
      // Sem segredo da ponte ou sem LiveKit não há áudio possível — e o bot
      // fica esperando o `VOICE_SERVER_UPDATE` até estourar o relógio dele, que
      // é o que o Discord faria. O log é o que diz ao dono o que configurar.
      this.logger.error(`op 4: não deu para assinar o token da ponte — ${(erro as Error).message}`);
      return;
    }

    if (corpo.self_mute || !corpo.self_deaf) {
      // Não é erro: a ponte publica e não assina nada, e o estado que sai é o
      // real (ver `FLAGS_DO_BOT`).
      this.logger.debug(
        `op 4 pediu self_mute=${corpo.self_mute} self_deaf=${corpo.self_deaf}; ` +
          "a ponte é sempre publicar-e-não-ouvir",
      );
    }

    // Antes do `join`: o `voice.state` dele chega à ponte de eventos depois, e
    // já tem de encontrar o canal anotado para não tomá-lo por uma mudança.
    this.canalPedidoPeloBot.set(`${sessao.botUserId}:${guildId}`, {
      canalId: alvo.id,
      sessaoId: sessao.id,
    });
    await this.voz.join(sessao.botUserId, alvo.id, { ...FLAGS_DO_BOT });

    const membro = await this.dados.membroDoServidor(guildId, sessao.botUserId);
    sessao.despachar(
      "VOICE_STATE_UPDATE",
      estadoDeVozParaDiscord({
        guildSnowflake: corpo.guild_id,
        canalSnowflake,
        usuarioSnowflake: String(botSnowflake),
        sessionId: sessao.id,
        membro: membro ? membroParaDiscord(membro, true) : null,
        selfMute: FLAGS_DO_BOT.muted,
        selfDeaf: FLAGS_DO_BOT.deafened,
        selfVideo: FLAGS_DO_BOT.video,
        selfStream: FLAGS_DO_BOT.screen,
      }),
    );
    // **Logo atrás**, e nesta ordem (ver o cabeçalho).
    sessao.despachar("VOICE_SERVER_UPDATE", {
      token: assinado.token,
      guild_id: corpo.guild_id,
      endpoint: assinado.endpoint,
    });

    this.logger.log(
      `op 4: ${aplicacao.name} entrou no canal ${canalSnowflake} do servidor ${corpo.guild_id} ` +
        `(JWT da ponte: ${assinado.tamanho} bytes, endpoint ${assinado.endpoint})`,
    );
  }

  // ── movido por um moderador ────────────────────────────────

  /**
   * O bot caiu num canal que ele não pediu (`VoiceService.move`): reabre o
   * áudio lá.
   *
   * Sem isto o bot movido não recebia evento nenhum e o Lavalink continuava
   * ligado à sala antiga da ponte, tocando no canal velho. Manda o par de
   * sempre — `VOICE_STATE_UPDATE` (a lib atualiza `voiceChannelId`) e, colado,
   * `VOICE_SERVER_UPDATE` com token novo (o Lavalink reconecta na sala nova).
   *
   * Devolve `true` quando tratou o movimento. Nunca lança: roda na fila da
   * ponte de eventos.
   */
  async acompanharMovimento(
    botUserId: string,
    guildId: string,
    canalId: string,
  ): Promise<boolean> {
    const chave = `${botUserId}:${guildId}`;
    const pedido = this.canalPedidoPeloBot.get(chave);
    // Sem pedido anotado o bot nem entrou por aqui (ex.: entrada pela web);
    // com o mesmo canal é o eco do próprio `join` do op 4.
    if (!pedido || pedido.canalId === canalId) return false;

    const sessao = this.registro.porBot(botUserId).find((s) => s.id === pedido.sessaoId);
    if (!sessao) {
      this.canalPedidoPeloBot.delete(chave);
      return false;
    }
    try {
      const [canal, aplicacao] = await Promise.all([
        this.dados.canalPorCuid(canalId),
        this.dados.aplicacaoPorCuid(sessao.applicationId),
      ]);
      const alvo = canal?.snowflake ?? null;
      const botSnowflake = aplicacao?.bot.snowflake;
      if (alvo === null || !canal || canal.guildSnowflake == null || !aplicacao || botSnowflake === undefined) {
        this.logger.warn(`bot movido para ${canalId}, mas faltou dado para reabrir o áudio`);
        return false;
      }
      const guildSnowflake = String(canal.guildSnowflake);
      const assinado = await this.voz.assinarTokenDaPonte({
        botSnowflake: String(botSnowflake),
        guildSnowflake,
        sessionId: sessao.id,
        canalId,
        canalSnowflake: String(alvo),
        nome: aplicacao.name,
        botUserId,
      });
      this.canalPedidoPeloBot.set(chave, { canalId, sessaoId: sessao.id });

      const membro = await this.dados.membroDoServidor(guildId, botUserId);
      sessao.despachar(
        "VOICE_STATE_UPDATE",
        estadoDeVozParaDiscord({
          guildSnowflake,
          canalSnowflake: String(alvo),
          usuarioSnowflake: String(botSnowflake),
          sessionId: sessao.id,
          membro: membro ? membroParaDiscord(membro, true) : null,
          selfMute: FLAGS_DO_BOT.muted,
          selfDeaf: FLAGS_DO_BOT.deafened,
          selfVideo: FLAGS_DO_BOT.video,
          selfStream: FLAGS_DO_BOT.screen,
        }),
      );
      sessao.despachar("VOICE_SERVER_UPDATE", {
        token: assinado.token,
        guild_id: guildSnowflake,
        endpoint: assinado.endpoint,
      });
      this.logger.log(`bot movido: ${aplicacao.name} agora no canal ${alvo} do servidor ${guildSnowflake}`);
      return true;
    } catch (erro) {
      this.logger.error(`não deu para reabrir o áudio do bot movido — ${(erro as Error).message}`);
      return false;
    }
  }

  // ── tirado da voz ──────────────────────────────────────────

  /**
   * Alguém foi tirado da voz à força (`VoiceService.expulsarDaVoz`: o
   * "Desconectar" de um moderador, kick, ban). Se era um bot conectado por
   * aqui, despacha o `VOICE_STATE_UPDATE` com `channel_id: null` e o
   * `session_id` **real** de cada sessão dele.
   *
   * É esse evento que o lavalink-client lê para destruir o player
   * (`onDisconnect.destroyPlayer`), e ele exige `session_id` no payload. Sem
   * isto o bot desconectado pela interface seguia tocando para o Lavalink e o
   * `/tocar` seguinte achava o player "conectado" e nem pedia para entrar.
   *
   * Nunca lança: roda no fim de uma expulsão que já aconteceu.
   */
  async acompanharExpulsao(
    userId: string,
    canalId: string,
    guildId: string | null,
  ): Promise<void> {
    // conversa direta não tem bot em voz; e sem sessão no gateway compat não
    // há a quem avisar (humano, ou bot desconectado)
    if (!guildId) return;
    const sessoes = this.registro.porBot(userId);
    if (sessoes.length === 0) return;
    try {
      const chave = `${userId}:${guildId}`;
      // O pedido anotado era do canal de onde ele acabou de sair: sem apagá-lo,
      // um `voice.state` futuro seria lido como movimento de um canal velho.
      if (this.canalPedidoPeloBot.get(chave)?.canalId === canalId) {
        this.canalPedidoPeloBot.delete(chave);
      }
      // O canal pode já ter sido apagado (é um dos caminhos da expulsão); o
      // snowflake do servidor, então, sai direto do servidor.
      const canal = await this.dados.canalPorCuid(canalId);
      const bruto = canal?.guildSnowflake ?? (await this.ids.snowflakeDeServidor(guildId));
      const guildSnowflake = bruto === null || bruto === undefined ? null : String(bruto);
      if (guildSnowflake === null) {
        this.logger.warn(`bot ${userId} tirado da voz de ${guildId}, servidor sem snowflake`);
        return;
      }
      await this.despacharSaida(sessoes, guildId, userId, null, guildSnowflake);
      this.logger.log(`bot ${userId} tirado do canal ${canalId}: avisado com channel_id null`);
    } catch (erro) {
      this.logger.error(`não deu para avisar o bot tirado da voz — ${(erro as Error).message}`);
    }
  }

  // ── sair ───────────────────────────────────────────────────

  private async sair(
    sessao: SessaoDoBot,
    guildId: string,
    guildSnowflake: string,
  ): Promise<void> {
    const canalId = await this.canalDeVozDoBot(sessao.botUserId, guildId);
    if (!canalId) {
      this.logger.debug(`op 4 com channel_id null, mas o bot não estava em voz em ${guildId}`);
      return;
    }
    this.canalPedidoPeloBot.delete(`${sessao.botUserId}:${guildId}`);
    await this.voz.leave(sessao.botUserId, canalId);
    await this.despacharSaida([sessao], guildId, sessao.botUserId, null, guildSnowflake);
    this.logger.log(`op 4: o bot saiu do canal de voz do servidor ${guildSnowflake}`);
  }

  /**
   * O `VOICE_STATE_UPDATE` de saída: `channel_id: null` e **nada** atrás.
   *
   * É o sinal que o `@discordjs/voice` lê para destruir a conexão de voz — é por
   * ele que o bot para de tocar quando alguém o expulsa do canal.
   */
  private async despacharSaida(
    sessoes: readonly SessaoDoBot[],
    guildId: string | null,
    botUserId: string,
    botSnowflakeConhecido: string | null,
    guildSnowflake: string | null,
  ): Promise<void> {
    if (sessoes.length === 0 || guildSnowflake === null) return;

    const botSnowflake =
      botSnowflakeConhecido ?? String((await this.ids.snowflakeDeUsuario(botUserId)) ?? "");
    if (!botSnowflake) return;

    const membro = guildId ? await this.dados.membroDoServidor(guildId, botUserId) : null;
    for (const sessao of sessoes) {
      sessao.despachar(
        "VOICE_STATE_UPDATE",
        estadoDeVozParaDiscord({
          guildSnowflake,
          canalSnowflake: null,
          usuarioSnowflake: botSnowflake,
          sessionId: sessao.id,
          membro: membro ? membroParaDiscord(membro, true) : null,
          selfMute: false,
          selfDeaf: false,
          selfVideo: false,
          selfStream: false,
        }),
      );
    }
  }

  /** Em qual canal de voz **deste servidor** o bot está agora (ou null). */
  private async canalDeVozDoBot(botUserId: string, guildId: string): Promise<string | null> {
    for (const canalId of await this.voz.channelsOf(botUserId)) {
      const canal = await this.dados.canalPorCuid(canalId);
      if (canal?.guildId === guildId && canal.type === "VOICE") return canalId;
    }
    return null;
  }
}
