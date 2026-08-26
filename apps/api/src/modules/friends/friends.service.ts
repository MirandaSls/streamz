import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WS_EVENTS } from "@streamz/shared";
import type {
  FriendLists,
  FriendRequest,
  PublicUser,
  RelationshipKind,
} from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { toPublicUser, type PublicUserRow } from "../../common/dto";
import { RealtimeService } from "../realtime/realtime.service";

/**
 * Amizades e bloqueio.
 *
 * Uma amizade é **uma linha só** (`Friendship`), com `pairKey` canônico
 * ("menor:maior") — é o que impede o estado impossível "A é amigo de B mas B
 * não é de A" e a corrida dos dois lados pedirem ao mesmo tempo. `PENDING` é o
 * pedido, `ACCEPTED` a amizade; a direção (`requesterId`) só interessa
 * enquanto o pedido está pendente.
 *
 * O bloqueio, ao contrário, é direcional: A bloqueia B sem que B saiba. Quem
 * bloqueia perde a amizade e o pedido pendente na hora, e a partir daí nenhum
 * dos dois lados abre DM nem manda pedido — mas a API nunca conta a B que foi
 * bloqueado (a `relationship` volta `none`), como o Discord.
 */
@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Chave canônica do par: a mesma para (a,b) e (b,a). */
  private pairKey(a: string, b: string): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  // ── leitura ────────────────────────────────────────────────

  /** As quatro listas da página Amigos, numa consulta por assunto. */
  async lists(meId: string): Promise<FriendLists> {
    const [rows, blocks] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { OR: [{ requesterId: meId }, { addresseeId: meId }] },
        include: { requester: true, addressee: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.block.findMany({
        where: { blockerId: meId },
        include: { blocked: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const friends: PublicUser[] = [];
    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];
    for (const r of rows) {
      const outro = r.requesterId === meId ? r.addressee : r.requester;
      if (r.status === "ACCEPTED") {
        friends.push(toPublicUser(outro));
      } else if (r.addresseeId === meId) {
        incoming.push(this.toRequest(r, outro));
      } else {
        outgoing.push(this.toRequest(r, outro));
      }
    }
    friends.sort((a, b) => a.username.localeCompare(b.username));

    return { friends, incoming, outgoing, blocked: blocks.map((b) => toPublicUser(b.blocked)) };
  }

  /** Ids dos meus amigos — usado pelos "amigos em comum" do perfil. */
  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  }

  /**
   * Minha relação com outro usuário. "Ele me bloqueou" volta como `none`: o
   * cliente não deve conseguir descobrir um bloqueio que não é dele.
   */
  async relationship(meId: string, otherId: string): Promise<RelationshipKind> {
    if (meId === otherId) return "self";
    const [amizade, bloqueio] = await Promise.all([
      this.prisma.friendship.findUnique({ where: { pairKey: this.pairKey(meId, otherId) } }),
      this.prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: meId, blockedId: otherId } },
      }),
    ]);
    if (bloqueio) return "blocked";
    if (!amizade) return "none";
    if (amizade.status === "ACCEPTED") return "friend";
    return amizade.requesterId === meId ? "outgoing" : "incoming";
  }

  /** true se qualquer um dos dois bloqueou o outro. */
  async blockedBetween(a: string, b: string): Promise<boolean> {
    const n = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return n > 0;
  }

  /**
   * Barreira única do bloqueio. Quem for abrir DM ou mandar pedido chama isto
   * antes — a mensagem é a mesma nos dois sentidos de propósito: dizer "ele te
   * bloqueou" entregaria o bloqueio a quem foi bloqueado.
   */
  async assertNotBlocked(a: string, b: string): Promise<void> {
    if (await this.blockedBetween(a, b)) {
      throw new ForbiddenException("Não é possível interagir com este usuário");
    }
  }

  // ── pedidos ────────────────────────────────────────────────

  /** Manda um pedido de amizade por nome de usuário (como o Discord). */
  async request(meId: string, username: string): Promise<FriendRequest> {
    const alvo = await this.prisma.user.findUnique({ where: { username: username.trim() } });
    if (!alvo) throw new NotFoundException("Não encontramos ninguém com esse nome de usuário");
    if (alvo.id === meId) throw new BadRequestException("Você não pode adicionar a si mesmo");
    await this.assertNotBlocked(meId, alvo.id);

    const pairKey = this.pairKey(meId, alvo.id);
    const existente = await this.prisma.friendship.findUnique({
      where: { pairKey },
      include: { requester: true, addressee: true },
    });
    if (existente) {
      if (existente.status === "ACCEPTED") {
        throw new BadRequestException("Vocês já são amigos");
      }
      // pedido cruzado: ele já tinha pedido, então isto é um "aceitar"
      if (existente.addresseeId === meId) return this.acceptRow(meId, existente.id);
      throw new BadRequestException("Pedido já enviado");
    }

    const row = await this.prisma.friendship.create({
      data: { requesterId: meId, addresseeId: alvo.id, pairKey },
      include: { requester: true, addressee: true },
    });
    // quem recebe vê o pedido na hora; quem enviou atualiza a aba "enviados"
    this.realtime.emitToUser(alvo.id, WS_EVENTS.FRIEND_REQUEST, {
      request: this.toRequest(row, row.requester),
    });
    return this.toRequest(row, alvo);
  }

  /** Aceita um pedido recebido. Devolve o novo amigo. */
  async accept(meId: string, requestId: string): Promise<FriendRequest> {
    return this.acceptRow(meId, requestId);
  }

  private async acceptRow(meId: string, requestId: string): Promise<FriendRequest> {
    const row = await this.prisma.friendship.findUnique({
      where: { id: requestId },
      include: { requester: true, addressee: true },
    });
    if (!row || row.status !== "PENDING") throw new NotFoundException("Pedido não encontrado");
    if (row.addresseeId !== meId) throw new ForbiddenException("Este pedido não é seu");
    await this.assertNotBlocked(row.requesterId, row.addresseeId);

    const atualizado = await this.prisma.friendship.update({
      where: { id: row.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
      include: { requester: true, addressee: true },
    });
    // cada lado recebe o *outro* como amigo novo
    this.realtime.emitToUser(atualizado.requesterId, WS_EVENTS.FRIEND_ACCEPTED, {
      user: toPublicUser(atualizado.addressee),
    });
    this.realtime.emitToUser(atualizado.addresseeId, WS_EVENTS.FRIEND_ACCEPTED, {
      user: toPublicUser(atualizado.requester),
    });
    return this.toRequest(atualizado, atualizado.requester);
  }

  /**
   * Recusa um pedido recebido ou cancela um enviado — a mesma operação, porque
   * nos dois casos o efeito é apagar a linha pendente.
   */
  async removeRequest(meId: string, requestId: string): Promise<{ removed: string }> {
    const row = await this.prisma.friendship.findUnique({ where: { id: requestId } });
    if (!row || row.status !== "PENDING") throw new NotFoundException("Pedido não encontrado");
    if (row.requesterId !== meId && row.addresseeId !== meId) {
      throw new ForbiddenException("Este pedido não é seu");
    }
    await this.prisma.friendship.delete({ where: { id: row.id } });
    const outro = row.requesterId === meId ? row.addresseeId : row.requesterId;
    this.realtime.emitToUser(outro, WS_EVENTS.FRIEND_REMOVED, { userId: meId });
    this.realtime.emitToUser(meId, WS_EVENTS.FRIEND_REMOVED, { userId: outro });
    return { removed: requestId };
  }

  /** Desfaz uma amizade (dos dois lados — a linha é uma só). */
  async removeFriend(meId: string, otherId: string): Promise<{ removed: string }> {
    const row = await this.prisma.friendship.findUnique({
      where: { pairKey: this.pairKey(meId, otherId) },
    });
    if (!row || row.status !== "ACCEPTED") throw new NotFoundException("Vocês não são amigos");
    await this.prisma.friendship.delete({ where: { id: row.id } });
    this.realtime.emitToUser(otherId, WS_EVENTS.FRIEND_REMOVED, { userId: meId });
    this.realtime.emitToUser(meId, WS_EVENTS.FRIEND_REMOVED, { userId: otherId });
    return { removed: otherId };
  }

  // ── bloqueio ───────────────────────────────────────────────

  /** Bloqueia alguém: derruba a relação existente e barra novas interações. */
  async block(meId: string, otherId: string): Promise<PublicUser> {
    if (meId === otherId) throw new BadRequestException("Você não pode bloquear a si mesmo");
    const alvo = await this.prisma.user.findUnique({ where: { id: otherId } });
    if (!alvo) throw new NotFoundException("Usuário não encontrado");

    await this.prisma.$transaction([
      this.prisma.friendship.deleteMany({ where: { pairKey: this.pairKey(meId, otherId) } }),
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: meId, blockedId: otherId } },
        create: { blockerId: meId, blockedId: otherId },
        update: {},
      }),
    ]);

    // o outro lado só vê a relação sumir — nunca que foi um bloqueio
    this.realtime.emitToUser(otherId, WS_EVENTS.FRIEND_REMOVED, { userId: meId });
    this.realtime.emitToUser(meId, WS_EVENTS.USER_BLOCKED, { userId: otherId, blocked: true });
    return toPublicUser(alvo);
  }

  async unblock(meId: string, otherId: string): Promise<{ unblocked: string }> {
    await this.prisma.block
      .delete({ where: { blockerId_blockedId: { blockerId: meId, blockedId: otherId } } })
      .catch(() => undefined); // idempotente: já não estava bloqueado
    this.realtime.emitToUser(meId, WS_EVENTS.USER_BLOCKED, { userId: otherId, blocked: false });
    return { unblocked: otherId };
  }

  private toRequest(
    row: { id: string; requesterId: string; addresseeId: string; createdAt: Date },
    outro: PublicUserRow,
  ): FriendRequest {
    return {
      id: row.id,
      requesterId: row.requesterId,
      addresseeId: row.addresseeId,
      user: toPublicUser(outro),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
