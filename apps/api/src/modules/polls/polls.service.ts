import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WS_EVENTS, isPollClosed } from "@streamz/shared";
import type { Message as MessageDTO, Poll, PollVoters } from "@streamz/shared";
import { toPublicUser } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { MessagesService } from "../messages/messages.service";
import { RealtimeService } from "../realtime/realtime.service";
import { tallyPoll } from "./poll-core";

const POLL_SELECT = {
  id: true,
  messageId: true,
  question: true,
  options: true,
  multi: true,
  expiresAt: true,
  closedAt: true,
} as const;

/**
 * Enquetes.
 *
 * Uma enquete **é uma mensagem** (ADR-0001 vale igual: canal é canal): nasce
 * como `Message` com uma linha `Poll` pendurada, e por isso herda autorização,
 * histórico, thread e busca sem nenhum caminho novo. O que este serviço faz é
 * criar, contar, votar e encerrar.
 */
@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly messages: MessagesService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Cria a enquete e devolve a mensagem pronta para o `message.new`. */
  async create(
    authorId: string,
    input: {
      channelId: string;
      question: string;
      options: string[];
      multi?: boolean;
      durationHours?: number;
    },
  ): Promise<MessageDTO> {
    // a mensagem carrega a autorização: castigo, regras, canal somente-leitura
    const message = await this.messages.create(input.channelId, authorId, input.question);
    const expiresAt = input.durationHours
      ? new Date(Date.now() + input.durationHours * 3600 * 1000)
      : null;
    await this.prisma.poll.create({
      data: {
        messageId: message.id,
        question: input.question,
        options: input.options,
        multi: !!input.multi,
        expiresAt,
      },
    });
    // recarrega para o DTO já sair com a enquete montada
    return this.messages.getDTO(message.id);
  }

  /**
   * Vota (ou desvota, clicando de novo na mesma opção).
   *
   * Sem `multi`, votar numa opção apaga o voto anterior — é o comportamento do
   * Discord, e é o que impede a mesma pessoa de inflar a contagem.
   */
  async vote(userId: string, messageId: string, optionIndex: number): Promise<Poll> {
    const { poll, channelId } = await this.carregar(messageId);
    await this.guilds.assertCanViewChannel(userId, channelId);
    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      throw new BadRequestException("Opção inválida");
    }
    if (isPollClosed({ expiresAt: poll.expiresAt?.toISOString() ?? null, closedAt: poll.closedAt?.toISOString() ?? null })) {
      throw new BadRequestException("Esta enquete já foi encerrada");
    }

    const meu = await this.prisma.pollVote.findUnique({
      where: { pollId_userId_optionIndex: { pollId: poll.id, userId, optionIndex } },
      select: { id: true },
    });
    if (meu) {
      await this.prisma.pollVote.delete({ where: { id: meu.id } });
    } else {
      await this.prisma.$transaction(async (tx) => {
        if (!poll.multi) {
          await tx.pollVote.deleteMany({ where: { pollId: poll.id, userId } });
        }
        await tx.pollVote.create({ data: { pollId: poll.id, userId, optionIndex } });
      });
    }
    return this.emitirAtualizacao(poll.id, messageId, channelId);
  }

  /** Encerra a enquete: o autor da mensagem ou a moderação do canal. */
  async close(userId: string, messageId: string): Promise<Poll> {
    const { poll, channelId, authorId } = await this.carregar(messageId);
    await this.guilds.assertCanViewChannel(userId, channelId);
    if (authorId !== userId && !(await this.guilds.canModerateChannel(userId, channelId))) {
      throw new ForbiddenException("Só o autor ou a moderação encerra a enquete");
    }
    if (!poll.closedAt) {
      await this.prisma.poll.update({
        where: { id: poll.id },
        data: { closedAt: new Date() },
      });
    }
    return this.emitirAtualizacao(poll.id, messageId, channelId);
  }

  /** Quem votou em cada opção — só a moderação do canal enxerga. */
  async voters(userId: string, messageId: string): Promise<PollVoters> {
    const { poll, channelId } = await this.carregar(messageId);
    await this.guilds.assertCanViewChannel(userId, channelId);
    if (!(await this.guilds.canModerateChannel(userId, channelId))) {
      throw new ForbiddenException("Só a moderação vê quem votou");
    }
    const votes = await this.prisma.pollVote.findMany({
      where: { pollId: poll.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      messageId,
      byOption: poll.options.map((_, index) => ({
        index,
        users: votes.filter((v) => v.optionIndex === index).map((v) => toPublicUser(v.user)),
      })),
    };
  }

  /**
   * Meus votos nas enquetes de um canal.
   *
   * Existe porque o DTO da mensagem é o mesmo para todo mundo (um broadcast não
   * tem espectador), então a marcação "eu votei aqui" não cabe nele. O cliente
   * pede esta lista ao abrir o canal e casa por `messageId`.
   */
  async myVotes(userId: string, channelId: string) {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const votes = await this.prisma.pollVote.findMany({
      where: { userId, poll: { message: { channelId } } },
      select: { optionIndex: true, poll: { select: { messageId: true } } },
    });
    const porMensagem = new Map<string, number[]>();
    for (const v of votes) {
      const id = v.poll.messageId;
      porMensagem.set(id, [...(porMensagem.get(id) ?? []), v.optionIndex]);
    }
    return Array.from(porMensagem, ([messageId, optionIndexes]) => ({ messageId, optionIndexes }));
  }

  /** Recontagem + broadcast na sala do canal. */
  private async emitirAtualizacao(
    pollId: string,
    messageId: string,
    channelId: string,
  ): Promise<Poll> {
    const [poll, votes] = await Promise.all([
      this.prisma.poll.findUnique({ where: { id: pollId }, select: POLL_SELECT }),
      this.prisma.pollVote.findMany({
        where: { pollId },
        select: { optionIndex: true, userId: true },
      }),
    ]);
    if (!poll) throw new NotFoundException("Enquete não encontrada");
    // sem espectador: `me` sai false e cada cliente preserva a própria marcação
    const dto = tallyPoll(poll, votes);
    this.realtime.emitToChannel(channelId, WS_EVENTS.POLL_UPDATED, { channelId, poll: dto });
    return dto;
  }

  private async carregar(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true, authorId: true, poll: { select: POLL_SELECT } },
    });
    if (!message?.poll) throw new NotFoundException("Enquete não encontrada");
    return { poll: message.poll, channelId: message.channelId, authorId: message.authorId };
  }
}
