import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WS_EVENTS } from "@streamz/shared";
import type { PublicUser, ThreadView } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { MessagesService } from "./messages.service";
import { toPublicUser } from "../../common/dto";

/** Quantos avatares a lista e o "ver thread" mostram. */
const THREAD_FACES = 5;

/**
 * Threads nomeadas.
 *
 * Uma thread é o *nome* de uma mensagem raiz que já agrupa respostas por
 * `parentId` — nada de uma segunda tabela de mensagens. Raiz sem linha em
 * `Thread` continua funcionando como thread sem nome, que é o que existia
 * antes desta feature (compatibilidade com o histórico).
 */
@Injectable()
export class ThreadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
    private readonly messages: MessagesService,
  ) {}

  /** Threads do canal, ativas primeiro e mais recentes no topo. */
  async list(channelId: string, userId: string, archived?: boolean): Promise<ThreadView[]> {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const rows = await this.prisma.thread.findMany({
      where: { channelId, ...(archived === undefined ? {} : { archived }) },
      include: { createdBy: true },
      orderBy: { createdAt: "desc" },
    });
    return this.toViews(rows);
  }

  /** Cria (ou renomeia, se já existir) a thread de uma mensagem raiz. */
  async create(
    channelId: string,
    userId: string,
    rootId: string,
    name: string,
  ): Promise<ThreadView> {
    // criar thread é escrever no canal: mesma permissão de postar
    await this.guilds.assertCanPostChannel(userId, channelId);
    const root = await this.prisma.message.findUnique({
      where: { id: rootId },
      select: { channelId: true, parentId: true, type: true },
    });
    if (!root || root.channelId !== channelId) throw new NotFoundException("Mensagem não encontrada");
    if (root.parentId) throw new BadRequestException("Uma resposta não inicia uma thread");
    if (root.type !== "DEFAULT") {
      throw new BadRequestException("Mensagem do sistema não inicia uma thread");
    }

    const row = await this.prisma.thread.upsert({
      where: { id: rootId },
      create: { id: rootId, channelId, name, createdById: userId },
      update: { name },
      include: { createdBy: true },
    });
    const view = (await this.toViews([row]))[0];
    this.emitir(channelId, view);
    return view;
  }

  /** Renomeia e/ou arquiva. Só quem criou a thread ou a moderação do canal. */
  async update(
    channelId: string,
    userId: string,
    threadId: string,
    patch: { name?: string; archived?: boolean },
  ): Promise<ThreadView> {
    const atual = await this.prisma.thread.findUnique({ where: { id: threadId } });
    if (!atual || atual.channelId !== channelId) throw new NotFoundException("Thread não encontrada");
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    const moderador = access.tipo === "guild" && access.member.role !== "MEMBER";
    if (atual.createdById !== userId && !moderador) {
      throw new ForbiddenException("Só quem criou a thread (ou a moderação) pode alterá-la");
    }
    const row = await this.prisma.thread.update({
      where: { id: threadId },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.archived === undefined ? {} : { archived: patch.archived }),
      },
      include: { createdBy: true },
    });
    const view = (await this.toViews([row]))[0];
    this.emitir(channelId, view);
    return view;
  }

  /**
   * Avisa a sala do canal duas vezes de propósito: a lista de threads muda
   * (`thread.updated`) e a mensagem raiz também — é ela que mostra o "ver
   * thread" na timeline, e sem `message.updated` o chip só apareceria no
   * próximo carregamento do histórico.
   */
  private async emitir(channelId: string, thread: ThreadView) {
    this.realtime.emitToChannel(channelId, WS_EVENTS.THREAD_UPDATED, { channelId, thread });
    this.realtime.emitToChannel(
      channelId,
      WS_EVENTS.MESSAGE_UPDATED,
      await this.messages.getDTO(thread.id),
    );
  }

  /**
   * Completa as threads com o que só as respostas sabem: quantas são, quem
   * participa e quando foi a última. Duas consultas para a lista inteira.
   */
  private async toViews(
    rows: {
      id: string;
      channelId: string;
      name: string;
      archived: boolean;
      createdAt: Date;
      createdBy: Parameters<typeof toPublicUser>[0];
    }[],
  ): Promise<ThreadView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const respostas = await this.prisma.message.findMany({
      where: { parentId: { in: ids } },
      select: { parentId: true, createdAt: true, author: true },
      orderBy: { createdAt: "asc" },
    });

    const contagem = new Map<string, number>();
    const ultima = new Map<string, Date>();
    const faces = new Map<string, PublicUser[]>();
    for (const r of respostas) {
      if (!r.parentId) continue;
      contagem.set(r.parentId, (contagem.get(r.parentId) ?? 0) + 1);
      ultima.set(r.parentId, r.createdAt);
      const lista = faces.get(r.parentId) ?? [];
      if (lista.length < THREAD_FACES && !lista.some((u) => u.id === r.author.id)) {
        lista.push(toPublicUser(r.author));
      }
      faces.set(r.parentId, lista);
    }

    return rows.map((r) => ({
      id: r.id,
      channelId: r.channelId,
      name: r.name,
      archived: r.archived,
      messageCount: contagem.get(r.id) ?? 0,
      participants: faces.get(r.id) ?? [],
      lastMessageAt: ultima.get(r.id)?.toISOString() ?? null,
      createdBy: toPublicUser(r.createdBy),
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
