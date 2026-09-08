import { Injectable, Logger } from "@nestjs/common";
import type { JsonDoDiscord } from "../tipos";

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
 * Três armadilhas:
 *
 * 1. **Filtre por intent** (`INTENT` em `../tipos`) e por acesso: uma sessão só
 *    recebe o que o usuário-bot dela poderia ver.
 * 2. **Nunca mande de volta o que o próprio bot fez?** Não — o Discord *manda*.
 *    O bot recebe o `MESSAGE_CREATE` das mensagens dele mesmo, e as libs
 *    filtram por `message.author.bot`. Imitar o Discord aqui é o certo.
 * 3. **Reação é o ponto feio** (§7): hoje `reaction.add` resulta em
 *    `message.updated` com a mensagem inteira, sem `user_id`. `MESSAGE_REACTION_ADD`
 *    de verdade é F5, com um evento interno novo. Na F1, o que dá para fazer é
 *    o `MESSAGE_UPDATE` — e o PR deve **dizer isso**, em vez de fingir.
 */
@Injectable()
export class PonteDeEventos {
  private readonly logger = new Logger(PonteDeEventos.name);

  /**
   * Assina o `RealtimeService.onEvent`. Chamado uma vez, no `onModuleInit`.
   *
   * O esqueleto **não lança** de propósito: é chamado no boot, e um `throw`
   * aqui derrubaria a API inteira nas branches dos outros lotes.
   */
  iniciar(): void {
    this.logger.warn("F1 lote D: ponte de eventos ainda não implementada — nenhum dispatch sairá");
  }

  /**
   * O `GUILD_CREATE` completo de um servidor, na visão de um usuário-bot.
   *
   * Chamado pelo `identify.ts` (lote B) logo depois do READY, um por servidor.
   * É o payload mais perigoso da fase: incompleto, o `ready` nunca dispara e o
   * bot fica mudo **sem erro** (risco (a) do §12).
   */
  async montarGuildCreate(_guildId: string, _botUserId: string): Promise<JsonDoDiscord> {
    throw new Error("F1 lote D: PonteDeEventos.montarGuildCreate não implementado");
  }
}
