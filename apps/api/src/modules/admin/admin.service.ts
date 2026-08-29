import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  ADMIN_PAGE_SIZE,
  nomeDaConversa,
  type AdminCall,
  type AdminCallLocation,
  type AdminChannelView,
  type AdminChannelsPage,
  type AdminGuildView,
  type AdminMessagesPage,
  type AdminOverview,
  type AdminUsersPage,
  type AdminUserView,
  type ChannelType,
  type PublicUser,
} from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { MessagesService } from "../messages/messages.service";
import { VoiceService } from "../voice/voice.service";
import { toPublicUser } from "../../common/dto";
import { PlatformAdminService } from "./platform-admin.service";
import type { VoiceMember } from "../voice/voice-state.store";

/** Presença que conta como "está com o app aberto" na visão geral. */
const PRESENTES = ["ONLINE", "IDLE", "DND"] as const;

/** Canal, do jeito que o painel precisa vê-lo: com servidor e contagem. */
const CANAL_SELECT = {
  id: true,
  name: true,
  type: true,
  guildId: true,
  private: true,
  createdAt: true,
  guild: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} as const;

/** O que `CANAL_SELECT` devolve — o argumento de `toChannelView`. */
type CanalRow = {
  id: string;
  name: string | null;
  type: ChannelType;
  guildId: string | null;
  private: boolean;
  createdAt: Date;
  guild: { id: string; name: string } | null;
  _count: { messages: number };
};

