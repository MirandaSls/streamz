import { Injectable, NotFoundException } from "@nestjs/common";
import type { GuildApplication, Role } from "@prisma/client";
import { Permission, WS_EVENTS, type AppInstalacao } from "@streamz/shared";
import { toPublicUser, toRoleDTO, type PublicUserRow } from "../../common/dto";
import { isUniqueViolation } from "../../common/prisma-errors";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { RolesService } from "../roles/roles.service";
import { urlDoIconeDoApp } from "./diretorio.service";

/**
 * Instalar e remover um aplicativo num servidor.
 *
 * ── j-bots · F4, lote B ──
 *
 * É o que o §11 chama de "adicionar ao servidor": existe a linha de
 * `GuildApplication`, o bot está lá. A instalação é o **conjunto** de quatro
 * coisas, e é por isso que ela mora num service só em vez de virar três
 * chamadas da tela:
 *
 * 1. a linha de `GuildApplication` (a autorização em si);
 * 2. um `Role` com as permissões escolhidas, ligado à instalação por `roleId`;
 * 3. o `GuildMember` do usuário-bot, vestindo esse cargo;
 * 4. os eventos — `role.created` e `member.joined` para o navegador, e
 *    `GUILD_CREATE` para o bot conectado, que sai **de graça** pela ponte de
 *    eventos (ver `discord-compat/gateway/dispatch.ts` e o §3.4 do contrato).
 *
 * O ponto 4 é a razão de este arquivo **não importar nada de
 * `discord-compat/`**: a `PonteDeEventos` já ouve o `member.joined` que sai
 * daqui e, quando o membro que entrou é o usuário-bot de uma sessão viva,
 * traduz o evento em `GUILD_CREATE` em vez de `GUILD_MEMBER_ADD`. O
 * acoplamento entre os dois módulos fica em zero, e a regra vale também para o
 * bot que entra por outro caminho (um convite, a semente de teste).
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §11 e o `CONTRATO-F4.md` §3.3,
 * §3.4 e §4.
 */

/** Só o que o DTO precisa da `Application` — `snowflake` é `BigInt`. */
const SELECT_DO_APP = {
  id: true,
  snowflake: true,
  name: true,
  description: true,
  iconKey: true,
  permissoesPadrao: true,
  publico: true,
  ownerId: true,
  botUserId: true,
  botUser: true,
  _count: { select: { installs: true } },
} as const;

type LinhaDoApp = {
  id: string;
  snowflake: bigint;
  name: string;
  description: string | null;
  iconKey: string | null;
  permissoesPadrao: number;
  publico: boolean;
  ownerId: string;
  botUserId: string;
  botUser: PublicUserRow;
  _count: { installs: number };
};

