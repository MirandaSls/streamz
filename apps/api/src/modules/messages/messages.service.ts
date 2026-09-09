import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type ChannelType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelsService } from "../channels/channels.service";
import { FriendsService } from "../friends/friends.service";
import { GuildsService } from "../guilds/guilds.service";
import { OnboardingService } from "../onboarding/onboarding.service";
import { tallyPoll } from "../polls/poll-core";
import { StorageService } from "../storage/storage.service";
import { ReadStateService } from "../read-state/read-state.service";
import { RealtimeService } from "../realtime/realtime.service";
import type {
  Attachment,
  Message as MessageDTO,
  MessageReplyRef,
  MessageType,
  PublicUser,
  ReactionGroup,
  SearchFilters,
  ThreadSummary,
  ChannelReadEvent,
} from "@streamz/shared";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MESSAGE_AROUND_RADIUS,
  Permission,
  WS_EVENTS,
  hasPermission,
  isEmptySearch,
  parseCustomEmoji,
  replySnippet,
} from "@streamz/shared";
import { toPublicUser, type PublicUserRow } from "../../common/dto";
import { toStickerDTO, type StickerRow } from "../emojis/dto";
import { toAttachmentDTO, type AttachmentRow } from "../uploads/attachment-dto";
import { EmojisService } from "../emojis/emojis.service";
import { StickersService } from "../emojis/stickers.service";
import { INTERACAO_DA_MENSAGEM_INCLUDE, toInteracaoDaMensagem } from "../interactions/dto";

const MESSAGE_INCLUDE = {
  author: true,
  reactions: true,
  attachments: true,
  // g-emojis-midia: figurinha enviada no lugar do texto
  sticker: true,
  channel: { select: { guildId: true } },
  _count: { select: { replies: true } },
  // ── a-mensagens ──
  // a mensagem citada entra no DTO como trecho, não inteira: a linha de
  // referência mostra uma linha só, e trazer o objeto todo dobraria a página.
  replyTo: {
    select: {
      id: true,
      content: true,
      author: true,
      _count: { select: { attachments: true } },
    },
  },
  pin: { select: { messageId: true } },
  thread: true,
  // h-moderacao: a enquete é uma face da mensagem, não uma mensagem à parte
  poll: { include: { votes: { select: { optionIndex: true, userId: true } } } },
  // ── j-bots ── a faixa "@fulano usou /play" acima da resposta de um bot.
  // Back-relation: a `Message` não tem coluna nenhuma para isto (ver
  // `interactions/dto.ts`).
  interacao: INTERACAO_DA_MENSAGEM_INCLUDE,
} as const;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/** Participantes de cada thread, por id da raiz (avatares empilhados). */
type ParticipantsByRoot = Map<string, PublicUser[]>;

