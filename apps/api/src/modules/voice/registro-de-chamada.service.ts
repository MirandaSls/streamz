import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { WS_EVENTS } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MessagesService } from "../messages/messages.service";
import { RealtimeService } from "../realtime/realtime.service";

/**
 * A chamada de conversa direta como **mensagem** na timeline — o "X iniciou uma
 * chamada." que depois vira "...que durou 5 horas.".
 *
 * A chamada viva continua sendo estado de voz efêmero (`VoiceService` +
 * relógios do `CallsService`); o que este serviço grava é só o **histórico**:
 * uma `Message` `SYSTEM_CALL` com a `Call` pendurada (início, fim e quem
 * entrou). O texto é montado no cliente a partir de `Message.call`, porque ele
 * depende de quem lê ("Você perdeu uma chamada de X").
 *
 * Duas garantias que o `CallsService` pode presumir:
 *
 * 1. **Nunca rejeita.** Todo erro é logado e engolido aqui dentro: falhar o
 *    histórico não pode derrubar a chamada. Por isso o `CallsService` chama com
 *    `void` e não segura o `POST /dms/:id/call` (nem o `call.accept`) pela
 *    escrita no banco.
 * 2. **Ordem por canal.** As operações de um mesmo canal entram numa fila e
 *    rodam uma de cada vez, na ordem em que foram pedidas. Sem isto, o
 *    `participou` de quem atende rápido podia rodar antes da transação do
 *    `abrir` terminar, não achar Call aberta e sumir com o participante — e
 *    ele leria "Você perdeu uma chamada" de uma chamada em que falou. A fila
 *    também serializa o "já está em `participantIds`?" contra o `push`, que
 *    sozinho é ler-e-depois-escrever. Ela é do processo, como os relógios do
 *    `CallsService`: com mais de uma instância valeria a mesma ressalva deles.
 */
@Injectable()
export class RegistroDeChamadaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RegistroDeChamadaService.name);
  /** Canal → cauda da fila de operações daquele canal. */
  private readonly filas = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * O deploy zera o estado de voz (é efêmero de propósito — ver CLAUDE.md), então
   * nenhuma chamada sobrevive ao restart. Sem fechar aqui, a mensagem da
   * chamada que caiu com o processo ficaria "em andamento" para sempre e a
   * próxima ligação da conversa reaproveitaria essa Call velha. A duração fica
   * aproximada: conta até o boot, não até a queda. Não emite nada — ninguém
   * está conectado ainda, e quem conectar lê o histórico já fechado.
   *
   * Com mais de uma instância isto fecharia a chamada viva de outra; hoje é
   * instância única, a mesma ressalva do resto da voz.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const { count } = await this.prisma.call.updateMany({
        where: { endedAt: null },
        data: { endedAt: new Date() },
      });
      if (count > 0) this.logger.log(`${count} chamada(s) órfã(s) do processo anterior encerrada(s)`);
    } catch (e) {
      // boot não cai por causa do histórico de chamada
      this.logger.error("Falha ao encerrar chamadas órfãs no boot", e instanceof Error ? e.stack : String(e));
    }
  }

  /**
   * A chamada nasceu: cria a mensagem `SYSTEM_CALL` com quem ligou. Se já há
   * uma aberta no canal (dois `start` que nasceram juntos, ou uma que não foi
   * fechada), não cria outra — só garante quem ligou entre os participantes.
   */
  abrir(channelId: string, autorId: string): Promise<void> {
    return this.enfileirar(channelId, "abrir", async () => {
      const aberta = await this.aberta(channelId);
      if (aberta) {
        await this.incluir(channelId, aberta, autorId);
        return;
      }
      // nested create: mensagem e Call nascem juntas ou nenhuma nasce — uma
      // `SYSTEM_CALL` sem `call` o cliente não saberia desenhar
      const msg = await this.prisma.message.create({
        data: {
          channelId,
          authorId: autorId,
          content: "",
          type: "SYSTEM_CALL",
          call: { create: { participantIds: [autorId] } },
        },
        select: { id: true },
      });
      const dto = await this.messages.getDTO(msg.id);
      this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_NEW, dto);
    });
  }

  /**
   * Alguém entrou na chamada (atendeu ou pelo botão "Entrar"). É o que separa
   * "participou" de "perdeu" no texto. Sem Call aberta não faz nada: entrar na
   * voz de uma conversa sem chamada registrada não inventa histórico.
   */
  participou(channelId: string, userId: string): Promise<void> {
    return this.enfileirar(channelId, "participou", async () => {
      const aberta = await this.aberta(channelId);
      if (aberta) await this.incluir(channelId, aberta, userId);
    });
  }

  /** A chamada morreu: grava o fim e reemite a mensagem. Idempotente. */
  fechar(channelId: string): Promise<void> {
    return this.enfileirar(channelId, "fechar", async () => {
      const aberta = await this.aberta(channelId);
      if (!aberta) return;
      // `endedAt: null` no filtro: se outro caminho (outra instância, o boot)
      // fechou entre a leitura e aqui, `count` é 0 e não emitimos de novo
      const { count } = await this.prisma.call.updateMany({
        where: { id: aberta.id, endedAt: null },
        data: { endedAt: new Date() },
      });
      if (count > 0) await this.reemitir(channelId, aberta.messageId);
    });
  }

  // ── internos (rodam só dentro da fila) ─────────────────────

  private async aberta(channelId: string) {
    return this.prisma.call.findFirst({
      where: { endedAt: null, message: { channelId } },
      select: { id: true, messageId: true, participantIds: true },
    });
  }

  private async incluir(
    channelId: string,
    call: { id: string; messageId: string; participantIds: string[] },
    userId: string,
  ) {
    if (call.participantIds.includes(userId)) return;
    await this.prisma.call.update({
      where: { id: call.id },
      data: { participantIds: { push: userId } },
    });
    await this.reemitir(channelId, call.messageId);
  }

  private async reemitir(channelId: string, messageId: string) {
    const dto = await this.messages.getDTO(messageId);
    this.realtime.emitToChannel(channelId, WS_EVENTS.MESSAGE_UPDATED, dto);
  }

  /**
   * Encadeia `op` na fila do canal e devolve uma promessa que **nunca rejeita**.
   * A cauda guardada também nunca rejeita, então uma falha não trava as
   * operações seguintes do canal. A entrada sai do mapa quando a fila esvazia,
   * para o mapa não crescer com cada conversa que já ligou um dia.
   */
  private enfileirar(channelId: string, nome: string, op: () => Promise<void>): Promise<void> {
    const anterior = this.filas.get(channelId) ?? Promise.resolve();
    const atual = anterior.then(op).catch((e) => {
      this.logger.error(
        `Falha ao registrar chamada (${nome}) no canal ${channelId}`,
        e instanceof Error ? e.stack : String(e),
      );
    });
    this.filas.set(channelId, atual);
    void atual.then(() => {
      if (this.filas.get(channelId) === atual) this.filas.delete(channelId);
    });
    return atual;
  }
}
