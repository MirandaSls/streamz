import { Injectable, Logger } from "@nestjs/common";
import { WS_EVENTS } from "@streamz/shared";
import { GuildsService } from "../../guilds/guilds.service";
import type { AlvoDoEvento } from "../../realtime/realtime.service";
import { RealtimeService } from "../../realtime/realtime.service";
import { VoiceService } from "../../voice/voice.service";
import { DadosDeCompatService } from "../dados.service";
import { IdsService } from "../ids.service";
import { ReacoesDeCompatService } from "../reacoes.service";
import { canalParaDiscord } from "../traducao/canal";
import { cargoParaDiscord } from "../traducao/cargo";
import { membroParaDiscord } from "../traducao/membro";
import { mensagemParaDiscord } from "../traducao/mensagem";
import { servidorParaDiscord } from "../traducao/servidor";
import { usuarioParaDiscord } from "../traducao/usuario";
import type { JsonDoDiscord, LinhaDeServidor } from "../tipos";
import { INTENT } from "../tipos";
import { RegistroDeSessoes, type SessaoDoBot } from "./sessao";
import { estadoDeVozParaDiscord } from "./voz";

/**
 * A ponte entre o tempo real de hoje e os dispatches do gateway compat.
 *
 * ── Lote D (ponte de eventos) implementa, depois do lote C. ──
 *
 * A regra do §7 é curta e vale sempre: **o gateway compat não inventa evento —
 * ele assina os mesmos que o web recebe e traduz.**
 *
 * ```
 * MessagesService.create()
 *   └─► RealtimeService.emitToChannel("channel:<id>", "message.new", MessageDTO)
 *          ├─► Socket.IO ──► navegador (nada muda)
 *          └─► PonteDeEventos ──► para cada sessão de bot com acesso ao canal:
 *                                  op 0 MESSAGE_CREATE (payload traduzido)
 * ```
 *
 * O gancho é o `RealtimeService.onEvent` — ouvintes **locais**, chamados junto
 * com o `emit`. Foi escolhido em vez de sniffar o adapter do Socket.IO porque
 * são quinze linhas, não cria dependência circular, funciona com e sem Redis e
 * é testável.
 *
 * Eventos da F1 (a coluna "fonte interna" é o nome no `WS_EVENTS`):
 *
 * | Dispatch | Fonte |
 * |---|---|
 * | `MESSAGE_CREATE` / `_UPDATE` / `_DELETE` | `message.new` / `.updated` / `.deleted` |
 * | `TYPING_START` | `typing` |
 * | `CHANNEL_CREATE/UPDATE/DELETE` | `channel.created/updated/deleted` |
 * | `GUILD_ROLE_CREATE/UPDATE/DELETE` | `role.created/updated/deleted` |
 * | `GUILD_MEMBER_ADD/REMOVE/UPDATE` | `member.joined/left/updated` |
 *
 * E os da F5 (reações granulares):
 *
 * | Dispatch | Fonte |
 * |---|---|
 * | `MESSAGE_REACTION_ADD` / `_REMOVE` | `reaction.added` / `reaction.removed` |
 * | `MESSAGE_REACTION_REMOVE_ALL` / `_REMOVE_EMOJI` | `reactions.cleared` (`emoji` null ou não) |
 *
 * Três armadilhas:
 *
 * 1. **Filtre por intent** (`INTENT` em `../tipos`) e por acesso: uma sessão só
 *    recebe o que o usuário-bot dela poderia ver.
 * 2. **Nunca mande de volta o que o próprio bot fez?** Não — o Discord *manda*.
 *    O bot recebe o `MESSAGE_CREATE` das mensagens dele mesmo, e as libs
 *    filtram por `message.author.bot`. Imitar o Discord aqui é o certo.
 * 3. **Reação era o ponto feio, e deixou de ser** (§7). Na F1 `reaction.add`
 *    resultava só em `message.updated` com a mensagem inteira, sem `user_id`,
 *    e o bot recebia um `MESSAGE_UPDATE` — a lib atualizava o cache e **não**
 *    disparava `messageReactionAdd`, então bot de "reaction roles" e de
 *    votação não funcionava. A F5 pôs o evento interno fino que faltava
 *    (`reaction.added`/`.removed`/`reactions.cleared`, em
 *    `messages/eventos-de-reacao.ts`) e é ele que vira os quatro
 *    `MESSAGE_REACTION_*`. O `message.updated` da reação **não chega mais
 *    aqui** — ele sai por `emitToChannelSemOuvintes`, para o navegador só —,
 *    de modo que `MESSAGE_UPDATE` voltou a querer dizer só uma coisa: a
 *    mensagem foi editada.
 *
 * **Buraco conhecido, achado nesta branch e relatado no PR:** o `ChatGateway`
 * emite `message.new`, `message.updated`, `message.deleted` e `typing` direto
 * no `this.server` do Socket.IO, **sem passar pelo `RealtimeService`**. O §7
 * desenhou o caminho como se `MessagesService.create` emitisse; ele não emite —
 * quem emite é o handler do gateway, logo depois. Enquanto esses quatro `emit`
 * não passarem pelo `RealtimeService`, a mensagem escrita **no navegador** não
 * chega ao bot (a escrita feita pelo próprio bot, pela REST compat, chega, se o
 * lote A emitir pelo `RealtimeService`). A tradução aqui já está pronta para os
 * dois caminhos: quando o `ChatGateway` mudar, não se mexe neste arquivo.
 */