/**
 * As leituras do painel do administrador da instância.
 *
 * O serviço é só **leitura**: não banir, não apagar, não entrar em servidor. É
 * uma escolha, não uma etapa faltando — moderação já existe por servidor
 * (`modules/moderation`, com bitfield e hierarquia), e um segundo caminho de
 * escrita que ignorasse essa hierarquia seria a maneira mais fácil de furar as
 * regras que o resto do código gasta tanto para manter.
 *
 * A autorização não mora aqui: quem chama já passou pelo `PlatformAdminGuard`.
 * Por isso todo método é livre do `assertCanViewChannel` — é o único ponto do
 * projeto onde isso vale, e vale porque a checagem aconteceu uma camada acima.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly voice: VoiceService,
    private readonly mensagens: MessagesService,
    private readonly admins: PlatformAdminService,
  ) {}

  // ── visão geral ────────────────────────────────────────────

  async overview(): Promise<AdminOverview> {
    const [total, online, desativados, excluidos, servidores, texto, voz, conversas, mensagens] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: { status: { in: [...PRESENTES] }, deletedAt: null },
        }),
        this.prisma.user.count({ where: { disabledAt: { not: null }, deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: { not: null } } }),
        this.prisma.guild.count(),
        this.prisma.channel.count({ where: { type: { in: ["TEXT", "ANNOUNCEMENT"] } } }),
        this.prisma.channel.count({ where: { type: "VOICE" } }),
        this.prisma.channel.count({ where: { guildId: null } }),
        this.prisma.message.count(),
      ]);

    const salas = await this.voice.salasAbertas();
    const pessoas = new Set<string>();
    for (const membros of salas.values()) for (const m of membros) pessoas.add(m.userId);

    return {
      usuarios: { total, online, desativados, excluidos },
      servidores,
      canais: { texto, voz, conversas },
      mensagens,
      chamadasAtivas: salas.size,
      pessoasEmChamada: pessoas.size,
    };
  }

  // ── chamadas abertas ───────────────────────────────────────

  /**
   * Toda chamada em curso na instância, de servidor e de conversa na mesma
   * lista — é o que responde "onde essa pessoa está falando agora, e com quem".
   *
   * A ordenação põe as mais recentes em cima: o painel é olhado para saber o
   * que está acontecendo *agora*, não para auditar o passado.
   */
  async calls(): Promise<AdminCall[]> {
    const salas = await this.voice.salasAbertas();
    if (salas.size === 0) return [];

    const locais = await this.locaisDe([...salas.keys()]);
    const users = await this.usuariosPorId(
      [...salas.values()].flatMap((membros) => membros.map((m) => m.userId)),
    );

    const chamadas: AdminCall[] = [];
    for (const [channelId, membros] of salas) {
      const local = locais.get(channelId);
      // canal apagado com a chamada aberta: o estado é órfão, não há o que mostrar
      if (!local) continue;
      const participantes = membros
        .map((m) => this.participante(m, users))
        .filter((p): p is NonNullable<typeof p> => p !== null);
      if (participantes.length === 0) continue;
      const inicios = participantes
        .map((p) => p.entrouEm)
        .filter((v): v is number => typeof v === "number");
      chamadas.push({
        local,
        participantes,
        desde: inicios.length > 0 ? Math.min(...inicios) : null,
      });
    }
    // sem `desde` (estado antigo no Redis) vai para o fim, não para o topo
    return chamadas.sort((a, b) => (b.desde ?? 0) - (a.desde ?? 0));
  }

  private participante(m: VoiceMember, users: Map<string, PublicUser>) {
    const user = users.get(m.userId);
    if (!user) return null; // conta apagada no meio da chamada
    return {
      user,
      muted: m.muted,
      deafened: m.deafened,
      video: m.video,
      screen: m.screen,
      reconnecting: m.reconnecting ?? false,
      entrouEm: m.entrouEm ?? null,
    };
  }

  // ── usuários ───────────────────────────────────────────────

  /**
   * Todas as contas, com onde cada uma está falando agora.
   *
   * A localização da chamada é resolvida **uma vez** para a instância inteira e
   * cruzada com a página em memória: perguntar sala por sala daria uma ida ao
   * Redis por usuário listado.
   */
  async users(query: string | undefined, cursor: string | undefined): Promise<AdminUsersPage> {
    const q = query?.trim();
    const where = q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" as const } },
            { displayName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { _count: { select: { memberships: true, messages: true } } },
        // desempate por id: `createdAt` sozinho não é único e a paginação por
        // cursor pularia (ou repetiria) contas criadas no mesmo milissegundo
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: ADMIN_PAGE_SIZE + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
    ]);

    const pagina = rows.slice(0, ADMIN_PAGE_SIZE);
    const ondeEstao = await this.chamadasPorUsuario();

    const itens: AdminUserView[] = pagina.map((u) => ({
      user: toPublicUser(u),
      email: u.email,
      emailVerified: !!u.emailVerifiedAt,
      mfaEnabled: !!u.mfaEnabledAt,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
      disabledAt: u.disabledAt ? u.disabledAt.toISOString() : null,
      deletedAt: u.deletedAt ? u.deletedAt.toISOString() : null,
      servidores: u._count.memberships,
      mensagens: u._count.messages,
      admin: this.admins.ehEmailDeAdmin(u.email, !!u.emailVerifiedAt),
      chamada: ondeEstao.get(u.id) ?? null,
    }));

    return {
      itens,
      proximoCursor: rows.length > ADMIN_PAGE_SIZE ? pagina[pagina.length - 1].id : null,
      total,
    };
  }

  /** userId → onde ele está em chamada agora. Vazio quando não há chamada nenhuma. */
  private async chamadasPorUsuario(): Promise<Map<string, AdminCallLocation>> {
    const salas = await this.voice.salasAbertas();
    const out = new Map<string, AdminCallLocation>();
    if (salas.size === 0) return out;
    const locais = await this.locaisDe([...salas.keys()]);
    for (const [channelId, membros] of salas) {
      const local = locais.get(channelId);
      if (!local) continue;
      for (const m of membros) out.set(m.userId, local);
    }
    return out;
  }

  // ── servidores ─────────────────────────────────────────────

  async guilds(): Promise<AdminGuildView[]> {
    const rows = await this.prisma.guild.findMany({
      include: {
        owner: true,
        _count: { select: { members: true, channels: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // uma agregação para todos os servidores em vez de um count por servidor
    const porGuild = await this.prisma.message.groupBy({
      by: ["channelId"],
      _count: { _all: true },
    });
    const canais = await this.prisma.channel.findMany({
      where: { guildId: { not: null } },
      select: { id: true, guildId: true },
    });
    const guildDoCanal = new Map(canais.map((c) => [c.id, c.guildId!]));
    const mensagensPorGuild = new Map<string, number>();
    for (const linha of porGuild) {
      const guildId = guildDoCanal.get(linha.channelId);
      if (!guildId) continue;
      mensagensPorGuild.set(guildId, (mensagensPorGuild.get(guildId) ?? 0) + linha._count._all);
    }

    return rows.map((g) => ({
      id: g.id,
      name: g.name,
      iconUrl: g.iconUrl,
      description: g.description,
      owner: g.owner ? toPublicUser(g.owner) : null,
      membros: g._count.members,
      canais: g._count.channels,
      mensagens: mensagensPorGuild.get(g.id) ?? 0,
      createdAt: g.createdAt.toISOString(),
    }));
  }

  // ── canais e mensagens ─────────────────────────────────────

  /**
   * Todos os canais da instância — de servidor e conversas na mesma lista,
   * porque a pergunta do painel ("onde estão falando disto?") não distingue os
   * dois, e o `guildId` nulo do ADR-0001 já separa quem precisar separar.
   */
  async channels(
    query: string | undefined,
    escopo: "todos" | "servidores" | "conversas",
    cursor: string | undefined,
  ): Promise<AdminChannelsPage> {
    const q = query?.trim();
    const where = {
      ...(escopo === "servidores" ? { guildId: { not: null } } : {}),
      ...(escopo === "conversas" ? { guildId: null } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { guild: { name: { contains: q, mode: "insensitive" as const } } },
              // conversa não tem nome: procura pelo apelido de quem está nela
              { members: { some: { user: { username: { contains: q, mode: "insensitive" as const } } } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.channel.count({ where }),
      this.prisma.channel.findMany({
        where,
        select: CANAL_SELECT,
        // `lastMessageAt` não é coluna — é derivado de um `groupBy` em
        // `Message` (ver `ReadStateService`), então não dá para ordenar por ele
        // sem perder a paginação por cursor. A ordem é a de criação, e o
        // "quando falaram por último" entra como dado de cada linha.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: ADMIN_PAGE_SIZE + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
    ]);

    const pagina = rows.slice(0, ADMIN_PAGE_SIZE);
    const [participantes, ultimas] = await Promise.all([
      this.participantesDe(pagina),
      this.ultimaMensagemDe(pagina.map((c) => c.id)),
    ]);

    return {
      itens: pagina.map((c) =>
        this.toChannelView(c, participantes.get(c.id) ?? [], ultimas.get(c.id) ?? null),
      ),
      proximoCursor: rows.length > ADMIN_PAGE_SIZE ? pagina[pagina.length - 1].id : null,
      total,
    };
  }

  /**
   * O histórico de um canal qualquer, sem ser membro dele.
   *
   * Fica registrado no log do servidor: ler a conversa alheia é o poder mais
   * afiado do painel, e um poder sem rastro é o que transforma administrador em
   * bisbilhoteiro. Não vai para o `AuditLog` porque aquela tabela é por
   * servidor (`guildId` obrigatório) e esta leitura muitas vezes não tem
   * servidor nenhum.
   */
  async messages(
    actorId: string,
    channelId: string,
    cursor: string | undefined,
  ): Promise<AdminMessagesPage> {
    const canal = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: CANAL_SELECT,
    });
    if (!canal) throw new NotFoundException("Canal não encontrado");

    const [participantes, ultimas] = await Promise.all([
      this.participantesDe([canal]),
      this.ultimaMensagemDe([canal.id]),
    ]);
    const view = this.toChannelView(
      canal,
      participantes.get(canal.id) ?? [],
      ultimas.get(canal.id) ?? null,
    );
    const itens = await this.mensagens.historicoSemChecagemDeAcesso(
      channelId,
      cursor,
      ADMIN_PAGE_SIZE,
    );

    this.logger.log(
      `Painel: ${actorId} leu ${itens.length} mensagens de ${view.nome} (${channelId})`,
    );

    return {
      canal: view,
      // a mais antiga da página é o cursor da próxima (o histórico volta no tempo)
      proximoCursor: itens.length > 0 ? itens[0].id : null,
      itens,
    };
  }

  // ── auxiliares ─────────────────────────────────────────────

  private toChannelView(
    c: CanalRow,
    participantes: PublicUser[],
    ultimaMensagemEm: Date | null,
  ): AdminChannelView {
    return {
      id: c.id,
      type: c.type,
      nome: c.guildId ? (c.name ?? "sem nome") : nomeDaConversa(c.type, c.name, participantes),
      guildId: c.guildId,
      guildName: c.guild?.name ?? null,
      privado: c.private,
      mensagens: c._count.messages,
      ultimaMensagemEm: ultimaMensagemEm ? ultimaMensagemEm.toISOString() : null,
      participantes,
    };
  }

  /**
   * Participantes das conversas de um lote. Só conversa: em canal de servidor a
   * tabela `ChannelMember` é a allowlist do canal privado, não "quem está lá" —
   * mostrá-la como participante mentiria sobre quem enxerga o canal.
   */
  private async participantesDe(
    canais: { id: string; guildId: string | null }[],
  ): Promise<Map<string, PublicUser[]>> {
    const ids = canais.filter((c) => c.guildId === null).map((c) => c.id);
    const out = new Map<string, PublicUser[]>();
    if (ids.length === 0) return out;
    const membros = await this.prisma.channelMember.findMany({
      where: { channelId: { in: ids } },
      include: { user: true },
    });
    for (const m of membros) {
      const lista = out.get(m.channelId) ?? [];
      lista.push(toPublicUser(m.user));
      out.set(m.channelId, lista);
    }
    return out;
  }

  /**
   * Quando cada canal recebeu a última mensagem. Uma agregação para a página
   * inteira — a mesma conta que o `ReadStateService` faz para o não lido.
   */
  private async ultimaMensagemDe(channelIds: string[]): Promise<Map<string, Date>> {
    if (channelIds.length === 0) return new Map();
    const linhas = await this.prisma.message.groupBy({
      by: ["channelId"],
      where: { channelId: { in: channelIds } },
      _max: { createdAt: true },
    });
    const out = new Map<string, Date>();
    for (const l of linhas) if (l._max.createdAt) out.set(l.channelId, l._max.createdAt);
    return out;
  }

  /** channelId → onde ele fica, no formato que a UI mostra. */
  private async locaisDe(channelIds: string[]): Promise<Map<string, AdminCallLocation>> {
    const canais = await this.prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: {
        id: true,
        name: true,
        type: true,
        guildId: true,
        guild: { select: { id: true, name: true } },
        members: { include: { user: true } },
      },
    });

    const out = new Map<string, AdminCallLocation>();
    for (const c of canais) {
      if (c.guildId && c.guild) {
        out.set(c.id, {
          tipo: "guild",
          channelId: c.id,
          channelName: c.name ?? "sem nome",
          guildId: c.guild.id,
          guildName: c.guild.name,
        });
        continue;
      }
      const participantes = c.members.map((m) => toPublicUser(m.user));
      out.set(c.id, {
        tipo: c.type === "GROUP" ? "grupo" : "dm",
        channelId: c.id,
        nome: nomeDaConversa(c.type, c.name, participantes),
        participantes,
      });
    }
    return out;
  }

  private async usuariosPorId(ids: string[]): Promise<Map<string, PublicUser>> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unicos } } });
    return new Map(users.map((u) => [u.id, toPublicUser(u)]));
  }
}
