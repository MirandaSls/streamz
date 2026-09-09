import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ALL_PERMISSIONS,
  MAX_ROLE_NAME,
  Permission,
  WS_EVENTS,
  hasPermission,
  isRoleColor,
} from "@streamz/shared";
import type {
  ChannelOverride,
  MemberPermissions,
  Role,
  RoleInput,
} from "@streamz/shared";
import { toOverrideDTO, toRoleDTO } from "../../common/dto";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";

/**
 * Cargos, atribuição de cargo a membro e regras (overrides) por canal.
 *
 * A autorização mora em `GuildsService` (ponto único do projeto); aqui só se
 * escreve o dado. Todo caminho de escrita passa por
 * `guilds.assertPodeMexerNoCargo`: `MANAGE_ROLES` sem teto seria equivalente a
 * `ADMINISTRATOR`, porque bastaria criar um cargo com tudo ligado e vesti-lo
 * (ADR-0002). A hierarquia morou aqui até a regra ganhar um segundo cliente
 * (as regras de categoria) — checagem de autorização duplicada diverge.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(userId: string, guildId: string): Promise<Role[]> {
    await this.guilds.assertMember(userId, guildId);
    return this.guilds.listRoles(guildId);
  }

  async create(actorId: string, guildId: string, input: RoleInput): Promise<Role> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const name = this.validarNome(input.name ?? "Novo cargo");
    const permissions = await this.validarPermissoes(actorId, guildId, input.permissions ?? 0);

    // nasce logo abaixo do cargo mais alto do criador — nunca acima dele
    const teto = await this.guilds.rank(guildId, actorId);
    const maior = await this.prisma.role.aggregate({
      where: { guildId },
      _max: { position: true },
    });
    const position = Math.min((maior._max.position ?? 0) + 1, Math.max(teto, 1));

    const role = await this.prisma.role.create({
      data: {
        guildId,
        name,
        color: this.validarCor(input.color),
        position,
        permissions,
        hoist: input.hoist ?? false,
        mentionable: input.mentionable ?? false,
      },
    });
    const dto = toRoleDTO(role);
    this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_CREATED, dto);
    return dto;
  }

  async update(
    actorId: string,
    guildId: string,
    roleId: string,
    input: RoleInput,
  ): Promise<Role> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const alvo = await this.guilds.assertPodeMexerNoCargo(actorId, guildId, roleId);

    // o @everyone só existe como padrão do servidor: nome, cor e hierarquia
    // dele não são editáveis — só o conjunto de permissões
    const data: Record<string, unknown> = {};
    if (input.permissions !== undefined) {
      data.permissions = await this.validarPermissoes(actorId, guildId, input.permissions);
    }
    if (!alvo.isDefault) {
      if (input.name !== undefined) data.name = this.validarNome(input.name);
      if (input.color !== undefined) data.color = this.validarCor(input.color);
      if (input.hoist !== undefined) data.hoist = input.hoist;
      if (input.mentionable !== undefined) data.mentionable = input.mentionable;
    }

    const role = await this.prisma.role.update({ where: { id: roleId }, data });
    const dto = toRoleDTO(role);
    this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_UPDATED, dto);
    await this.resyncMembrosDoCargo(guildId, roleId);
    return dto;
  }

  async remove(actorId: string, guildId: string, roleId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const alvo = await this.guilds.assertPodeMexerNoCargo(actorId, guildId, roleId);
    if (alvo.isDefault) throw new BadRequestException("O @everyone não pode ser apagado");

    const membros = await this.prisma.guildMemberRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    // as atribuições e os overrides deste cargo somem em cascata (schema)
    await this.prisma.role.delete({ where: { id: roleId } });
    this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_DELETED, { guildId, roleId });
    for (const m of membros) await this.guilds.resyncChannelRooms(guildId, m.userId);
    return { deleted: roleId };
  }

  /**
   * Reordena a hierarquia. Recebe os ids do mais baixo para o mais alto; o
   * @everyone fica sempre em 0, e nenhum cargo pode passar do teto do ator.
   */
  async reorder(actorId: string, guildId: string, orderedIds: string[]): Promise<Role[]> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const teto = await this.guilds.rank(guildId, actorId);
    const roles = await this.prisma.role.findMany({ where: { guildId } });
    const editaveis = roles.filter((r) => !r.isDefault);
    const ids = orderedIds.filter((id) => editaveis.some((r) => r.id === id));
    if (ids.length !== editaveis.length) {
      throw new BadRequestException("A ordem precisa conter todos os cargos do servidor");
    }
    // mexer num cargo acima do seu (na ordem velha ou na nova) é escalada
    for (const [i, id] of ids.entries()) {
      const atual = editaveis.find((r) => r.id === id)!;
      const nova = i + 1;
      if (atual.position !== nova && (atual.position >= teto || nova >= teto)) {
        throw new ForbiddenException("Você não pode reordenar cargos acima do seu");
      }
    }
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.role.update({ where: { id }, data: { position: i + 1 } }),
      ),
    );
    const atualizados = await this.guilds.listRoles(guildId);
    for (const r of atualizados) {
      this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_UPDATED, r);
    }
    return atualizados;
  }

  // ── atribuição de cargo a membro ───────────────────────────

  async assign(actorId: string, guildId: string, userId: string, roleId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    const alvo = await this.guilds.assertPodeMexerNoCargo(actorId, guildId, roleId);
    if (alvo.isDefault) {
      throw new BadRequestException("O @everyone vale para todo membro — não se atribui");
    }
    await this.guilds.assertMember(userId, guildId);
    await this.prisma.guildMemberRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { guildId, userId, roleId },
      update: {},
    });
    return this.aposMudarCargosDoMembro(guildId, userId);
  }

  async unassign(actorId: string, guildId: string, userId: string, roleId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    await this.guilds.assertPodeMexerNoCargo(actorId, guildId, roleId);
    await this.prisma.guildMemberRole.deleteMany({ where: { guildId, userId, roleId } });
    return this.aposMudarCargosDoMembro(guildId, userId);
  }

  /** Permissão efetiva de um membro no servidor (para a UI e para depuração). */
  async memberPermissions(
    actorId: string,
    guildId: string,
    userId: string,
  ): Promise<MemberPermissions> {
    await this.guilds.assertMember(actorId, guildId);
    await this.guilds.assertMember(userId, guildId);
    const [permissions, roleIds] = await Promise.all([
      this.guilds.permissionsOf(userId, guildId),
      this.guilds.roleIdsOf(guildId, userId),
    ]);
    return { userId, guildId, permissions, roleIds };
  }

  // ── overrides por canal ────────────────────────────────────

  /** Regras de um canal. Exige poder ver o canal e gerenciar cargos. */
  async listOverrides(
    actorId: string,
    guildId: string,
    channelId: string,
  ): Promise<ChannelOverride[]> {
    await this.assertCanalDoServidor(guildId, channelId);
    await this.guilds.assertCanViewChannel(actorId, channelId);
    // canal sincronizado devolve as regras da CATEGORIA, que são as que valem —
    // a cópia nas linhas do canal existe, mas quem manda é `regrasDoCanal`
    const regras = await this.guilds.regrasDoCanal(channelId);
    return regras.map((o) => toOverrideDTO({ ...o, channelId }));
  }

  /** Todas as regras dos canais **visíveis** do servidor — a carga do cliente. */
  async listGuildOverrides(actorId: string, guildId: string): Promise<ChannelOverride[]> {
    await this.guilds.assertMember(actorId, guildId);
    const visiveis = await this.guilds.visibleChannelsForUser(actorId);
    const ids = visiveis.filter((c) => c.guildId === guildId).map((c) => c.id);
    if (ids.length === 0) return [];
    const rows = await this.prisma.channelOverride.findMany({
      where: { channelId: { in: ids } },
    });
    return rows.map(toOverrideDTO);
  }

  /**
   * Grava a regra de um cargo ou de um usuário num canal. `allow`/`deny` com o
   * mesmo bit é resolvido pelo cálculo (allow vence) — não recusamos aqui.
   */
  async setOverride(
    actorId: string,
    guildId: string,
    channelId: string,
    input: { roleId?: string | null; userId?: string | null; allow: number; deny: number },
  ): Promise<ChannelOverride[]> {
    await this.assertPodeMexerNasRegrasDoCanal(actorId, guildId, channelId);
    const roleId = input.roleId ?? null;
    const userId = input.userId ?? null;
    if ((roleId === null) === (userId === null)) {
      throw new BadRequestException("A regra vale para um cargo ou para um usuário, não os dois");
    }
    // não se concede o que não se tem: senão MANAGE_ROLES viraria ADMINISTRATOR
    const minhas = await this.guilds.permissionsOf(actorId, guildId);
    const mexidas = (input.allow | input.deny) & ALL_PERMISSIONS;
    if (!hasPermission(minhas, mexidas)) {
      throw new ForbiddenException("Você não pode mexer numa permissão que não tem");
    }
    if (roleId) await this.guilds.assertPodeMexerNoCargo(actorId, guildId, roleId);
    else await this.guilds.assertMember(userId!, guildId);

    // editar a permissão DENTRO do canal o tira da sincronia com a categoria
    // (copiando antes o que ele herdava) — é o comportamento do Discord
    await this.guilds.dessincronizarDaCategoria(channelId);

    const allow = input.allow & ALL_PERMISSIONS;
    const deny = input.deny & ALL_PERMISSIONS & ~allow;
    if (roleId) {
      await this.prisma.channelOverride.upsert({
        where: { channelId_roleId: { channelId, roleId } },
        create: { channelId, roleId, allow, deny },
        update: { allow, deny },
      });
    } else {
      await this.prisma.channelOverride.upsert({
        where: { channelId_userId: { channelId, userId: userId! } },
        create: { channelId, userId: userId!, allow, deny },
        update: { allow, deny },
      });
    }
    return this.aposMudarOverrides(guildId, channelId);
  }

  /**
   * Apaga a regra de um cargo ou de um usuário no canal.
   *
   * Passa pelas **mesmas** checagens do `setOverride`, porque apagar regra é
   * escrever permissão. Sem elas, dois caminhos de escalada estavam abertos:
   *
   * - apagar a regra do @everyone de um canal privado. `syncChannelFlags`
   *   deriva `Channel.private` de `deny & VIEW_CHANNEL`, então some o deny,
   *   some o cadeado: **o canal abre para o servidor inteiro numa chamada só**;
   * - apagar a regra de um cargo **acima** do ator, desfazendo a restrição que
   *   quem está acima dele tinha posto — exatamente o que
   *   `assertPodeMexerNoCargo` existe para impedir no `PUT`.
   */
  async removeOverride(
    actorId: string,
    guildId: string,
    channelId: string,
    targetId: string,
  ): Promise<ChannelOverride[]> {
    await this.assertPodeMexerNasRegrasDoCanal(actorId, guildId, channelId);
    // `targetId` é id de cargo **ou** de usuário; só o de cargo tem hierarquia
    // a respeitar — e o @everyone (posição 0) entra na regra, que é o caso que
    // abria o canal. Alvo que não é cargo deste servidor é regra de usuário.
    const cargo = await this.prisma.role.findUnique({
      where: { id: targetId },
      select: { guildId: true },
    });
    if (cargo?.guildId === guildId) {
      await this.guilds.assertPodeMexerNoCargo(actorId, guildId, targetId);
    }
    await this.guilds.dessincronizarDaCategoria(channelId);
    await this.prisma.channelOverride.deleteMany({
      where: { channelId, OR: [{ roleId: targetId }, { userId: targetId }] },
    });
    return this.aposMudarOverrides(guildId, channelId);
  }

  // ── internas ───────────────────────────────────────────────

  /**
   * Depois de qualquer escrita de override: espelha `private`/`readOnly`,
   * recoloca cada membro nas salas certas e avisa quem enxerga o canal.
   */
  private async aposMudarOverrides(
    guildId: string,
    channelId: string,
  ): Promise<ChannelOverride[]> {
    await this.guilds.syncChannelFlags(channelId);
    const rows = await this.prisma.channelOverride.findMany({ where: { channelId } });
    const overrides = rows.map(toOverrideDTO);
    const membros = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    for (const m of membros) await this.guilds.resyncChannelRooms(guildId, m.userId);
    this.realtime.emitToGuild(guildId, WS_EVENTS.CHANNEL_OVERRIDES, {
      guildId,
      channelId,
      overrides,
    });
    return overrides;
  }

  /** Depois de atribuir/remover cargo: avisa o servidor e reavalia as salas. */
  private async aposMudarCargosDoMembro(guildId: string, userId: string) {
    const roleIds = await this.guilds.roleIdsOf(guildId, userId);
    const member = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { role: true },
    });
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_UPDATED, {
      guildId,
      userId,
      role: member?.role ?? "MEMBER",
      roleIds,
    });
    await this.guilds.resyncChannelRooms(guildId, userId);
    return { userId, roleIds };
  }

  /** Cargo mudou de permissão: quem o tem pode ter ganhado/perdido canais. */
  private async resyncMembrosDoCargo(guildId: string, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return;
    // mexer no @everyone afeta todo mundo; num cargo comum, só quem o tem
    const membros = role.isDefault
      ? await this.prisma.guildMember.findMany({ where: { guildId }, select: { userId: true } })
      : await this.prisma.guildMemberRole.findMany({
          where: { guildId, roleId },
          select: { userId: true },
        });
    for (const m of membros) await this.guilds.resyncChannelRooms(guildId, m.userId);
  }

  /**
   * O portão das duas escritas de regra de canal (gravar e apagar):
   * `MANAGE_ROLES` no servidor, canal deste servidor **e enxergar o canal**.
   *
   * A terceira é a que faltava. A leitura (`listOverrides`) sempre exigiu
   * `assertCanViewChannel`; a escrita, não — e a assimetria era a porta:
   * barrado de um canal privado por um deny de `VIEW_CHANNEL`, quem tinha
   * `MANAGE_ROLES` no servidor gravava a própria regra
   * (`{ userId: <ele mesmo>, allow: VIEW_CHANNEL }`) e entrava. A máscara de
   * "não se concede o que não se tem" não segurava, porque `VIEW_CHANNEL` está
   * em `DEFAULT_PERMISSIONS` — todo mundo a tem no servidor —, e
   * `aposMudarOverrides` ainda o colocava nas salas do WebSocket.
   *
   * **Não cria impasse.** `computePermissions` (ADR-0002) devolve
   * `ALL_PERMISSIONS` ao dono (etapa 1) e a quem tem `ADMINISTRATOR` (etapa 3,
   * **antes** dos overrides), então `assertCanViewChannel` nunca recusa esses
   * dois: um canal cujo @everyone nega tudo continua consertável por eles. Quem
   * fica de fora é só o moderador que o canal já escondia — que é o ponto, e é
   * o comportamento do Discord.
   */
  private async assertPodeMexerNasRegrasDoCanal(
    actorId: string,
    guildId: string,
    channelId: string,
  ) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_ROLES);
    await this.assertCanalDoServidor(guildId, channelId);
    await this.guilds.assertCanViewChannel(actorId, channelId);
  }

  /** Não se edita a regra de um canal de outro servidor (nem de uma conversa). */
  private async assertCanalDoServidor(guildId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { guildId: true },
    });
    if (!channel) throw new NotFoundException("Canal não encontrado");
    if (channel.guildId !== guildId) {
      throw new ForbiddenException("Canal não pertence a este servidor");
    }
  }

  private validarNome(name: string): string {
    const nome = name.trim();
    if (!nome) throw new BadRequestException("Nome do cargo vazio");
    if (nome.length > MAX_ROLE_NAME) {
      throw new BadRequestException(`Nome acima de ${MAX_ROLE_NAME} caracteres`);
    }
    return nome;
  }

  private validarCor(color: string | null | undefined): string | null {
    if (color === undefined || color === null || color === "") return null;
    if (!isRoleColor(color)) throw new BadRequestException("Cor inválida (use #rrggbb)");
    return color.toLowerCase();
  }

  /**
   * Não se concede o que não se tem. Sem isto, quem tem só `MANAGE_ROLES`
   * criaria um cargo com `ADMINISTRATOR` e o vestiria no passo seguinte.
   *
   * **Pública desde a F4** (era `private`), por um motivo idêntico ao de cima:
   * instalar um aplicativo cria um cargo, e sem esta trava `MANAGE_GUILD`
   * viraria `ADMINISTRATOR` de graça — bastaria instalar um bot que se controla
   * com um cargo de administrador. O `InstalacaoService` chama **esta** função
   * em vez de repetir a regra; uma segunda cópia de uma regra de autorização é
   * exatamente como as duas divergem (ADR-0002: ponto único de autorização).
   *
   * `permissionsOf` já devolve `ALL_PERMISSIONS` para o dono e para quem tem
   * `ADMINISTRATOR` (ver `computePermissions`), então esses dois concedem tudo
   * sem nenhum caso especial aqui. Devolve o bitfield já mascarado por
   * `ALL_PERMISSIONS`: quem chama grava o **retorno**, não a entrada.
   */
  async validarPermissoes(
    actorId: string,
    guildId: string,
    permissions: number,
  ): Promise<number> {
    const pedidas = permissions & ALL_PERMISSIONS;
    const minhas = await this.guilds.permissionsOf(actorId, guildId);
    if (!hasPermission(minhas, pedidas)) {
      throw new ForbiddenException("Você não pode conceder uma permissão que não tem");
    }
    return pedidas;
  }
}