/** Quantos pares cuid↔snowflake a ponte lembra (ver `MemoriaDeIds`). */
const TETO_DA_MEMORIA = 20_000;

/**
 * O que a ponte lembra de cada linha que já traduziu.
 *
 * Existe por causa dos **eventos de exclusão**: o `message.deleted` chega
 * depois de a linha ter sido apagada de verdade (`MessagesService.remove` faz
 * `prisma.message.delete`), então nem o `IdsService` nem o
 * `DadosDeCompatService` recuperam o snowflake — a linha não está mais lá. Como
 * a ponte já viu o número quando traduziu o `MESSAGE_CREATE` (ou quando montou
 * o `GUILD_CREATE`), guardá-lo é o que faz o `MESSAGE_DELETE`, o
 * `CHANNEL_DELETE` e o `GUILD_ROLE_DELETE` saírem com o id certo.
 */
class MemoriaDeIds {
  private readonly pares = new Map<string, bigint>();

  lembrar(tipo: string, cuid: string, snowflake: bigint): void {
    // é memória, não índice: estourou, esvazia
    if (this.pares.size >= TETO_DA_MEMORIA) this.pares.clear();
    this.pares.set(`${tipo}:${cuid}`, snowflake);
  }

  resolver(tipo: string, cuid: string): bigint | null {
    return this.pares.get(`${tipo}:${cuid}`) ?? null;
  }
}

/** Um payload interno qualquer, ainda não conferido. */
type Registro = Record<string, unknown>;

function objeto(dado: unknown): Registro | null {
  return typeof dado === "object" && dado !== null ? (dado as Registro) : null;
}