@Injectable()
export class InstalacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly roles: RolesService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Os aplicativos instalados num servidor. Exige `MANAGE_GUILD`. */
  async listar(actorId: string, guildId: string): Promise<AppInstalacao[]> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_GUILD);

    const rows = await this.prisma.guildApplication.findMany({
      where: { guildId },
      include: { application: { select: SELECT_DO_APP } },
      orderBy: { createdAt: "asc" },
    });
    // `installedById` não tem FK para `User` (ver o schema): a leitura resolve
    // os ids à mão, numa consulta só, e tolera quem já apagou a conta.
    const quemInstalou = await this.usuariosPorId(rows.map((r) => r.installedById));
    return rows.map((r) => this.paraInstalacao(r, r.application, quemInstalou.get(r.installedById)));
  }

  /**
   * Instala o aplicativo no servidor: o bot **entra**.
   *
   * A ordem é a do §3.3 do contrato, e cada passo depende do anterior. As
   * escritas vão numa transação; os eventos e as salas do WebSocket ficam
   * **fora** dela, depois do commit — emitir de dentro de uma transação que
   * ainda pode desfazer avisaria o navegador de um membro que não existe.
   *
   * **Instalação repetida do mesmo app no mesmo servidor é uma edição das
   * permissões**, e não um 409: é o que o Discord faz quando se reautoriza um
   * bot já presente, e é o que a tela "Adicionar ao servidor" precisa para
   * poder *corrigir* uma permissão esquecida sem obrigar a remover e instalar
   * de novo (o que faria o bot sair e voltar da lista de membros, e o bot
   * conectado receber `GUILD_DELETE` + `GUILD_CREATE` por uma caixinha
   * marcada). O `@@unique(guildId, applicationId)` continua sendo o que impede
   * duas linhas; quem o consulta é o caminho de edição, aqui.
   */
  async instalar(
    actorId: string,
    guildId: string,
    applicationId: string,
    permissions: number,
  ): Promise<AppInstalacao> {
    // 1. quem instala precisa de MANAGE_GUILD. Primeira linha do service: é a
    //    prova 3 da fase, e um `assert` no meio do método é um `assert` que uma
    //    saída antecipada consegue pular.
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_GUILD);

    // 2. o aplicativo. 404 para o que não é público e não é meu — pelo mesmo
    //    motivo do `DiretorioService.porId`: um 403 confirmaria a existência.
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: SELECT_DO_APP,
    });
    if (!app || (!app.publico && app.ownerId !== actorId)) {
      throw new NotFoundException("Aplicativo não encontrado");
    }

    // 3. a trava da escalada de privilégio (§4). Sem ela, `MANAGE_GUILD` vira
    //    `ADMINISTRATOR` de graça: instala-se um bot que se controla com um
    //    cargo de administrador. Quem decide é o `RolesService`, que já faz
    //    exatamente esta checagem para o `POST /roles` — reescrevê-la aqui
    //    seria a segunda cópia de uma regra de autorização, que é como as
    //    duas divergem.
    const concedidas = await this.roles.validarPermissoes(actorId, guildId, permissions);

    const jaInstalado = await this.prisma.guildApplication.findUnique({
      where: { guildId_applicationId: { guildId, applicationId } },
    });

    if (jaInstalado) return this.reautorizar(guildId, jaInstalado, app, concedidas);

    // 4. o cargo, com a mesma regra de posição do `RolesService.create`: nasce
    //    logo abaixo do cargo mais alto de quem instala, e nunca acima dele.
    const teto = await this.guilds.rank(guildId, actorId);
    const maior = await this.prisma.role.aggregate({
      where: { guildId },
      _max: { position: true },
    });
    const position = Math.min((maior._max.position ?? 0) + 1, Math.max(teto, 1));

    // A leitura do `jaInstalado` e esta escrita não são atômicas entre si: duas
    // autorizações do mesmo app no mesmo servidor, ao mesmo tempo, veem as duas
    // "não instalado" e chegam as duas aqui. Quem impede a segunda linha é o
    // `@@unique(guildId, applicationId)`, e a transação garante que a perdedora
    // não deixe cargo nem membro para trás — mas o erro que sobe é um `P2002`
    // cru, ou seja, um 500 para quem clicou em "Autorizar" duas vezes rápido.
    //
    // A saída é a mesma que o `criarUsuarioBot` da F0 usa para o username, e
    // pelo mesmo motivo: **tentar e tratar a colisão** em vez de travar. Perdeu
    // a corrida quer dizer que o app *está* instalado — e instalar o que já
    // está instalado é reautorizar, que é justamente o caminho de cima.
    let criada: { instalacao: GuildApplication; cargo: Role };
    try {
      criada = await this.prisma.$transaction(async (tx) => {
        const cargo = await tx.role.create({
          data: { guildId, name: app.name, position, permissions: concedidas },
        });
        // 5. o membro-bot e o cargo nele. `role: "MEMBER"`: o papel legado não é
        //    o que dá poder ao bot — quem dá é o cargo que ele acabou de vestir.
        //
        // **`upsert`, e não `create`.** O usuário-bot pode já ser membro deste
        // servidor por outro caminho — entrou por um convite, ou foi semeado
        // (é o que o `semear.mjs` da F1 faz). Com `create`, o
        // `@@unique([userId, guildId])` estourava um `P2002` que o `catch`
        // abaixo classificava como corrida de instalação; como não há
        // `GuildApplication` para reler, o erro subia: **500 ao instalar um
        // app cujo bot já está na sala.**
        //
        // O `update: {}` é deliberado: se a linha já existe, a instalação
        // **não** mexe no `role` legado de quem já estava lá. Instalar um
        // aplicativo concede permissões pelo cargo gerenciado, e não promove
        // nem rebaixa o membro.
        await tx.guildMember.upsert({
          where: { userId_guildId: { userId: app.botUserId, guildId } },
          create: { userId: app.botUserId, guildId, role: "MEMBER" },
          update: {},
        });
        // este continua `create`: o cargo nasceu três linhas acima, nesta mesma
        // transação, então o `@@unique([userId, roleId])` não tem com o que
        // colidir
        await tx.guildMemberRole.create({
          data: { guildId, userId: app.botUserId, roleId: cargo.id },
        });
        // 6. a autorização em si.
        const instalacao = await tx.guildApplication.create({
          data: {
            guildId,
            applicationId,
            installedById: actorId,
            permissions: concedidas,
            roleId: cargo.id,
          },
        });
        return { instalacao, cargo };
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // a outra requisição chegou primeiro; a nossa transação já se desfez
      // inteira. Relê e reautoriza — o resultado é o mesmo que se as duas
      // tivessem chegado em ordem.
      const agora = await this.prisma.guildApplication.findUnique({
        where: { guildId_applicationId: { guildId, applicationId } },
      });
      if (!agora) throw e;
      return this.reautorizar(guildId, agora, app, concedidas);
    }
    const { instalacao, cargo } = criada;

    // 7. os eventos. O cargo primeiro: quem receber o `member.joined` já
    //    consegue resolver o `roleIds` dele para um cargo que a tela conhece.
    this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_CREATED, toRoleDTO(cargo));
    await this.anunciarEntrada(guildId, app, cargo.id);

    // 8. o bot entra nas salas, como um membro novo qualquer.
    this.realtime.joinGuildRoom(app.botUserId, guildId);
    await this.guilds.resyncChannelRooms(guildId, app.botUserId);

    const instalador = await this.usuarioPorId(actorId);
    return this.paraInstalacao(instalacao, app, instalador);
  }

  /**
   * Remove o aplicativo: o inverso, na ordem inversa.
   *
   * **A ordem dos eventos de exclusão importa.** A `PonteDeEventos` recupera o
   * snowflake de um cargo apagado da memória que montou no `GUILD_CREATE`, e
   * dispara o `GUILD_DELETE` ao ver o `member.left` do próprio bot. Depois
   * disso o bot já saiu e não escuta mais nada — então o `role.deleted` sai
   * **antes**, com a linha do cargo já apagada mas o evento montado a partir do
   * id que a ponte lembra. O que não pode é a ordem inversa: um `GUILD_DELETE`
   * antes do `role.deleted` faz o segundo cair no vazio.
   */
  async remover(actorId: string, guildId: string, applicationId: string): Promise<void> {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MANAGE_GUILD);

    const instalacao = await this.prisma.guildApplication.findUnique({
      where: { guildId_applicationId: { guildId, applicationId } },
      include: { application: { select: { botUserId: true } } },
    });
    if (!instalacao) throw new NotFoundException("Aplicativo não está instalado neste servidor");

    await this.desinstalar(instalacao.id, guildId, instalacao.application.botUserId, instalacao.roleId);
  }

  /**
   * O desfazer, sem checagem de permissão — a de quem chama já foi feita.
   *
   * Separado do `remover` porque o **lote A** precisa exatamente disto ao
   * apagar um aplicativo: para cada servidor onde ele está, desfazer a
   * instalação (tirar o membro-bot, apagar o cargo, emitir os eventos) antes de
   * apagar o usuário-bot. Sem isso sobraria um `User` órfão com `isBot: true`
   * na lista de membros de todo servidor onde entrou. É a dependência A → B
   * que o §3.1 do contrato declara.
   */
  async desinstalar(
    instalacaoId: string,
    guildId: string,
    botUserId: string,
    roleId: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.guildApplication.delete({ where: { id: instalacaoId } });
      await tx.guildMemberRole.deleteMany({ where: { guildId, userId: botUserId } });
      await tx.guildMember.deleteMany({ where: { guildId, userId: botUserId } });
      // as atribuições e os overrides do cargo somem em cascata (schema)
      if (roleId) await tx.role.deleteMany({ where: { id: roleId, guildId } });
    });

    // O cargo primeiro (ver o comentário do `remover`): depois do `member.left`
    // o bot já recebeu `GUILD_DELETE` e não escuta mais.
    if (roleId) this.realtime.emitToGuild(guildId, WS_EVENTS.ROLE_DELETED, { guildId, roleId });
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_LEFT, { guildId, userId: botUserId });

    const canais = await this.prisma.channel.findMany({ where: { guildId }, select: { id: true } });
    this.realtime.leaveChannelRooms(botUserId, canais.map((c) => c.id));
    this.realtime.leaveGuildRoom(botUserId, guildId);
  }

  /** Onde um aplicativo está instalado — a leitura que o lote A faz ao apagá-lo. */
  async instalacoesDoApp(applicationId: string) {
    return this.prisma.guildApplication.findMany({
      where: { applicationId },
      select: { id: true, guildId: true, roleId: true },
    });
  }

  // ── internas ───────────────────────────────────────────────

  /**
   * Reautorizar: o app já está no servidor e as permissões mudaram.
   *
   * Edita o cargo em vez de recriá-lo, e é isso que faz a operação ser barata
   * do lado do bot — nenhum `GUILD_DELETE`/`GUILD_CREATE`, só um
   * `GUILD_ROLE_UPDATE`. Um cargo perdido (apagado à mão pela tela de cargos)
   * é recriado: sem cargo, o bot ficaria no servidor sem nenhuma permissão e a
   * tela mostraria uma instalação que não vale nada.
   */
  private async reautorizar(
    guildId: string,
    jaInstalado: { id: string; roleId: string | null },
    app: LinhaDoApp,
    concedidas: number,
  ): Promise<AppInstalacao> {
    const cargoAtual = jaInstalado.roleId
      ? await this.prisma.role.findFirst({ where: { id: jaInstalado.roleId, guildId } })
      : null;

    const cargo = cargoAtual
      ? await this.prisma.role.update({
          where: { id: cargoAtual.id },
          data: { name: app.name, permissions: concedidas },
        })
      : await this.prisma.role.create({
          data: { guildId, name: app.name, permissions: concedidas, position: 1 },
        });

    const atualizada = await this.prisma.guildApplication.update({
      where: { id: jaInstalado.id },
      data: { permissions: concedidas, roleId: cargo.id },
    });

    // o membro e a atribuição do cargo podem ter sumido por fora (expulsão,
    // cargo apagado à mão): reautorizar é também o conserto
    await this.prisma.guildMember.upsert({
      where: { userId_guildId: { userId: app.botUserId, guildId } },
      create: { userId: app.botUserId, guildId, role: "MEMBER" },
      update: {},
    });
    await this.prisma.guildMemberRole.upsert({
      where: { userId_roleId: { userId: app.botUserId, roleId: cargo.id } },
      create: { guildId, userId: app.botUserId, roleId: cargo.id },
      update: {},
    });

    this.realtime.emitToGuild(
      guildId,
      cargoAtual ? WS_EVENTS.ROLE_UPDATED : WS_EVENTS.ROLE_CREATED,
      toRoleDTO(cargo),
    );
    await this.anunciarEntrada(guildId, app, cargo.id);
    this.realtime.joinGuildRoom(app.botUserId, guildId);
    await this.guilds.resyncChannelRooms(guildId, app.botUserId);

    const instalador = await this.usuarioPorId(atualizada.installedById);
    return this.paraInstalacao(atualizada, app, instalador);
  }

  /**
   * `member.joined` no formato **exato** de `invites.service.ts`.
   *
   * `joinedAt` é relido do banco, e não `new Date()`: a lista de membros ordena
   * por ele, e um relógio do processo diferente do da transação colocaria o
   * recém-chegado na posição errada. É também o que a `PonteDeEventos` lê para
   * decidir se manda `GUILD_MEMBER_ADD` ou — quando o membro é o usuário-bot de
   * uma sessão viva — o `GUILD_CREATE` inteiro.
   */
  private async anunciarEntrada(guildId: string, app: LinhaDoApp, roleId: string): Promise<void> {
    const membro = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: app.botUserId, guildId } },
      select: { joinedAt: true },
    });
    if (!membro) return;
    this.realtime.emitToGuild(guildId, WS_EVENTS.MEMBER_JOINED, {
      guildId,
      member: {
        role: "MEMBER",
        user: toPublicUser(app.botUser),
        // o bot nasce com o cargo do app — é o que o diferencia de quem entra
        // por convite, que só tem o @everyone
        roleIds: [roleId],
        joinedAt: membro.joinedAt.toISOString(),
      },
    });
  }

  private paraInstalacao(
    linha: {
      id: string;
      guildId: string;
      applicationId: string;
      permissions: number;
      roleId: string | null;
      installedById: string;
      createdAt: Date;
    },
    app: LinhaDoApp,
    instalador: PublicUserRow | undefined,
  ): AppInstalacao {
    return {
      id: linha.id,
      guildId: linha.guildId,
      applicationId: linha.applicationId,
      app: {
        id: app.id,
        snowflake: app.snowflake.toString(),
        name: app.name,
        description: app.description,
        iconUrl: urlDoIconeDoApp(app.id, app.iconKey),
        permissoesPadrao: app.permissoesPadrao,
        servidores: app._count.installs,
        botUser: toPublicUser(app.botUser),
      },
      permissions: linha.permissions,
      roleId: linha.roleId,
      // Quem instalou pode ter apagado a conta desde então (não há FK, de
      // propósito). A linha continua válida — o app está instalado —, e o campo
      // cai no próprio usuário-bot, que é o único nome que a tela tem certeza
      // de conseguir mostrar.
      instaladoPor: toPublicUser(instalador ?? app.botUser),
      createdAt: linha.createdAt.toISOString(),
    };
  }

  private async usuarioPorId(id: string): Promise<PublicUserRow | undefined> {
    return (await this.prisma.user.findUnique({ where: { id } })) ?? undefined;
  }

  private async usuariosPorId(ids: string[]): Promise<Map<string, PublicUserRow>> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({ where: { id: { in: unicos } } });
    return new Map(rows.map((u) => [u.id, u]));
  }
}
