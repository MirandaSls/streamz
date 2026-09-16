import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WS_EVENTS } from "@streamz/shared";
import type {
  ApelidoDeAmigoEvent,
  FriendLists,
  FriendRequest,
  FriendRequestEvent,
  PublicUser,
  RelationshipKind,
  UserBlockedEvent,
  UsuarioIgnoradoEvent,
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
    const [rows, blocks, apelidoRows, ignoreRows] = await Promise.all([
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
      // ── menus de contexto ── apelido só sobrevive enquanto a amizade dura
      // (ver `apagarApelidosDeAmigo`), então tudo aqui já é de amigo atual
      this.prisma.friendNickname.findMany({
        where: { ownerId: meId },
        select: { targetId: true, nickname: true },
      }),
      this.prisma.userIgnore.findMany({
        where: { ignorerId: meId },
        include: { ignored: true },
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

    const apelidos: Record<string, string> = {};
    for (const a of apelidoRows) apelidos[a.targetId] = a.nickname;

    return {
      friends,
      incoming,
      outgoing,
      blocked: blocks.map((b) => toPublicUser(b.blocked)),
      apelidos,
      ignored: ignoreRows.map((i) => toPublicUser(i.ignored)),
    };
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
    // quem recebe vê o pedido na hora; quem enviou atualiza a aba "Enviados" em
    // todas as suas conexões — cada lado recebe o *outro* dentro do pedido
    this.realtime.emitToUser(alvo.id, WS_EVENTS.FRIEND_REQUEST, {
      request: this.toRequest(row, row.requester),
      direcao: "incoming",
    } satisfies FriendRequestEvent);
    const meu = this.toRequest(row, alvo);
    this.realtime.emitToUser(meId, WS_EVENTS.FRIEND_REQUEST, {
      request: meu,
      direcao: "outgoing",
    } satisfies FriendRequestEvent);
    return meu;
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

    const apelidos = await this.apelidosEntre(meId, otherId);
    await this.prisma.$transaction([
      this.prisma.friendship.delete({ where: { id: row.id } }),
      this.prisma.friendNickname.deleteMany({
        where: { OR: [{ ownerId: meId, targetId: otherId }, { ownerId: otherId, targetId: meId }] },
      }),
    ]);
    this.realtime.emitToUser(otherId, WS_EVENTS.FRIEND_REMOVED, { userId: meId });
    this.realtime.emitToUser(meId, WS_EVENTS.FRIEND_REMOVED, { userId: otherId });
    this.avisarApelidosApagados(apelidos);
    return { removed: otherId };
  }

  // ── bloqueio ───────────────────────────────────────────────

  /** Bloqueia alguém: derruba a relação existente e barra novas interações. */
  async block(meId: string, otherId: string): Promise<PublicUser> {
    if (meId === otherId) throw new BadRequestException("Você não pode bloquear a si mesmo");
    const alvo = await this.prisma.user.findUnique({ where: { id: otherId } });
    if (!alvo) throw new NotFoundException("Usuário não encontrado");

    // a DM 1-a-1 usa a mesma chave canônica do par (`Channel.pairKey`), então
    // achá-la é uma consulta só. Ela sai da **minha** coluna junto com o
    // bloqueio: o histórico continua (é dos dois lados, e `DMHidden` guarda o
    // instante, não apaga nada), mas quem bloqueou não fica com a conversa do
    // bloqueado na barra lateral. E ela não volta sozinha, porque a partir
    // daqui ele não consegue mais escrever nela — ver
    // `MessagesService.assertDMNaoBloqueada`.
    const dm = await this.prisma.channel.findUnique({
      where: { pairKey: this.pairKey(meId, otherId) },
      select: { id: true },
    });
    // apelido de amigo não sobrevive ao bloqueio, nos dois sentidos
    const apelidos = await this.apelidosEntre(meId, otherId);

    await this.prisma.$transaction([
      this.prisma.friendship.deleteMany({ where: { pairKey: this.pairKey(meId, otherId) } }),
      this.prisma.friendNickname.deleteMany({
        where: { OR: [{ ownerId: meId, targetId: otherId }, { ownerId: otherId, targetId: meId }] },
      }),
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: meId, blockedId: otherId } },
        create: { blockerId: meId, blockedId: otherId },
        update: {},
      }),
      ...(dm
        ? [
            this.prisma.dMHidden.upsert({
              where: { userId_channelId: { userId: meId, channelId: dm.id } },
              create: { userId: meId, channelId: dm.id },
              update: { hiddenAt: new Date() },
            }),
          ]
        : []),
    ]);

    // o outro lado só vê a relação sumir — nunca que foi um bloqueio
    const dto = toPublicUser(alvo);
    // a conversa some das minhas conexões na hora (o mesmo aviso do "fechar
    // conversa" do DMsService); do outro lado nada muda, senão o sumiço
    // entregaria o bloqueio
    if (dm) {
      this.realtime.emitToUser(meId, WS_EVENTS.CHANNEL_DELETED, {
        channelId: dm.id,
        guildId: null,
      });
    }
    this.realtime.emitToUser(otherId, WS_EVENTS.FRIEND_REMOVED, { userId: meId });
    this.realtime.emitToUser(meId, WS_EVENTS.USER_BLOCKED, {
      userId: otherId,
      blocked: true,
      user: dto,
    } satisfies UserBlockedEvent);
    this.avisarApelidosApagados(apelidos);
    return dto;
  }

  async unblock(meId: string, otherId: string): Promise<{ unblocked: string }> {
    await this.prisma.block
      .delete({ where: { blockerId_blockedId: { blockerId: meId, blockedId: otherId } } })
      .catch(() => undefined); // idempotente: já não estava bloqueado
    const alvo = await this.prisma.user.findUnique({ where: { id: otherId } });
    if (alvo) {
      this.realtime.emitToUser(meId, WS_EVENTS.USER_BLOCKED, {
        userId: otherId,
        blocked: false,
        user: toPublicUser(alvo),
      } satisfies UserBlockedEvent);
    }
    return { unblocked: otherId };
  }

  // ── menus de contexto: apelido de amigo ──────────────────────

  /**
   * Apelido que só eu vejo no lugar do nome do amigo. Exige amizade
   * `ACCEPTED` — o texto já chega aparado e dentro do teto (schema zod).
   */
  async definirApelidoDeAmigo(
    meId: string,
    targetId: string,
    apelido: string,
  ): Promise<ApelidoDeAmigoEvent> {
    await this.assertAmigos(meId, targetId);
    await this.prisma.friendNickname.upsert({
      where: { ownerId_targetId: { ownerId: meId, targetId } },
      create: { ownerId: meId, targetId, nickname: apelido },
      update: { nickname: apelido },
    });
    const dto: ApelidoDeAmigoEvent = { userId: targetId, apelido };
    this.realtime.emitToUser(meId, WS_EVENTS.FRIEND_NICKNAME_UPDATED, dto);
    return dto;
  }

  /** Idempotente: remover apelido que não existe também responde `null`. */
  async removerApelidoDeAmigo(meId: string, targetId: string): Promise<ApelidoDeAmigoEvent> {
    await this.prisma.friendNickname.deleteMany({ where: { ownerId: meId, targetId } });
    const dto: ApelidoDeAmigoEvent = { userId: targetId, apelido: null };
    this.realtime.emitToUser(meId, WS_EVENTS.FRIEND_NICKNAME_UPDATED, dto);
    return dto;
  }

  private async assertAmigos(meId: string, targetId: string): Promise<void> {
    const row = await this.prisma.friendship.findUnique({
      where: { pairKey: this.pairKey(meId, targetId) },
    });
    if (!row || row.status !== "ACCEPTED") {
      throw new BadRequestException("Só é possível dar apelido a amigos");
    }
  }

  /** Apelidos de amigo entre os dois, nos dois sentidos — para avisar quem os perde. */
  private async apelidosEntre(
    a: string,
    b: string,
  ): Promise<{ ownerId: string; targetId: string }[]> {
    return this.prisma.friendNickname.findMany({
      where: { OR: [{ ownerId: a, targetId: b }, { ownerId: b, targetId: a }] },
      select: { ownerId: true, targetId: true },
    });
  }

  /** Avisa cada dono que perdeu o apelido (a linha já foi apagada por quem chamou). */
  private avisarApelidosApagados(apelidos: { ownerId: string; targetId: string }[]): void {
    for (const a of apelidos) {
      this.realtime.emitToUser(a.ownerId, WS_EVENTS.FRIEND_NICKNAME_UPDATED, {
        userId: a.targetId,
        apelido: null,
      } satisfies ApelidoDeAmigoEvent);
    }
  }

  // ── menus de contexto: ignorar ───────────────────────────────

  /**
   * Ignorar é diferente de bloquear: o ignorado não fica sabendo, a amizade
   * não é desfeita e nada muda para ele. O efeito é todo do lado de quem
   * ignora, e é a web que aplica (mensagens recolhidas, sem notificação).
   */
  async ignorarUsuario(meId: string, targetId: string): Promise<UsuarioIgnoradoEvent> {
    if (meId === targetId) throw new BadRequestException("Você não pode ignorar a si mesmo");
    const alvo = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!alvo) throw new NotFoundException("Usuário não encontrado");

    await this.prisma.userIgnore.upsert({
      where: { ignorerId_ignoredId: { ignorerId: meId, ignoredId: targetId } },
      create: { ignorerId: meId, ignoredId: targetId },
      update: {},
    });
    const dto: UsuarioIgnoradoEvent = { userId: targetId, ignorado: true, user: toPublicUser(alvo) };
    this.realtime.emitToUser(meId, WS_EVENTS.USER_IGNORED, dto);
    return dto;
  }

  /** Idempotente: deixar de ignorar quem já não estava ignorado também responde `false`. */
  async deixarDeIgnorar(meId: string, targetId: string): Promise<UsuarioIgnoradoEvent> {
    if (meId === targetId) throw new BadRequestException("Você não pode ignorar a si mesmo");
    const alvo = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!alvo) throw new NotFoundException("Usuário não encontrado");

    await this.prisma.userIgnore
      .delete({ where: { ignorerId_ignoredId: { ignorerId: meId, ignoredId: targetId } } })
      .catch(() => undefined); // idempotente: já não estava ignorado
    const dto: UsuarioIgnoradoEvent = { userId: targetId, ignorado: false, user: toPublicUser(alvo) };
    this.realtime.emitToUser(meId, WS_EVENTS.USER_IGNORED, dto);
    return dto;
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