function cadeia(o: Registro | null, chave: string): string | null {
  const valor = o?.[chave];
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

/**
 * O `session_id` de quem **não** é bot.
 *
 * No Discord todo estado de voz tem uma sessão; aqui só o bot tem (é o
 * `session_id` do gateway compat, e o `voz.ts` o preenche). Para uma pessoa no
 * navegador não existe equivalente — e o campo não pode faltar: o discord.js lê
 * `data.session_id` no `VoiceState._patch` e o discord.py o guarda direto.
 *
 * Usamos o **snowflake do próprio usuário**: é estável entre eventos (as libs
 * comparam sessão para detectar reconexão), é opaco e não revela nada que o
 * evento já não carregue — ao contrário do cuid interno, que a casca esconde de
 * propósito.
 */
function sessaoSinteticaDe(snowflake: bigint): string {
  return String(snowflake);
}

@Injectable()
export class PonteDeEventos {
  private readonly logger = new Logger(PonteDeEventos.name);
  private readonly memoria = new MemoriaDeIds();

  /**
   * Fila de um só: traduzir é assíncrono (lê o banco) e o ouvinte é síncrono.
   * Sem a fila, duas mensagens seguidas poderiam chegar ao bot fora de ordem —
   * um `MESSAGE_UPDATE` antes do `MESSAGE_CREATE` da mesma mensagem é o tipo de
   * coisa que faz a lib guardar estado errado no cache dela.
   */
  private fila: Promise<void> = Promise.resolve();

  constructor(
    private readonly realtime: RealtimeService,
    private readonly registro: RegistroDeSessoes,
    private readonly dados: DadosDeCompatService,
    private readonly ids: IdsService,
    private readonly guilds: GuildsService,
    // F2: o `voice_states` do `GUILD_CREATE` sai daqui — é dele que o bot de
    // música sabe quem já está no canal antes de o primeiro `voice.state` cair.
    private readonly voz: VoiceService,
    // F5: quem resolve o emoji personalizado (token interno ↔ snowflake).
    private readonly reacoes: ReacoesDeCompatService,
  ) {}

  /**
   * Assina o `RealtimeService.onEvent`. Chamado uma vez, no `onModuleInit`.
   *
   * O ouvinte devolve na hora e enfileira o trabalho: ele roda **dentro** do
   * `emit` que o navegador espera, e não pode ficar esperando consulta nenhuma.
   */
  iniciar(): void {
    this.realtime.onEvent((alvo, evento, dado) => {
      // sem bot ligado não há o que traduzir — e não se toca no banco
      if (this.registro.todas().length === 0) return;
      this.fila = this.fila.then(() => this.tratar(alvo, evento, dado));
    });
    this.logger.log("ponte de eventos ligada: os dispatches do gateway compat saem daqui");
  }

  /**
   * O `GUILD_CREATE` completo de um servidor, na visão de um usuário-bot.
   *
   * Chamado pelo `identify.ts` (lote B) logo depois do READY, um por servidor.
   * É o payload mais perigoso da fase: incompleto, o `ready` nunca dispara e o
   * bot fica mudo **sem erro** (risco (a) do §12).
   *
   * O `botUserId` era decorativo na F1; **na F2 ele é o que lê o estado de
   * voz** — `VoiceService.statesForGuild` confere que quem pergunta é membro do
   * servidor, e é essa a visão que vai no `voice_states`.
   */
  async montarGuildCreate(guildId: string, botUserId: string): Promise<JsonDoDiscord> {
    const servidor = await this.dados.servidorCompleto(guildId);
    if (!servidor) throw new Error(`servidor ${guildId} não encontrado`);
    this.memorizarServidor(servidor);
    const payload = servidorParaDiscord(servidor, true);
    // A tradução é pura (sem Prisma, sem estado efêmero) e por isso deixa o
    // `voice_states` vazio; quem tem a store de voz em mãos é a ponte.
    payload.voice_states = await this.estadosDeVozDoServidor(servidor, botUserId);
    return payload;
  }

  /**
   * Quem já está nos canais de voz do servidor, no formato do Discord.
   *
   * É a peça que faz o bot de música saber, no `ready`, que existe gente numa
   * call — sem ela um `!play` logo depois de o bot subir acharia o canal vazio.
   *
   * Falhar aqui **não** pode custar o `GUILD_CREATE` inteiro: um servidor a
   * menos trava o `ready` do bot (risco (a) do §12), e ficar sem a lista de voz
   * é só ficar sem ela até o primeiro `voice.state`.
   */
  private async estadosDeVozDoServidor(
    g: LinhaDeServidor,
    botUserId: string,
  ): Promise<JsonDoDiscord[]> {
    let estados;
    try {
      estados = await this.voz.statesForGuild(botUserId, g.id);
    } catch (erro) {
      this.logger.warn(
        `voice_states de ${g.snowflake} ficou vazio: ${(erro as Error).message}`,
      );
      return [];
    }

    // Os snowflakes saem do que já está em mãos (é o mesmo `LinhaDeServidor` do
    // payload): nenhuma consulta a mais por participante.
    const canalPorCuid = new Map(g.canais.map((c) => [c.id, c.snowflake]));
    const membroPorCuid = new Map(g.membros.map((m) => [m.user.id, m]));

    const saida: JsonDoDiscord[] = [];
    for (const estado of estados) {
      const canalSnowflake = canalPorCuid.get(estado.channelId);
      const membro = membroPorCuid.get(estado.user.id);
      // Quem não é membro do servidor não tem estado de voz nele; canal fora da
      // estrutura (apagado no meio) idem.
      if (canalSnowflake === undefined || !membro) continue;
      saida.push(
        estadoDeVozParaDiscord({
          // Dentro do `GUILD_CREATE` o Discord manda o estado sem `guild_id`.
          guildSnowflake: null,
          canalSnowflake: String(canalSnowflake),
          usuarioSnowflake: String(membro.user.snowflake),
          sessionId: sessaoSinteticaDe(membro.user.snowflake),
          membro: membroParaDiscord(membro, true),
          selfMute: estado.muted,
          selfDeaf: estado.deafened,
          selfVideo: estado.video,
          selfStream: estado.screen,
        }),
      );
    }
    return saida;
  }

  // ── o fan-out ──────────────────────────────────────────────

  private async tratar(alvo: AlvoDoEvento, evento: string, dado: unknown): Promise<void> {
    try {
      switch (evento) {
        case WS_EVENTS.MESSAGE_NEW:
          return await this.mensagem(dado, "MESSAGE_CREATE");
        case WS_EVENTS.MESSAGE_UPDATED:
          // Só edição de verdade. O `message.updated` que a reação também
          // dispara não passa por aqui: ele sai por
          // `RealtimeService.emitToChannelSemOuvintes`, para o navegador só.
          return await this.mensagem(dado, "MESSAGE_UPDATE");
        case WS_EVENTS.MESSAGE_DELETED:
          return await this.mensagemApagada(dado);
        case WS_EVENTS.TYPING:
          return await this.digitando(alvo, dado);
        case WS_EVENTS.CHANNEL_CREATED:
          return await this.canal(dado, "CHANNEL_CREATE");
        case WS_EVENTS.CHANNEL_UPDATED:
          return await this.canal(dado, "CHANNEL_UPDATE");
        case WS_EVENTS.CHANNEL_DELETED:
          return await this.canalApagado(dado);
        case WS_EVENTS.ROLE_CREATED:
          return await this.cargo(dado, "GUILD_ROLE_CREATE");
        case WS_EVENTS.ROLE_UPDATED:
          return await this.cargo(dado, "GUILD_ROLE_UPDATE");
        case WS_EVENTS.ROLE_DELETED:
          return await this.cargoApagado(dado);
        case WS_EVENTS.MEMBER_JOINED:
          return await this.membro(dado, "GUILD_MEMBER_ADD");
        case WS_EVENTS.MEMBER_UPDATED:
          return await this.membro(dado, "GUILD_MEMBER_UPDATE");
        case WS_EVENTS.MEMBER_LEFT:
          return await this.membroSaiu(dado);
        case WS_EVENTS.VOICE_STATE:
          return await this.estadoDeVoz(dado);
        // ── F5: as reações granulares ──
        case WS_EVENTS.REACTION_ADDED:
          return await this.reacao(dado, "MESSAGE_REACTION_ADD");
        case WS_EVENTS.REACTION_REMOVED:
          return await this.reacao(dado, "MESSAGE_REACTION_REMOVE");
        case WS_EVENTS.REACTIONS_CLEARED:
          return await this.reacoesLimpas(dado);
        default:
          // Os outros eventos do Streamz não têm par (presença, banimento e
          // emoji são F5). Ignorar em silêncio é o certo: este ouvinte roda em
          // **todo** `emit` da API.
          return;
      }
    } catch (erro) {
      // Um evento que não traduz não pode derrubar os próximos da fila.
      this.logger.error(`falha ao traduzir "${evento}": ${(erro as Error).message}`);
    }
  }

  // ── mensagens ──────────────────────────────────────────────

  private async mensagem(dado: unknown, dispatch: string): Promise<void> {
    const payload = objeto(dado);
    const mensagemId = cadeia(payload, "id");
    const canalId = cadeia(payload, "channelId");
    if (!mensagemId || !canalId) return;

    const emServidor = cadeia(payload, "guildId") !== null;
    const bots = await this.botsComAcessoAoCanal(
      canalId,
      emServidor ? INTENT.GUILD_MESSAGES : INTENT.DIRECT_MESSAGES,
    );

    for (const [botUserId, sessoes] of bots) {
      // Uma leitura por bot, e não por sessão: o `me` das reações é do bot, não
      // da conexão, e um bot ligado duas vezes não paga duas vezes.
      const linha = await this.dados.mensagemPorCuid(mensagemId, botUserId);
      if (!linha) continue;
      this.memoria.lembrar("message", mensagemId, linha.snowflake);
      this.memoria.lembrar("channel", canalId, linha.channelSnowflake);
      const traduzida = mensagemParaDiscord(linha);
      for (const sessao of sessoes) sessao.despachar(dispatch, traduzida);
    }
  }

  private async mensagemApagada(dado: unknown): Promise<void> {
    const payload = objeto(dado);
    const mensagemId = cadeia(payload, "messageId");
    const canalId = cadeia(payload, "channelId");
    if (!mensagemId || !canalId) return;

    const canal = await this.dados.canalPorCuid(canalId);
    if (!canal) return;
    const bots = await this.botsComAcessoAoCanal(
      canalId,
      canal.guildSnowflake === null ? INTENT.DIRECT_MESSAGES : INTENT.GUILD_MESSAGES,
    );
    if (bots.size === 0) return;

    // A linha já não existe: só a memória da ponte (ou o cache do `IdsService`)
    // ainda sabe o snowflake dela. Sem o número não há dispatch honesto a
    // mandar — um id inventado é pior que evento nenhum.
    const snowflake =
      this.memoria.resolver("message", mensagemId) ??
      (await this.ids.snowflakeDeMensagem(mensagemId));
    if (snowflake === null) {
      this.logger.debug(
        `MESSAGE_DELETE de ${mensagemId} sem snowflake recuperável (a linha já foi apagada)`,
      );
      return;
    }

    const evento: JsonDoDiscord = {
      id: String(snowflake),
      channel_id: String(canal.snowflake),
    };
    if (canal.guildSnowflake !== null) evento.guild_id = String(canal.guildSnowflake);
    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar("MESSAGE_DELETE", evento);
    }
  }

  private async digitando(alvo: AlvoDoEvento, dado: unknown): Promise<void> {
    const payload = objeto(dado);
    const canalId = cadeia(payload, "channelId") ?? (alvo.tipo === "canal" ? alvo.id : null);
    const usuarioId = cadeia(objeto(payload?.["user"]), "id");
    if (!canalId || !usuarioId) return;

    const canal = await this.dados.canalPorCuid(canalId);
    if (!canal) return;
    const bots = await this.botsComAcessoAoCanal(
      canalId,
      canal.guildSnowflake === null ? INTENT.DIRECT_MESSAGE_TYPING : INTENT.GUILD_MESSAGE_TYPING,
    );
    if (bots.size === 0) return;

    const usuarioSnowflake = await this.ids.snowflakeDeUsuario(usuarioId);
    if (usuarioSnowflake === null) return;

    const evento: JsonDoDiscord = {
      channel_id: String(canal.snowflake),
      user_id: String(usuarioSnowflake),
      // o Discord manda em **segundos**, e o discord.js faz `new Date(ts * 1000)`
      timestamp: Math.floor(Date.now() / 1000),
    };
    // `member` é opcional no TYPING_START e o payload interno não o traz; as
    // libs tratam a ausência (o discord.js só o lê `if ('member' in d)`).
    if (canal.guildSnowflake !== null) evento.guild_id = String(canal.guildSnowflake);

    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar("TYPING_START", evento);
    }
  }

  // ── reações (F5) ───────────────────────────────────────────

  /**
   * `reaction.added` / `reaction.removed` → `MESSAGE_REACTION_ADD` / `_REMOVE`.
   *
   * O payload é o do Discord, campo por campo, porque é dele que vivem os bots
   * de *reaction roles* e de votação:
   *
   * ```json
   * { "user_id": "…", "channel_id": "…", "message_id": "…", "guild_id": "…",
   *   "member": { … }, "emoji": { "id": null, "name": "👍", "animated": false } }
   * ```
   *
   * Três detalhes que não são decorativos:
   *
   * 1. **`member` só no ADD**, e só em servidor — é o que o Discord manda, e é
   *    o que faz `reaction.users`/`reaction.message.guild.members` já ter o
   *    membro sem uma ida extra à REST. No REMOVE ele não vem (a pessoa pode
   *    nem estar mais no servidor).
   * 2. **O intent é o das reações**, não o das mensagens:
   *    `GUILD_MESSAGE_REACTIONS` em canal de servidor,
   *    `DIRECT_MESSAGE_REACTIONS` em conversa direta. Um bot que pediu só
   *    `GUILD_MESSAGES` não recebe reação nenhuma — é exatamente assim no
   *    Discord, e é a causa nº 1 de "meu bot não vê as reações".
   * 3. **O emoji** sai pela tradução única (`traducao/emoji.ts`): unicode com
   *    `id: null`, personalizado com o snowflake e o `animated`.
   *
   * O `MESSAGE_REACTION_ADD` do Discord ainda tem `message_author_id` e
   * `burst`/`burst_colors` (as "super reações"). O primeiro é opcional e
   * custaria uma leitura da mensagem por evento; as outras não existem aqui.
   * Nenhuma lib depende dos três.
   */
  private async reacao(
    dado: unknown,
    dispatch: "MESSAGE_REACTION_ADD" | "MESSAGE_REACTION_REMOVE",
  ): Promise<void> {
    const payload = objeto(dado);
    const mensagemId = cadeia(payload, "messageId");
    const canalId = cadeia(payload, "channelId");
    const usuarioId = cadeia(payload, "userId");
    const emoji = cadeia(payload, "emoji");
    if (!mensagemId || !canalId || !usuarioId || !emoji) return;

    const servidorId = cadeia(payload, "guildId");
    const bots = await this.botsComAcessoAoCanal(
      canalId,
      servidorId === null ? INTENT.DIRECT_MESSAGE_REACTIONS : INTENT.GUILD_MESSAGE_REACTIONS,
    );
    // ninguém pediu o intent: nem uma consulta a mais. Reação é frequente.
    if (bots.size === 0) return;

    const [mensagemSnowflake, canalSnowflake, usuarioSnowflake, emojiDoDiscord] = await Promise.all([
      this.snowflakeDeMensagem(mensagemId),
      this.snowflakeDeCanal(canalId),
      this.ids.snowflakeDeUsuario(usuarioId),
      this.reacoes.traduzirToken(emoji),
    ]);
    if (mensagemSnowflake === null || canalSnowflake === null || usuarioSnowflake === null) return;

    const evento: JsonDoDiscord = {
      user_id: String(usuarioSnowflake),
      channel_id: String(canalSnowflake),
      message_id: String(mensagemSnowflake),
      emoji: emojiDoDiscord,
    };

    if (servidorId !== null) {
      const servidorSnowflake = await this.snowflakeDoServidor(servidorId);
      if (servidorSnowflake === null) return;
      evento.guild_id = String(servidorSnowflake);
      if (dispatch === "MESSAGE_REACTION_ADD") {
        const membro = await this.dados.membroDoServidor(servidorId, usuarioId);
        // `member` é opcional; sem ele o discord.js resolve pelo cache e o
        // dispatch continua útil — melhor que engolir o evento inteiro
        if (membro) evento.member = membroParaDiscord(membro, true);
      }
    }

    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar(dispatch, evento);
    }
  }

  /**
   * `reactions.cleared` → `MESSAGE_REACTION_REMOVE_ALL` / `_REMOVE_EMOJI`.
   *
   * Um evento interno só para os dois dispatches: `emoji: null` quer dizer
   * "limparam tudo" e vira o `_REMOVE_ALL` (que não leva emoji nenhum);
   * preenchido, vira o `_REMOVE_EMOJI` com o objeto do emoji. É o que a
   * moderação dispara pelo `DELETE .../reactions` e
   * `DELETE .../reactions/:emoji`.
   */
  private async reacoesLimpas(dado: unknown): Promise<void> {
    const payload = objeto(dado);
    const mensagemId = cadeia(payload, "messageId");
    const canalId = cadeia(payload, "channelId");
    if (!mensagemId || !canalId) return;

    const servidorId = cadeia(payload, "guildId");
    const emoji = cadeia(payload, "emoji");
    const bots = await this.botsComAcessoAoCanal(
      canalId,
      servidorId === null ? INTENT.DIRECT_MESSAGE_REACTIONS : INTENT.GUILD_MESSAGE_REACTIONS,
    );
    if (bots.size === 0) return;

    const [mensagemSnowflake, canalSnowflake] = await Promise.all([
      this.snowflakeDeMensagem(mensagemId),
      this.snowflakeDeCanal(canalId),
    ]);
    if (mensagemSnowflake === null || canalSnowflake === null) return;

    const evento: JsonDoDiscord = {
      channel_id: String(canalSnowflake),
      message_id: String(mensagemSnowflake),
    };
    if (servidorId !== null) {
      const servidorSnowflake = await this.snowflakeDoServidor(servidorId);
      if (servidorSnowflake === null) return;
      evento.guild_id = String(servidorSnowflake);
    }
    if (emoji !== null) evento.emoji = await this.reacoes.traduzirToken(emoji);

    const dispatch = emoji === null ? "MESSAGE_REACTION_REMOVE_ALL" : "MESSAGE_REACTION_REMOVE_EMOJI";
    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar(dispatch, evento);
    }
  }

  // ── canais ─────────────────────────────────────────────────

  private async canal(dado: unknown, dispatch: string): Promise<void> {
    const canalId = cadeia(objeto(dado), "id");
    if (!canalId) return;

    const bots = await this.botsComAcessoAoCanal(canalId, INTENT.GUILDS);
    if (bots.size === 0) return;

    // Relê em vez de traduzir o DTO: o `Channel` de `@streamz/shared` não tem
    // snowflake nenhum (nem o dele, nem o do servidor, nem o da categoria).
    const linha = await this.dados.canalPorCuid(canalId);
    if (!linha) return;
    this.memoria.lembrar("channel", canalId, linha.snowflake);

    const traduzido = canalParaDiscord(linha);
    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar(dispatch, traduzido);
    }
  }

  private async canalApagado(dado: unknown): Promise<void> {
    const payload = objeto(dado);
    const canalId = cadeia(payload, "channelId");
    const servidorId = cadeia(payload, "guildId");
    if (!canalId) return;

    // O canal já não existe, então não dá para perguntar quem o via: recebe
    // quem é membro do servidor. Em DM (sem `guildId`) o evento não sai — o
    // participante seria o próprio bot, e a F1 não abre DM com bot.
    if (!servidorId) return;
    const bots = await this.botsNoServidor(servidorId, INTENT.GUILDS);
    if (bots.size === 0) return;

    const canalSnowflake =
      this.memoria.resolver("channel", canalId) ?? (await this.ids.snowflakeDeCanal(canalId));
    const servidorSnowflake = await this.snowflakeDoServidor(servidorId);
    if (canalSnowflake === null || servidorSnowflake === null) {
      this.logger.debug(`CHANNEL_DELETE de ${canalId} sem snowflake recuperável`);
      return;
    }

    const evento: JsonDoDiscord = {
      id: String(canalSnowflake),
      guild_id: String(servidorSnowflake),
    };
    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar("CHANNEL_DELETE", evento);
    }
  }

  // ── cargos ─────────────────────────────────────────────────

  private async cargo(dado: unknown, dispatch: string): Promise<void> {
    const payload = objeto(dado);
    const cargoId = cadeia(payload, "id");
    const servidorId = cadeia(payload, "guildId");
    if (!cargoId || !servidorId) return;

    const bots = await this.botsNoServidor(servidorId, INTENT.GUILDS);
    if (bots.size === 0) return;

    // Relê pelo mesmo motivo do canal, e mais um: o `@everyone` sai com o
    // snowflake do **servidor** como id (lote C), que o DTO não tem.
    const cargos = await this.dados.cargosDoServidor(servidorId);
    const linha = cargos.find((c) => c.id === cargoId);
    if (!linha) return;
    this.memoria.lembrar("role", cargoId, linha.snowflake);
    this.memoria.lembrar("guild", servidorId, linha.guildSnowflake);

    const evento: JsonDoDiscord = {
      guild_id: String(linha.guildSnowflake),
      role: cargoParaDiscord(linha),
    };
    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar(dispatch, evento);
    }
  }

  private async cargoApagado(dado: unknown): Promise<void> {
    const payload = objeto(dado);
    const cargoId = cadeia(payload, "roleId");
    const servidorId = cadeia(payload, "guildId");
    if (!cargoId || !servidorId) return;

    const bots = await this.botsNoServidor(servidorId, INTENT.GUILDS);
    if (bots.size === 0) return;

    const cargoSnowflake =
      this.memoria.resolver("role", cargoId) ?? (await this.ids.snowflakeDeCargo(cargoId));
    const servidorSnowflake = await this.snowflakeDoServidor(servidorId);
    if (cargoSnowflake === null || servidorSnowflake === null) {
      this.logger.debug(`GUILD_ROLE_DELETE de ${cargoId} sem snowflake recuperável`);
      return;
    }

    const evento: JsonDoDiscord = {
      guild_id: String(servidorSnowflake),
      role_id: String(cargoSnowflake),
    };
    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar("GUILD_ROLE_DELETE", evento);
    }
  }

  // ── membros ────────────────────────────────────────────────

  private async membro(dado: unknown, dispatch: string): Promise<void> {
    const payload = objeto(dado);
    const servidorId = cadeia(payload, "guildId");
    // `member.updated` traz `userId`; `member.joined`, o membro inteiro
    const usuarioId =
      cadeia(payload, "userId") ?? cadeia(objeto(objeto(payload?.["member"])?.["user"]), "id");
    if (!servidorId || !usuarioId) return;

    const bots = await this.botsNoServidor(servidorId, INTENT.GUILD_MEMBERS);
    if (bots.size === 0) return;

    const linha = await this.dados.membroDoServidor(servidorId, usuarioId);
    const servidorSnowflake = await this.snowflakeDoServidor(servidorId);
    if (!linha || servidorSnowflake === null) return;
    this.memoria.lembrar("user", usuarioId, linha.user.snowflake);

    const evento: JsonDoDiscord = {
      ...membroParaDiscord(linha, true),
      guild_id: String(servidorSnowflake),
    };
    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar(dispatch, evento);
    }
  }

  private async membroSaiu(dado: unknown): Promise<void> {
    const payload = objeto(dado);
    const servidorId = cadeia(payload, "guildId");
    const usuarioId = cadeia(payload, "userId");
    if (!servidorId || !usuarioId) return;

    const bots = await this.botsNoServidor(servidorId, INTENT.GUILD_MEMBERS);
    if (bots.size === 0) return;

    // O `User` continua existindo — quem saiu foi o `GuildMember` —, então o
    // usuário ainda é legível, e é dele que o `GUILD_MEMBER_REMOVE` precisa.
    const usuario = await this.dados.usuarioPorCuid(usuarioId);
    const servidorSnowflake = await this.snowflakeDoServidor(servidorId);
    if (!usuario || servidorSnowflake === null) return;

    const evento: JsonDoDiscord = {
      guild_id: String(servidorSnowflake),
      user: usuarioParaDiscord(usuario),
    };
    for (const sessoes of bots.values()) {
      for (const sessao of sessoes) sessao.despachar("GUILD_MEMBER_REMOVE", evento);
    }
  }

  // ── voz (F2) ───────────────────────────────────────────────

  /**
   * `voice.state` → `VOICE_STATE_UPDATE`, filtrado por `GUILD_VOICE_STATES`.
   *
   * É por aqui que o bot de música vê a pessoa entrar e sair da call — inclusive
   * o "ficou sozinho no canal", que é como quase todo bot decide se
   * desconectar.
   *
   * **O estado do próprio bot não sai daqui**, e isso é deliberado: o
   * `session_id` é obrigatório no evento e só a sessão do gateway o conhece, e
   * a ordem `VOICE_STATE_UPDATE` → `VOICE_SERVER_UPDATE` do §8 tem de ser
   * colada. Quem manda o do bot é o `voz.ts`, no op 4 e na rota interna da
   * ponte. **Limitação registrada:** um bot **movido** por um moderador
   * (`VoiceService.move`) não recebe evento nenhum — e não adiantaria receber,
   * porque a ponte não tem como trocar de sala sem um `VOICE_SERVER_UPDATE`
   * novo. É dívida da fase, não descuido.
   *
   * Conversa direta (`guildId` nulo) não gera evento: `VOICE_STATE_UPDATE` é de
   * servidor, e a F2 não abre chamada em DM com bot.
   */
  private async estadoDeVoz(dado: unknown): Promise<void> {
    const payload = objeto(dado);
    const canalId = cadeia(payload, "channelId");
    const servidorId = cadeia(payload, "guildId");
    const usuarioId = cadeia(objeto(payload?.["user"]), "id");
    if (!canalId || !servidorId || !usuarioId) return;

    const bots = await this.botsComAcessoAoCanal(canalId, INTENT.GUILD_VOICE_STATES);
    // Nada de consulta quando ninguém pediu o intent — este ouvinte roda em
    // todo `voice.state` da instância, e eles são frequentes.
    const destinatarios = [...bots].filter(([botUserId]) => botUserId !== usuarioId);
    if (destinatarios.length === 0) return;

    const lembrado = this.memoria.resolver("channel", canalId);
    const [canalSnowflake, servidorSnowflake, membro] = await Promise.all([
      lembrado !== null ? Promise.resolve(lembrado) : this.ids.snowflakeDeCanal(canalId),
      this.snowflakeDoServidor(servidorId),
      this.dados.membroDoServidor(servidorId, usuarioId),
    ]);
    if (canalSnowflake === null || servidorSnowflake === null || !membro) return;
    this.memoria.lembrar("channel", canalId, canalSnowflake);
    this.memoria.lembrar("user", usuarioId, membro.user.snowflake);

    const conectado = payload?.["connected"] === true;
    const evento = estadoDeVozParaDiscord({
      guildSnowflake: String(servidorSnowflake),
      // Desconectar é o mesmo evento com `channel_id: null` — é o que as libs
      // leem para tirar a pessoa da call.
      canalSnowflake: conectado ? String(canalSnowflake) : null,
      usuarioSnowflake: String(membro.user.snowflake),
      sessionId: sessaoSinteticaDe(membro.user.snowflake),
      membro: membroParaDiscord(membro, true),
      selfMute: payload?.["muted"] === true,
      selfDeaf: payload?.["deafened"] === true,
      selfVideo: payload?.["video"] === true,
      selfStream: payload?.["screen"] === true,
    });

    for (const [, sessoes] of destinatarios) {
      for (const sessao of sessoes) sessao.despachar("VOICE_STATE_UPDATE", evento);
    }
  }

  // ── quem recebe o quê ──────────────────────────────────────

  /**
   * As sessões que pediram `intent`, agrupadas por usuário-bot.
   *
   * Agrupar é o que permite pagar **uma** leitura por bot em vez de uma por
   * conexão: um bot pode estar ligado mais de uma vez, e o payload é o mesmo
   * nas duas pontas.
   */
  private sessoesPorBot(intent: number): Map<string, SessaoDoBot[]> {
    const mapa = new Map<string, SessaoDoBot[]>();
    for (const sessao of this.registro.todas()) {
      if ((sessao.intents & intent) === 0) continue;
      const atuais = mapa.get(sessao.botUserId);
      if (atuais) atuais.push(sessao);
      else mapa.set(sessao.botUserId, [sessao]);
    }
    return mapa;
  }

  /**
   * As sessões que podem **ver aquele canal**.
   *
   * A checagem é a mesma que o `ChatGateway` faz para deixar um navegador
   * entrar na sala (`GuildsService.assertCanViewChannel`): a casca não
   * reimplementa permissão (§3). Custa de duas a quatro consultas por bot, e só
   * roda quando existe bot conectado com o intent pedido.
   */
  private async botsComAcessoAoCanal(
    canalId: string,
    intent: number,
  ): Promise<Map<string, SessaoDoBot[]>> {
    const permitidos = new Map<string, SessaoDoBot[]>();
    for (const [botUserId, sessoes] of this.sessoesPorBot(intent)) {
      try {
        await this.guilds.assertCanViewChannel(botUserId, canalId);
        permitidos.set(botUserId, sessoes);
      } catch {
        // não vê o canal, não recebe: é o mesmo "não" que a tela daria.
      }
    }
    return permitidos;
  }

  /** As sessões cujo bot é membro do servidor (F1: existe linha de `GuildMember`). */
  private async botsNoServidor(
    servidorId: string,
    intent: number,
  ): Promise<Map<string, SessaoDoBot[]>> {
    const permitidos = new Map<string, SessaoDoBot[]>();
    for (const [botUserId, sessoes] of this.sessoesPorBot(intent)) {
      const membro = await this.dados.membroDoServidor(servidorId, botUserId);
      if (membro) permitidos.set(botUserId, sessoes);
    }
    return permitidos;
  }

  /** O snowflake da mensagem: da memória (o `MESSAGE_CREATE` a viu), e só depois do banco. */
  private async snowflakeDeMensagem(mensagemId: string): Promise<bigint | null> {
    const lembrado = this.memoria.resolver("message", mensagemId);
    if (lembrado !== null) return lembrado;
    const buscado = await this.ids.snowflakeDeMensagem(mensagemId);
    if (buscado !== null) this.memoria.lembrar("message", mensagemId, buscado);
    return buscado;
  }

  /** O snowflake do canal: idem. */
  private async snowflakeDeCanal(canalId: string): Promise<bigint | null> {
    const lembrado = this.memoria.resolver("channel", canalId);
    if (lembrado !== null) return lembrado;
    const buscado = await this.ids.snowflakeDeCanal(canalId);
    if (buscado !== null) this.memoria.lembrar("channel", canalId, buscado);
    return buscado;
  }

  /** O snowflake do servidor: da memória, e só depois do banco. */
  private async snowflakeDoServidor(servidorId: string): Promise<bigint | null> {
    const lembrado = this.memoria.resolver("guild", servidorId);
    if (lembrado !== null) return lembrado;
    const buscado = await this.ids.snowflakeDeServidor(servidorId);
    if (buscado !== null) this.memoria.lembrar("guild", servidorId, buscado);
    return buscado;
  }

  /**
   * Guarda os pares cuid↔snowflake do servidor inteiro.
   *
   * O `GUILD_CREATE` é a única vez em que a ponte vê tudo de uma vez — sai de
   * graça aproveitar para aprender os ids que os eventos de exclusão vão pedir
   * depois, quando a linha já não existir.
   */
  private memorizarServidor(g: LinhaDeServidor): void {
    this.memoria.lembrar("guild", g.id, g.snowflake);
    for (const c of g.canais) this.memoria.lembrar("channel", c.id, c.snowflake);
    for (const c of g.categorias) this.memoria.lembrar("category", c.id, c.snowflake);
    for (const c of g.cargos) this.memoria.lembrar("role", c.id, c.snowflake);
    for (const m of g.membros) this.memoria.lembrar("user", m.user.id, m.user.snowflake);
  }
}