/** Quantos avatares o "ver thread" mostra. */
const THREAD_FACES = 5;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly storage: StorageService,
    private readonly channels: ChannelsService,
    // g-emojis-midia: figurinha da mensagem e emoji personalizado de reação
    private readonly stickers: StickersService,
    private readonly emojis: EmojisService,
    // h-moderacao: aceite de regras recusa a escrita antes de gravar (o castigo
    // é checado pelo GuildsService, junto do resto da autorização)
    private readonly onboarding: OnboardingService,
    // escrever é ler: ver `marcarLidoNoEnvio`
    private readonly readState: ReadStateService,
    private readonly realtime: RealtimeService,
    // d-social: a barreira do bloqueio na conversa direta — ver
    // `assertDMNaoBloqueada`
    private readonly friends: FriendsService,
  ) {}

  async create(
    channelId: string,
    authorId: string,
    content: string,
    parentId?: string,
    attachmentIds?: string[],
    reply?: { replyToId?: string; replyMention?: boolean },
    stickerId?: string,
  ): Promise<MessageDTO> {
    // valida canal + associação + permissão de postar (privado/somente-leitura)
    const access = await this.guilds.assertCanPostChannel(authorId, channelId);
    // h-moderacao: castigo e regras não aceitas bloqueiam a escrita no servidor;
    // d-social: bloqueio recusa a escrita na conversa direta
    await this.assertPodeEscrever(access, channelId, authorId);
    // c-cargos: anexar é uma permissão à parte de escrever. A checagem é aqui,
    // e não no upload: o arquivo solto é privado de quem enviou e só vira
    // conteúdo do canal ao ser vinculado a uma mensagem.
    if ((attachmentIds?.length ?? 0) > 0 && !hasPermission(access.permissions, Permission.ATTACH_FILES)) {
      throw new ForbiddenException("Você não pode anexar arquivos neste canal");
    }
    // modo lento (b-canais): regra do canal, aplicada só em canal de servidor —
    // em conversa direta não há moderação nem intervalo mínimo
    if (access.tipo === "guild") {
      await this.channels.assertSlowmode(channelId, authorId, access.member.role);
    }

    if (parentId) {
      // resposta: o pai precisa existir, ser do mesmo canal e ser uma raiz
      const parent = await this.prisma.message.findUnique({
        where: { id: parentId },
        select: { channelId: true, parentId: true },
      });
      if (!parent || parent.channelId !== channelId) {
        throw new NotFoundException("Mensagem raiz não encontrada");
      }
      if (parent.parentId) {
        throw new BadRequestException("Não é possível responder a uma resposta");
      }
    }

    // reply (citação): a mensagem citada precisa ser do mesmo canal — citar
    // mensagem de outro canal vazaria conteúdo que o leitor talvez não veja.
    const replyToId = reply?.replyToId;
    if (replyToId) {
      const alvo = await this.prisma.message.findUnique({
        where: { id: replyToId },
        select: { channelId: true },
      });
      if (!alvo || alvo.channelId !== channelId) {
        throw new NotFoundException("Mensagem respondida não encontrada");
      }
    }

    // figurinha: precisa existir e ser de um servidor do autor (g-emojis-midia)
    if (stickerId) await this.stickers.assertPodeUsar(authorId, stickerId);

    const msg = await this.prisma.message.create({
      data: {
        channelId,
        authorId,
        content,
        parentId: parentId ?? null,
        replyToId: replyToId ?? null,
        // "@ ligado" é o padrão do Discord; só vale quando há citação
        replyMention: replyToId ? (reply?.replyMention ?? true) : false,
        stickerId: stickerId ?? null,
      },
      include: MESSAGE_INCLUDE,
    });

    // escrever num canal é tê-lo lido até aqui (ver `marcarLidoNoEnvio`)
    await this.marcarLidoNoEnvio(authorId, channelId, msg.createdAt, access.channel.guildId);

    // vincula só anexos do próprio autor e ainda soltos (evita forjar/roubar)
    const ids = (attachmentIds ?? []).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
    if (ids.length > 0) {
      await this.prisma.attachment.updateMany({
        where: { id: { in: ids }, uploaderId: authorId, messageId: null },
        data: { messageId: msg.id },
      });
      return this.getDTO(msg.id); // recarrega com os anexos vinculados
    }
    return this.toDTO(msg);
  }

  /**
   * A leitura que o envio implica, e o `channel.read` que ela gera.
   *
   * Quem escreve leu o que estava ali: é o que o Discord faz, e é o que o
   * cliente já fazia sozinho **quando o canal estava na tela**. Fora da tela
   * ninguém marcava nada — e o convite mandado pelo modal "Convidar amigos"
   * abria a conversa com a minha própria mensagem em negrito, contada como se
   * o destinatário tivesse escrito para mim.
   *
   * O evento vai para a sala do usuário (todas as sessões da conta, §4.2), como
   * o `POST /channels/:id/read`: mandar do site tem que apagar o negrito no
   * desktop sem F5. Uma falha aqui não pode derrubar o envio — a mensagem já
   * está gravada e o pior caso é um negrito a mais até o próximo `markRead`.
   */
  private async marcarLidoNoEnvio(
    authorId: string,
    channelId: string,
    at: Date,
    guildId: string | null,
  ): Promise<void> {
    try {
      const lido = await this.readState.marcarLidoAoEnviar(authorId, channelId, at);
      this.realtime.emitToUser(authorId, WS_EVENTS.CHANNEL_READ, {
        channelIds: [channelId],
        lastReadAt: lido.toISOString(),
        guildId,
      } satisfies ChannelReadEvent);
    } catch {
      // a mensagem já existe; o badge se resolve no próximo `markRead`
    }
  }

  /**
   * Mensagem narrada pelo sistema no canal ("X fixou uma mensagem"). O alvo vai
   * em `replyToId`: assim o cliente já tem o trecho e o "ir para a mensagem"
   * sem inventar um segundo mecanismo de referência.
   */
  async createSystem(
    channelId: string,
    authorId: string,
    type: MessageType,
    targetId?: string,
  ): Promise<MessageDTO> {
    const msg = await this.prisma.message.create({
      data: { channelId, authorId, content: "", type, replyToId: targetId ?? null },
      include: MESSAGE_INCLUDE,
    });
    return this.toDTO(msg);
  }

  /**
   * Histórico paginado por cursor (mais recentes primeiro), devolvido em ordem
   * cronológica. Só mensagens-raiz — respostas de thread vêm por `thread()`.
   */
  async history(
    channelId: string,
    userId: string,
    cursor?: string,
    take = 50,
  ): Promise<MessageDTO[]> {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const rows = await this.prisma.message.findMany({
      where: { channelId, parentId: null },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return this.toDTOs(rows.reverse());
  }

  /**
   * O mesmo histórico, **sem** o `assertCanViewChannel` — a única leitura de
   * mensagem do projeto que não passa pela autorização de canal.
   *
   * Existe para o painel do administrador da instância (`modules/admin`), que
   * por definição lê canal do qual não é membro. A autorização não sumiu: ela
   * mudou de lugar e virou o `PlatformAdminGuard` no controller, que é mais
   * forte que qualquer bit de servidor. Nada além do painel pode chamar isto —
   * o nome é comprido de propósito, para doer ao ser digitado noutro lugar.
   */
  async historicoSemChecagemDeAcesso(
    channelId: string,
    cursor?: string,
    take = 50,
  ): Promise<MessageDTO[]> {
    const rows = await this.prisma.message.findMany({
      where: { channelId, parentId: null },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return this.toDTOs(rows.reverse());
  }

  /**
   * Janela em torno de uma mensagem: ela, as `MESSAGE_AROUND_RADIUS` anteriores
   * e as seguintes. É o que permite "ir para a mensagem" (fixada, menção,
   * resultado de busca, resposta) sem paginar o histórico inteiro para trás.
   */
  async around(channelId: string, userId: string, messageId: string): Promise<MessageDTO[]> {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const alvo = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, parentId: true, createdAt: true },
    });
    if (!alvo || alvo.channelId !== channelId) {
      throw new NotFoundException("Mensagem não encontrada");
    }
    // uma resposta de thread não vive na timeline: a âncora é a raiz dela
    const ancora = alvo.parentId
      ? await this.prisma.message.findUnique({
          where: { id: alvo.parentId },
          select: { id: true, createdAt: true },
        })
      : alvo;
    if (!ancora) throw new NotFoundException("Mensagem não encontrada");

    const [antes, depois] = await Promise.all([
      this.prisma.message.findMany({
        where: { channelId, parentId: null, createdAt: { lt: ancora.createdAt } },
        include: MESSAGE_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: MESSAGE_AROUND_RADIUS,
      }),
      this.prisma.message.findMany({
        where: { channelId, parentId: null, createdAt: { gte: ancora.createdAt } },
        include: MESSAGE_INCLUDE,
        orderBy: { createdAt: "asc" },
        take: MESSAGE_AROUND_RADIUS + 1,
      }),
    ]);
    return this.toDTOs([...antes.reverse(), ...depois]);
  }

  /** Uma thread: a mensagem-raiz seguida das respostas em ordem cronológica. */
  async thread(channelId: string, userId: string, parentId: string): Promise<MessageDTO[]> {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const parent = await this.prisma.message.findUnique({
      where: { id: parentId },
      include: MESSAGE_INCLUDE,
    });
    if (!parent || parent.channelId !== channelId || parent.parentId) {
      throw new NotFoundException("Thread não encontrada");
    }
    const replies = await this.prisma.message.findMany({
      where: { parentId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return this.toDTOs([parent, ...replies]);
  }

  /**
   * Busca dentro de um canal. Aceita os mesmos filtros da busca do servidor
   * (`from:`, `has:`, datas, `mentions:`); `in:` é ignorado aqui — o canal já
   * está fixado pela rota.
   */
  async search(
    channelId: string,
    userId: string,
    filters: SearchFilters,
    take = 30,
  ): Promise<MessageDTO[]> {
    await this.guilds.assertCanViewChannel(userId, channelId);
    if (isEmptySearch(filters)) return [];
    const where = await this.searchWhere(filters, [channelId]);
    if (!where) return [];
    const rows = await this.prisma.message.findMany({
      where,
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
    });
    return this.toDTOs(rows);
  }

  /**
   * Busca no servidor inteiro, restrita aos canais que **este** usuário
   * enxerga: a lista de canais visíveis é a fonte da autorização, e não há
   * caminho para um canal privado entrar no `where`.
   */
  async searchGuild(
    guildId: string,
    userId: string,
    filters: SearchFilters,
    take = 50,
  ): Promise<MessageDTO[]> {
    await this.guilds.assertMember(userId, guildId);
    if (isEmptySearch(filters)) return [];
    const visiveis = (await this.guilds.visibleChannelsForUser(userId)).filter(
      (c) => c.guildId === guildId,
    );
    let ids = visiveis.map((c) => c.id);
    if (filters.in) {
      const nome = filters.in.toLowerCase();
      const doNome = await this.prisma.channel.findMany({
        where: { guildId, id: { in: ids } },
        select: { id: true, name: true },
      });
      ids = doNome.filter((c) => (c.name ?? "").toLowerCase() === nome).map((c) => c.id);
    }
    if (ids.length === 0) return [];
    const where = await this.searchWhere(filters, ids);
    if (!where) return [];
    const rows = await this.prisma.message.findMany({
      where,
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
    });
    return this.toDTOs(rows);
  }

  /**
   * Traduz os filtros para o `where` do Prisma. Devolve `null` quando um filtro
   * não casa com ninguém (`from:` de um usuário que não existe) — assim a busca
   * responde "nada encontrado" em vez de ignorar o filtro e mostrar tudo.
   */
  private async searchWhere(
    filters: SearchFilters,
    channelIds: string[],
  ): Promise<Prisma.MessageWhereInput | null> {
    const and: Prisma.MessageWhereInput[] = [
      { channelId: { in: channelIds } },
      // mensagem de sistema não é conteúdo que alguém procure
      { type: "DEFAULT" },
    ];

    const texto = filters.text.trim();
    if (texto) and.push({ content: { contains: texto, mode: "insensitive" } });

    if (filters.from) {
      const autor = await this.prisma.user.findUnique({
        where: { username: filters.from },
        select: { id: true },
      });
      if (!autor) return null;
      and.push({ authorId: autor.id });
    }

    if (filters.mentions) {
      const alvo = await this.prisma.user.findUnique({
        where: { username: filters.mentions },
        select: { id: true, username: true },
      });
      if (!alvo) return null;
      // menção textual OU resposta com "@ ligado" ao próprio — a mesma regra do
      // não-lido (ver `mentionsMe` em @streamz/shared)
      and.push({
        OR: [
          { content: { contains: `@${alvo.username}`, mode: "insensitive" } },
          { replyMention: true, replyTo: { authorId: alvo.id } },
        ],
      });
    }

    for (const has of filters.has) {
      if (has === "link") and.push({ content: { contains: "http", mode: "insensitive" } });
      if (has === "image") and.push({ attachments: { some: { contentType: { startsWith: "image/" } } } });
      if (has === "file") and.push({ attachments: { some: {} } });
    }

    // `before:`/`after:` são dias, não instantes: o dia inteiro fica de fora.
    if (filters.before) and.push({ createdAt: { lt: new Date(`${filters.before}T00:00:00.000Z`) } });
    if (filters.after) and.push({ createdAt: { gt: new Date(`${filters.after}T23:59:59.999Z`) } });

    return { AND: and };
  }

  /** Edição: só o autor (e ainda membro do servidor) pode editar. */
  async edit(messageId: string, userId: string, content: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.guilds.assertCanViewChannel(userId, msg.channelId);
    if (msg.authorId !== userId) throw new ForbiddenException("Você só pode editar suas mensagens");
    if (msg.type !== "DEFAULT") throw new BadRequestException("Mensagem do sistema não é editável");

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
    return this.toDTO(updated);
  }

  /**
   * Remoção: o autor, ou um OWNER/ADMIN do servidor, pode apagar. Em conversa
   * direta não há moderador — só o autor apaga (canModerateChannel devolve false).
   */
  async remove(
    messageId: string,
    userId: string,
  ): Promise<{ channelId: string; parentId: string | null }> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");

    if (msg.authorId !== userId) {
      const canModerate = await this.guilds.canModerateChannel(userId, msg.channelId);
      if (!canModerate) throw new ForbiddenException("Sem permissão para apagar esta mensagem");
    } else {
      // autor: ainda precisa ter acesso ao canal (não foi expulso/removido)
      await this.guilds.assertCanViewChannel(userId, msg.channelId);
    }

    // apagar uma raiz remove as respostas em cascata (onDelete: Cascade)
    await this.prisma.message.delete({ where: { id: messageId } });
    return { channelId: msg.channelId, parentId: msg.parentId };
  }

  async addReaction(messageId: string, userId: string, emoji: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    const access = await this.guilds.assertCanViewChannel(userId, msg.channelId);
    // h-moderacao: reagir também é escrever — quem está de castigo não reage
    if (access.tipo === "guild" && access.channel.guildId) {
      await this.guilds.assertNotTimedOut(access.channel.guildId, userId);
    }
    // d-social: e pelo mesmo motivo o bloqueio vale aqui. A reação aparece com
    // nome e avatar para o outro lado e volta como notificação — barrar só o
    // envio deixaria a DM de quem bloqueou aberta ao assédio por emoji.
    await this.assertDMNaoBloqueada(access.channel, userId);
    // c-cargos: reagir é a permissão ADD_REACTIONS, não SEND_MESSAGES — dá para
    // ter um canal em que se reage sem poder escrever, e vice-versa
    if (!hasPermission(access.permissions, Permission.ADD_REACTIONS)) {
      throw new ForbiddenException("Você não pode reagir neste canal");
    }
    // `<:nome:id>`: só reage com emoji personalizado quem é membro do servidor
    // dono dele — a reação vai para todo mundo que lê o canal (g-emojis-midia)
    const custom = parseCustomEmoji(emoji);
    if (custom) await this.emojis.assertPodeUsar(userId, custom.id);
    await this.prisma.reaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji },
      update: {},
    });
    return this.getDTO(messageId);
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.guilds.assertCanViewChannel(userId, msg.channelId);
    await this.prisma.reaction
      .delete({ where: { messageId_userId_emoji: { messageId, userId, emoji } } })
      .catch(() => undefined); // idempotente: já não existia
    return this.getDTO(messageId);
  }

  /**
   * ── j-bots ── Tira a reação de **outra pessoa**.
   *
   * É o `DELETE /channels/:c/messages/:m/reactions/:e/:uid` do Discord, e lá
   * ele exige `MANAGE_MESSAGES`. Aqui também: tirar a reação alheia é
   * moderação, não é desreagir.
   *
   * Tirar a própria continua sendo `removeReaction` — se o alvo for quem
   * chamou, é para lá que vai, sem exigir permissão de moderação (é o que o
   * Discord faz quando o bot manda o próprio id em vez de `@me`).
   */
  async removeReactionOf(
    messageId: string,
    actorId: string,
    targetUserId: string,
    emoji: string,
  ): Promise<MessageDTO> {
    if (actorId === targetUserId) return this.removeReaction(messageId, actorId, emoji);

    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.assertPodeModerarReacoes(msg.channelId, actorId);

    await this.prisma.reaction
      .delete({ where: { messageId_userId_emoji: { messageId, userId: targetUserId, emoji } } })
      .catch(() => undefined); // idempotente: já não existia
    return this.getDTO(messageId);
  }

  /**
   * ── j-bots ── Limpa as reações de uma mensagem: todas, ou só as de um emoji.
   *
   * `emoji: null` = `DELETE .../reactions` (todas); preenchido =
   * `DELETE .../reactions/:emoji`. As duas exigem `MANAGE_MESSAGES`, como no
   * Discord — é o botão "remover todas as reações" da moderação.
   */
  async clearReactions(
    messageId: string,
    actorId: string,
    emoji: string | null,
  ): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.assertPodeModerarReacoes(msg.channelId, actorId);

    await this.prisma.reaction.deleteMany({
      where: { messageId, ...(emoji === null ? {} : { emoji }) },
    });
    return this.getDTO(messageId);
  }

  /**
   * `MANAGE_MESSAGES` no canal — a permissão de mexer na reação dos outros.
   *
   * Em conversa direta não há moderação (é o mesmo motivo pelo qual
   * `MANAGE_MESSAGES` fica de fora das permissões de DM, `permissoes.ts`): lá
   * cada um só tira a própria reação.
   */
  private async assertPodeModerarReacoes(channelId: string, userId: string): Promise<void> {
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    if (access.tipo !== "guild" || !hasPermission(access.permissions, Permission.MANAGE_MESSAGES)) {
      throw new ForbiddenException("Você não pode gerenciar as reações desta mensagem");
    }
  }

  /**
   * Liga/desliga a prévia de link da mensagem ("remover prévia" do menu). Só o
   * autor ou quem modera o canal — é conteúdo da mensagem de outra pessoa
   * (g-emojis-midia).
   */
  async setSuppressEmbeds(
    messageId: string,
    userId: string,
    suppress: boolean,
  ): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    await this.guilds.assertCanViewChannel(userId, msg.channelId);
    if (msg.authorId !== userId) {
      const canModerate = await this.guilds.canModerateChannel(userId, msg.channelId);
      if (!canModerate) throw new ForbiddenException("Sem permissão para alterar esta mensagem");
    }
    await this.prisma.message.update({
      where: { id: messageId },
      data: { suppressEmbeds: suppress },
    });
    return this.getDTO(messageId);
  }

  /**
   * h-moderacao: quem pode mesmo escrever neste canal agora.
   *
   * Fica junto do `create` porque é ali que a recusa precisa acontecer — antes
   * de gravar. Em conversa direta não há castigo nem regras, mas há bloqueio:
   * `ChannelAccess` obriga a tratar o ramo DM, e o ramo DM tem a sua própria
   * barreira (`assertDMNaoBloqueada`).
   */
  private async assertPodeEscrever(
    access: Awaited<ReturnType<GuildsService["assertCanPostChannel"]>>,
    channelId: string,
    authorId: string,
  ): Promise<void> {
    if (access.tipo !== "guild") {
      await this.assertDMNaoBloqueada(access.channel, authorId);
      return;
    }
    if (!access.channel.guildId) return;
    const guildId = access.channel.guildId;
    await this.guilds.assertNotTimedOut(guildId, authorId);
    if (await this.onboarding.blocksPosting(guildId, channelId, authorId)) {
      throw new ForbiddenException("Aceite as regras do servidor para poder escrever");
    }
  }

  /**
   * d-social: o bloqueio precisa valer na conversa **que já existe**, não só na
   * hora de abri-la.
   *
   * Sem isto, bloquear era decorativo contra assédio: A e B já tinham
   * conversado, B bloqueava A, e A seguia gravando mensagens no `channelId` que
   * já conhecia — o `assertNotBlocked` do `DMsService.openWith` só barra a
   * abertura, enquanto o canal, os dois `ChannelMember` e a sala ao vivo
   * continuavam de pé (quem bloqueou recebia a mensagem na hora, porque entrou
   * na sala do canal no connect). Pior: cada mensagem trazia a conversa de
   * volta para a coluna de quem bloqueou, porque `DMsService.list` reexibe a
   * conversa fechada assim que chega mensagem depois do fechamento.
   *
   * Vale nos dois sentidos, como toda barreira de bloqueio daqui
   * (`blockedBetween`): quem bloqueou também não escreve para quem bloqueou.
   * Além de ser o comportamento do Discord, o contrário seria a mão-de-volta do
   * assédio — bloquear e continuar mandando mensagem que o outro não pode
   * responder.
   *
   * Só na DM de 1-a-1 (`type: "DM"`). No grupo o canal não é de uma dupla:
   * recusar o envio porque *alguém* ali bloqueou *alguém* calaria a conversa
   * inteira — dois participantes brigados derrubariam o grupo para todo mundo.
   * O grupo se defende na entrada, onde a dupla ainda é identificável
   * (`DMsService.createGroup` e `addMember` chamam `assertNotBlocked`).
   */
  private async assertDMNaoBloqueada(
    channel: { id: string; type: ChannelType },
    userId: string,
  ): Promise<void> {
    if (channel.type !== "DM") return;
    const outro = await this.prisma.channelMember.findFirst({
      where: { channelId: channel.id, userId: { not: userId } },
      select: { userId: true },
    });
    // conversa sem o outro lado (conta apagada): não há bloqueio a checar
    if (!outro) return;
    await this.friends.assertNotBlocked(userId, outro.userId);
  }

  /** Busca uma mensagem completa (autor + reações) e devolve o DTO. */
  async getDTO(messageId: string): Promise<MessageDTO> {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });
    if (!msg) throw new NotFoundException("Mensagem não encontrada");
    return this.toDTO(msg);
  }

  /** DTOs de uma página inteira, com os participantes das threads em lote. */
  private async toDTOs(rows: MessageRow[]): Promise<MessageDTO[]> {
    const participantes = await this.threadParticipants(
      rows.filter((m) => m.thread).map((m) => m.id),
    );
    return Promise.all(rows.map((m) => this.toDTO(m, participantes)));
  }

  /**
   * Autores das respostas de cada thread, para os avatares empilhados. Uma
   * consulta só para a página inteira — por mensagem seria uma por linha.
   */
  private async threadParticipants(rootIds: string[]): Promise<ParticipantsByRoot> {
    const out: ParticipantsByRoot = new Map();
    if (rootIds.length === 0) return out;
    const rows = await this.prisma.message.findMany({
      where: { parentId: { in: rootIds } },
      select: { parentId: true, author: true },
      orderBy: { createdAt: "asc" },
    });
    for (const r of rows) {
      if (!r.parentId) continue;
      const lista = out.get(r.parentId) ?? [];
      if (lista.length >= THREAD_FACES || lista.some((u) => u.id === r.author.id)) continue;
      lista.push(toPublicUser(r.author));
      out.set(r.parentId, lista);
    }
    return out;
  }

  /**
   * DTO da mensagem. Assíncrono porque a URL de cada anexo é assinada na hora
   * (URL com expiração; ver StorageService.attachmentUrl).
   */
  private async toDTO(m: MessageRow, participantes?: ParticipantsByRoot): Promise<MessageDTO> {
    return {
      id: m.id,
      channelId: m.channelId,
      guildId: m.channel.guildId,
      content: m.content,
      parentId: m.parentId,
      replyCount: m._count.replies,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      author: toPublicUser(m.author),
      type: m.type,
      reactions: this.groupReactions(m.reactions),
      attachments: await Promise.all(
        m.attachments.map((a) => toAttachmentDTO(this.storage, a)),
      ),
      sticker: m.sticker ? toStickerDTO(m.sticker) : null,
      suppressEmbeds: m.suppressEmbeds,
      replyTo: this.toReplyRef(m.replyTo),
      replyMention: m.replyMention,
      pinned: Boolean(m.pin),
      thread: this.toThreadSummary(m, participantes),
      // h-moderacao: a enquete viaja com a mensagem. O `me` sai vazio aqui (o
      // DTO não conhece o espectador) e é preenchido por
      // GET /channels/:id/polls/votes — ver PollsService.
      poll: m.poll ? tallyPoll(m.poll, m.poll.votes) : null,
      // ── j-bots ── null em toda mensagem que não veio de um comando de barra,
      // que é quase todas
      interacao: toInteracaoDaMensagem(m.interacao),
    };
  }

  private toReplyRef(
    r: {
      id: string;
      content: string;
      author: PublicUserRow;
      _count: { attachments: number };
    } | null,
  ): MessageReplyRef | null {
    if (!r) return null;
    return {
      id: r.id,
      author: toPublicUser(r.author),
      content: replySnippet(r.content),
      hasAttachments: r._count.attachments > 0,
    };
  }

  private toThreadSummary(m: MessageRow, participantes?: ParticipantsByRoot): ThreadSummary | null {
    if (!m.thread) return null;
    return {
      id: m.thread.id,
      name: m.thread.name,
      archived: m.thread.archived,
      messageCount: m._count.replies,
      participants: participantes?.get(m.id) ?? [],
      lastMessageAt: null,
    };
  }


  private groupReactions(rows: { emoji: string; userId: string }[]): ReactionGroup[] {
    const map = new Map<string, ReactionGroup>();
    for (const r of rows) {
      const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [] };
      g.count += 1;
      g.userIds.push(r.userId);
      map.set(r.emoji, g);
    }
    return Array.from(map.values());
  }
}
