import { Injectable } from "@nestjs/common";
import type { ComandoDeApp, Message as MessageDTO } from "@streamz/shared";
import type {
  CorpoDeResposta,
  EntradaDeInteracao,
  InteracaoAutenticada,
  InteracaoEmVoo,
} from "./tipos";

/**
 * O domínio das interações: criar, despachar para o bot e materializar a
 * resposta dele como mensagem do chat.
 *
 * ── Lote A (domínio) implementa. Lote B (REST compat) **só chama**. ──
 *
 * As assinaturas abaixo são o contrato entre os dois lotes e **não mudam**
 * durante a fase. Os corpos lançam `Error("F3 lote A: … não implementado")` de
 * propósito: assim as duas branches compilam desde o primeiro minuto e o merge
 * não tem conflito (é o que funcionou na F1).
 *
 * O caminho inteiro, do `/play` ao `pong` na tela:
 *
 * ```
 * composer: "/play never gonna give you up"
 *    │ POST /api/channels/:id/interactions { commandId, options }   (JwtGuard)
 *    ▼
 * criarInteracao()
 *    • acha o ApplicationCommand e confere que o bot é membro do servidor
 *    • confere que **quem digitou** pode escrever no canal
 *    • cria Interaction { snowflake, token, expiresAt = agora + 15 min }
 *    • despacha INTERACTION_CREATE nas sessões de gateway do bot
 *    ▼
 * bot (discord.js): interactionCreate → deferReply()
 *    │ POST /api/v10/interactions/:id/:token/callback { type: 5 }   (sem auth)
 *    ▼
 * responder(5) → MessagesService.create(autor = bot, "pensando…")
 *              → emitToChannel("message.new")  → aparece na tela, sem F5
 *    ▼
 * bot: editReply('pong')
 *    │ PATCH /api/v10/webhooks/:app/:token/messages/@original
 *    ▼
 * editarOriginal() → MessagesService.edit → emitToChannel("message.updated")
 * ```
 *
 * **A casca não reimplementa permissão.** Quem escreve é o usuário-bot, por
 * `MessagesService.create`, e é ele que leva o 403 se o bot não vir o canal —
 * a prova 4 da fase depende exatamente disso.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §9 e o `CONTRATO-F3.md`.
 */
@Injectable()
export class InteractionsService {
  // ── o lado de cá: o web dispara ────────────────────────────

  /**
   * Cria a interação e a despacha para o bot.
   *
   * Recusas, todas antes de gravar:
   * - comando inexistente, ou de um servidor que não é o do canal → 404;
   * - o usuário-bot não é membro do servidor → 404 (para quem digitou, um
   *   comando de um bot que saiu é um comando que não existe);
   * - quem digitou não pode escrever no canal → 403 (`assertCanPostChannel`);
   * - opção obrigatória faltando, ou de tipo errado → 400.
   *
   * O despacho é **melhor esforço**: bot desconectado não é erro da chamada —
   * a interação existe, expira em 15 min e ninguém responde. É o que o Discord
   * faz, e é o que deixa o composer devolver na hora.
   */
  async criarInteracao(_entrada: EntradaDeInteracao): Promise<InteracaoEmVoo> {
    throw new Error("F3 lote A: criarInteracao não implementado");
  }

  /** Os comandos que valem naquele servidor — o `GET /api/guilds/:id/comandos-de-app`. */
  async comandosDoServidor(_guildId: string, _usuarioId: string): Promise<ComandoDeApp[]> {
    throw new Error("F3 lote A: comandosDoServidor não implementado");
  }

  // ── o lado de lá: o bot responde ───────────────────────────

  /**
   * Resolve o token do caminho, ou lança o erro do Discord já pronto.
   *
   * É o "guard" das rotas de callback e followup — e é o **único** credencial
   * delas: o `@discordjs/rest` manda essas requisições com `auth: false`, sem
   * `Authorization` nenhum. Um `BotTokenGuard` ali daria 401 em tudo.
   *
   * - token que não existe, ou expirado (> 15 min) → 404 `10062`;
   * - `:id` (ou `:app`) do caminho que não bate com a linha → 404 `10062`,
   *   e não 403: para quem não tem o token, a interação não existe.
   */
  async porToken(_token: string): Promise<InteracaoAutenticada> {
    throw new Error("F3 lote A: porToken não implementado");
  }

  /**
   * `POST /interactions/:id/:token/callback` — o tipo 4 e o tipo 5.
   *
   * - **4** `CHANNEL_MESSAGE_WITH_SOURCE`: escreve `data.content` no canal.
   * - **5** `DEFERRED_…`: escreve `TEXTO_PENSANDO`. É uma mensagem de verdade,
   *   porque o Streamz não tem "mensagem que ainda não existe"; o `editReply`
   *   depois vira uma edição normal.
   * - 6, 7, 8, 9 → 501 (F5).
   *
   * Segundo callback na mesma interação → 400 `40060`. A checagem é uma
   * escrita condicional no banco (`updateMany` com `respondedAt: null`), e não
   * um `if` depois de um `findUnique`: dois callbacks quase simultâneos — que é
   * o que um bot com bug faz — passariam pelos dois `if`.
   *
   * Devolve 204 sem corpo, como o Discord.
   */
  async responder(
    _interacao: InteracaoAutenticada,
    _tipo: number,
    _dados: CorpoDeResposta | undefined,
  ): Promise<void> {
    throw new Error("F3 lote A: responder não implementado");
  }

  /**
   * `PATCH /webhooks/:app/:token/messages/@original` — o `editReply()`.
   *
   * Edita a mensagem que o callback criou. Sem callback antes (`respondedAt`
   * nulo) → 404 `10062`: não há original a editar.
   */
  async editarOriginal(
    _interacao: InteracaoAutenticada,
    _dados: CorpoDeResposta,
  ): Promise<MessageDTO> {
    throw new Error("F3 lote A: editarOriginal não implementado");
  }

  /** `GET /webhooks/:app/:token/messages/@original` — o `fetchReply()`. */
  async lerOriginal(_interacao: InteracaoAutenticada): Promise<MessageDTO> {
    throw new Error("F3 lote A: lerOriginal não implementado");
  }

  /** `DELETE /webhooks/:app/:token/messages/@original` — 204. */
  async apagarOriginal(_interacao: InteracaoAutenticada): Promise<void> {
    throw new Error("F3 lote A: apagarOriginal não implementado");
  }

  /**
   * `POST /webhooks/:app/:token` — o `followUp()`: uma mensagem nova no mesmo
   * canal, com a mesma faixa "usou /play".
   *
   * Followup **antes** de qualquer callback: o Discord aceita e trata como a
   * resposta original. Fazemos o mesmo (e gravamos o `responseMessageId`), em
   * vez de recusar — recusar quebraria um bot que funciona lá.
   */
  async followup(
    _interacao: InteracaoAutenticada,
    _dados: CorpoDeResposta,
  ): Promise<MessageDTO> {
    throw new Error("F3 lote A: followup não implementado");
  }

}

// A faixa "usou /play" **não** entra aqui: o `MessagesService` a monta com um
// `include` do Prisma e o mapeador puro de `./dto.ts`. Injetar este service lá
// criaria um ciclo de módulos (`InteractionsModule` já importa
// `MessagesModule`), e um `import` de função pura não cria ciclo nenhum.
