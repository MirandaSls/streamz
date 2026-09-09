import {
  WS_EVENTS,
  type Message as MessageDTO,
  type ReactionClearedEvent,
  type ReactionEvent,
} from "@streamz/shared";
import type { RealtimeService } from "../realtime/realtime.service";

/**
 * ── j-bots ── O anúncio de uma reação, num lugar só.
 *
 * **Por que existe.** Uma reação sempre saiu daqui como `message.updated` com
 * a mensagem inteira — o navegador redesenha a barra de reações e pronto. Para
 * um bot isso não serve: o `MESSAGE_REACTION_ADD` do Discord carrega *quem*
 * reagiu e *com qual emoji*, e é disso que vivem os bots de "reaction roles" e
 * de votação. Traduzido, um `message.updated` viraria um `MESSAGE_UPDATE` — a
 * lib do bot atualiza o cache da mensagem e **não dispara**
 * `messageReactionAdd`.
 *
 * **O par.** Cada reação emite dois eventos, e é de propósito:
 *
 * | Evento | Para quem | Por quê |
 * |---|---|---|
 * | `message.updated` (mensagem inteira) | só o navegador (`emitToChannelSemOuvintes`) | é o que o site e o desktop já instalado escutam; trocá-lo quebraria cliente antigo |
 * | `reaction.added` / `.removed` (o delta) | navegador **e** ponte dos bots (`emitToChannel`) | é o que vira `MESSAGE_REACTION_ADD`/`_REMOVE` |
 *
 * O `message.updated` sai **sem** avisar os ouvintes locais justamente para
 * que a ponte não o veja: se ela o visse, o bot receberia os dois, e o
 * `MESSAGE_UPDATE` espúrio é o defeito que este arquivo conserta.
 *
 * O web hoje ignora `reaction.added` (o `message.updated` já lhe basta) — é o
 * que o §7 do documento previa: "um evento interno que o web pode ignorar".
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §7, "Dispatches".
 */

/** Pôs ou tirou uma reação. */
export function anunciarReacao(
  realtime: RealtimeService,
  acao: "add" | "remove",
  mensagem: MessageDTO,
  userId: string,
  emoji: string,
): void {
  realtime.emitToChannelSemOuvintes(mensagem.channelId, WS_EVENTS.MESSAGE_UPDATED, mensagem);
  const evento: ReactionEvent = {
    messageId: mensagem.id,
    channelId: mensagem.channelId,
    guildId: mensagem.guildId,
    userId,
    emoji,
  };
  realtime.emitToChannel(
    mensagem.channelId,
    acao === "add" ? WS_EVENTS.REACTION_ADDED : WS_EVENTS.REACTION_REMOVED,
    evento,
  );
}

/** A moderação limpou as reações: todas (`emoji: null`) ou as de um emoji. */
export function anunciarReacoesLimpas(
  realtime: RealtimeService,
  mensagem: MessageDTO,
  emoji: string | null,
): void {
  realtime.emitToChannelSemOuvintes(mensagem.channelId, WS_EVENTS.MESSAGE_UPDATED, mensagem);
  const evento: ReactionClearedEvent = {
    messageId: mensagem.id,
    channelId: mensagem.channelId,
    guildId: mensagem.guildId,
    emoji,
  };
  realtime.emitToChannel(mensagem.channelId, WS_EVENTS.REACTIONS_CLEARED, evento);
}
