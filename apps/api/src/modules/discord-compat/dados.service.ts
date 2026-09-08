import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  LinhaDeAnexo,
  LinhaDeCanal,
  LinhaDeCargo,
  LinhaDeCategoria,
  LinhaDeMembro,
  LinhaDeMensagem,
  LinhaDeReacao,
  LinhaDeServidor,
  LinhaDeUsuario,
} from "./tipos";

/**
 * Leitura do banco **com o snowflake junto** — a fonte de tudo que a casca
 * traduz.
 *
 * Por que não usar `GuildsService`/`MessagesService` para ler: eles devolvem os
 * DTOs de `@streamz/shared`, que carregam `id` cuid e **não** têm snowflake.
 * Reconstruir o número depois custaria uma consulta por id (uma mensagem tem
 * seis). Aqui o `select` já traz a coluna, e a tradução vira aritmética.
 *
 * Isto é **só leitura**. Escrita, permissão e regra de negócio continuam nos
 * services de sempre: `MessagesService.create`, `GuildsService.
 * assertCanViewChannel`, `assertCanPostChannel`. A casca não reimplementa nada
 * (§3, "a compatibilidade é uma casca").
 *
 * ── Lote A (REST compat) implementa este arquivo. ──
 * Os lotes B (`identify.ts`) e D (`dispatch.ts`) apenas o consomem; as
 * assinaturas abaixo são contrato e não mudam.
 */

/** O que uma linha de `User` precisa trazer para virar `LinhaDeUsuario`. */
const SELECAO_DE_USUARIO = {
  id: true,
  snowflake: true,
  username: true,
  displayName: true,
  isBot: true,
} as const;

/** O canal, sem os destinatários (que só existem em DM/grupo). */
const SELECAO_DE_CANAL = {
  id: true,
  snowflake: true,
  guildId: true,
  name: true,
  type: true,
  position: true,
  topic: true,
  nsfw: true,
  slowmodeSeconds: true,
  category: { select: { snowflake: true } },
} as const;

const SELECAO_DE_CATEGORIA = {
  id: true,
  snowflake: true,
  guildId: true,
  name: true,
  position: true,
} as const;

const SELECAO_DE_CARGO = {
  id: true,
  snowflake: true,
  guildId: true,
  name: true,
  color: true,
  position: true,
  permissions: true,
  hoist: true,
  mentionable: true,
  isDefault: true,
} as const;

/**
 * A mensagem inteira, do jeito que a tradução precisa.
 *
 * `channel` e `replyTo` trazem os snowflakes junto porque `channel_id`,
 * `guild_id` e `message_reference` são obrigatórios na saída — buscá-los depois
 * seria uma consulta por mensagem, e o histórico traz cinquenta de uma vez.
 */
const SELECAO_DE_MENSAGEM = {
  id: true,
  snowflake: true,
  content: true,
  createdAt: true,
  editedAt: true,
  type: true,
  author: { select: SELECAO_DE_USUARIO },
  channel: { select: { snowflake: true, guildId: true, guild: { select: { snowflake: true } } } },
  attachments: {
    select: {
      id: true,
      snowflake: true,
      key: true,
      filename: true,
      contentType: true,
      size: true,
      width: true,
      height: true,
      externalUrl: true,
    },
  },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: { select: { snowflake: true, channel: { select: { snowflake: true } } } },
  pin: { select: { messageId: true } },
} as const;

/** `limit` do histórico: o mesmo intervalo do Discord. */
const LIMITE_MINIMO = 1;
const LIMITE_MAXIMO = 100;

@Injectable()
export class DadosDeCompatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Os servidores em que o usuário-bot é membro.
   *
   * É a lista do `READY.guilds` (com `unavailable: true`) e a raiz do
   * `GUILD_CREATE`. Em F1 não há instalação por UI (isso é a F4): "o bot está
   * no servidor" quer dizer, literalmente, que existe uma linha de
   * `GuildMember` para o `botUserId`.
   */
  async servidoresDoBot(botUserId: string): Promise<{ id: string; snowflake: bigint }[]> {
    const linhas = await this.prisma.guildMember.findMany({
      where: { userId: botUserId },
      select: { guild: { select: { id: true, snowflake: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return linhas.map((l) => l.guild);
  }

  /**
   * Tudo de um servidor, para o `GUILD_CREATE` e o `GET /guilds/:id`.
   *
   * Gordo de propósito: é daqui que o cache do bot nasce, e campo faltando
   * trava o `ready` sem erro nenhum (§7 e risco (a) do §12).
   */
  async servidorCompleto(guildId: string): Promise<LinhaDeServidor | null> {
    const servidor = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        id: true,
        snowflake: true,
        name: true,
        createdAt: true,
        systemChannelId: true,
        rulesChannelId: true,
        owner: { select: { snowflake: true } },
        _count: { select: { members: true } },
      },
    });
    if (!servidor) return null;

    const [cargos, estrutura, membros] = await Promise.all([
      this.cargosDoServidor(guildId),
      this.estruturaDoServidor(guildId),
      this.membrosDoServidor(guildId),
    ]);

    // `systemChannelId`/`rulesChannelId` são colunas soltas (sem relação no
    // esquema): o snowflake sai da lista de canais que já está em mãos, em vez
    // de duas consultas a mais.
    const porCuid = new Map(estrutura.canais.map((c) => [c.id, c.snowflake]));

    return {
      id: servidor.id,
      snowflake: servidor.snowflake,
      name: servidor.name,
      ownerSnowflake: servidor.owner.snowflake,
      createdAt: servidor.createdAt,
      systemChannelSnowflake: porCuid.get(servidor.systemChannelId ?? "") ?? null,
      rulesChannelSnowflake: porCuid.get(servidor.rulesChannelId ?? "") ?? null,
      cargos,
      canais: estrutura.canais,
      categorias: estrutura.categorias,
      membros,
      memberCount: servidor._count.members,
    };
  }

  async usuarioPorCuid(id: string): Promise<LinhaDeUsuario | null> {
    return this.prisma.user.findUnique({ where: { id }, select: SELECAO_DE_USUARIO });
  }

  async canalPorCuid(id: string): Promise<LinhaDeCanal | null> {
    const canal = await this.prisma.channel.findUnique({
      where: { id },
      select: {
        ...SELECAO_DE_CANAL,
        guild: { select: { snowflake: true } },
        // participantes só interessam em DM/grupo (viram `recipients`); num canal
        // de servidor a lista seria o servidor inteiro e não é o que o Discord
        // põe ali
        members: { select: { user: { select: SELECAO_DE_USUARIO } } },
      },
    });
    if (!canal) return null;

    return this.paraLinhaDeCanal(
      canal,
      canal.guild?.snowflake ?? null,
      canal.guildId === null ? canal.members.map((m) => m.user) : [],
    );
  }

  async categoriaPorCuid(id: string): Promise<LinhaDeCategoria | null> {
    const categoria = await this.prisma.category.findUnique({
      where: { id },
      select: { ...SELECAO_DE_CATEGORIA, guild: { select: { snowflake: true } } },
    });
    if (!categoria) return null;
    return { ...categoria, guildSnowflake: categoria.guild.snowflake };
  }

  /** Canais e categorias de um servidor (as categorias saem como tipo 4). */
  async estruturaDoServidor(
    guildId: string,
  ): Promise<{ canais: LinhaDeCanal[]; categorias: LinhaDeCategoria[] }> {
    // o snowflake do servidor é buscado uma vez e reusado em todas as linhas —
    // o `include` do Prisma o repetiria em cada canal
    const [servidor, canais, categorias] = await Promise.all([
      this.prisma.guild.findUnique({ where: { id: guildId }, select: { snowflake: true } }),
      this.prisma.channel.findMany({
        where: { guildId },
        select: SELECAO_DE_CANAL,
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.category.findMany({
        where: { guildId },
        select: SELECAO_DE_CATEGORIA,
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    if (!servidor) return { canais: [], categorias: [] };

    return {
      canais: canais.map((c) => this.paraLinhaDeCanal(c, servidor.snowflake, [])),
      categorias: categorias.map((c) => ({ ...c, guildSnowflake: servidor.snowflake })),
    };
  }

  async cargosDoServidor(guildId: string): Promise<LinhaDeCargo[]> {
    const [servidor, cargos] = await Promise.all([
      this.prisma.guild.findUnique({ where: { id: guildId }, select: { snowflake: true } }),
      this.prisma.role.findMany({
        where: { guildId },
        select: SELECAO_DE_CARGO,
        orderBy: { position: "asc" },
      }),
    ]);
    if (!servidor) return [];
    return cargos.map((c) => ({ ...c, guildSnowflake: servidor.snowflake }));
  }

  async membroDoServidor(guildId: string, userId: string): Promise<LinhaDeMembro | null> {
    const membro = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: {
        joinedAt: true,
        timeoutUntil: true,
        user: { select: SELECAO_DE_USUARIO },
      },
    });
    if (!membro) return null;

    const atribuicoes = await this.prisma.guildMemberRole.findMany({
      where: { guildId, userId },
      select: { role: { select: { snowflake: true, isDefault: true } } },
    });

    return {
      user: membro.user,
      cargoSnowflakes: semOEveryone(atribuicoes),
      joinedAt: membro.joinedAt,
      timeoutUntil: membro.timeoutUntil,
    };
  }

  /** Todos os membros. Nosso servidor é pequeno; o `GUILD_CREATE` manda todos. */
  async membrosDoServidor(guildId: string): Promise<LinhaDeMembro[]> {
    // duas consultas, não uma por membro: o `GUILD_CREATE` cabe num orçamento de
    // 15 s (`readyTimeout`) e um N+1 aqui o estoura sozinho
    const [membros, atribuicoes] = await Promise.all([
      this.prisma.guildMember.findMany({
        where: { guildId },
        select: { userId: true, joinedAt: true, timeoutUntil: true, user: { select: SELECAO_DE_USUARIO } },
        orderBy: { joinedAt: "asc" },
      }),
      this.prisma.guildMemberRole.findMany({
        where: { guildId },
        select: { userId: true, role: { select: { snowflake: true, isDefault: true } } },
      }),
    ]);

    const porUsuario = new Map<string, { role: { snowflake: bigint; isDefault: boolean } }[]>();
    for (const a of atribuicoes) {
      const lista = porUsuario.get(a.userId);
      if (lista) lista.push(a);
      else porUsuario.set(a.userId, [a]);
    }

    return membros.map((m) => ({
      user: m.user,
      cargoSnowflakes: semOEveryone(porUsuario.get(m.userId) ?? []),
      joinedAt: m.joinedAt,
      timeoutUntil: m.timeoutUntil,
    }));
  }

  /** `paraBot` decide o `me` das reações; `null` = ninguém. */
  async mensagemPorCuid(id: string, paraBotUserId: string | null): Promise<LinhaDeMensagem | null> {
    const mensagem = await this.prisma.message.findUnique({
      where: { id },
      select: SELECAO_DE_MENSAGEM,
    });
    return mensagem ? this.paraLinhaDeMensagem(mensagem, paraBotUserId) : null;
  }

  /**
   * Histórico com o cursor do Discord.
   *
   * `before`/`after`/`around` são **snowflakes**, e a ordenação é por snowflake
   * (não por `createdAt`): é o que dá cursor estável quando duas mensagens caem
   * no mesmo milissegundo. `limit` é 1..100, padrão 50.
   */
  async mensagensDoCanal(
    channelId: string,
    opcoes: {
      limit: number;
      before?: bigint;
      after?: bigint;
      around?: bigint;
      paraBotUserId: string | null;
    },
  ): Promise<LinhaDeMensagem[]> {
    const limite = Math.min(LIMITE_MAXIMO, Math.max(LIMITE_MINIMO, Math.trunc(opcoes.limit)));
    // resposta de thread não vive na timeline do canal — é o mesmo filtro do
    // `MessagesService.history`, e sem ele o bot veria mensagens que o navegador
    // não mostra
    const doCanal = { channelId, parentId: null };

    let linhas: LinhaCrua[];
    if (opcoes.around !== undefined) {
      // a janela do Discord: a mensagem, metade antes e metade depois
      const metade = Math.floor(limite / 2);
      const [antes, aPartirDela] = await Promise.all([
        this.prisma.message.findMany({
          where: { ...doCanal, snowflake: { lt: opcoes.around } },
          select: SELECAO_DE_MENSAGEM,
          orderBy: { snowflake: "desc" },
          take: metade,
        }),
        this.prisma.message.findMany({
          where: { ...doCanal, snowflake: { gte: opcoes.around } },
          select: SELECAO_DE_MENSAGEM,
          orderBy: { snowflake: "asc" },
          take: limite - metade,
        }),
      ]);
      linhas = [...aPartirDela.reverse(), ...antes];
    } else if (opcoes.after !== undefined) {
      // `after` pega as **mais antigas** depois do cursor e devolve na mesma
      // ordem decrescente do resto (é o que o Discord faz)
      const crescente = await this.prisma.message.findMany({
        where: { ...doCanal, snowflake: { gt: opcoes.after } },
        select: SELECAO_DE_MENSAGEM,
        orderBy: { snowflake: "asc" },
        take: limite,
      });
      linhas = crescente.reverse();
    } else {
      linhas = await this.prisma.message.findMany({
        where: {
          ...doCanal,
          ...(opcoes.before !== undefined ? { snowflake: { lt: opcoes.before } } : {}),
        },
        select: SELECAO_DE_MENSAGEM,
        orderBy: { snowflake: "desc" },
        take: limite,
      });
    }

    return linhas.map((l) => this.paraLinhaDeMensagem(l, opcoes.paraBotUserId));
  }

  // ── internos ───────────────────────────────────────────────

  private paraLinhaDeCanal(
    c: {
      id: string;
      snowflake: bigint;
      guildId: string | null;
      name: string | null;
      type: LinhaDeCanal["type"];
      position: number;
      topic: string | null;
      nsfw: boolean;
      slowmodeSeconds: number;
      category: { snowflake: bigint } | null;
    },
    guildSnowflake: bigint | null,
    destinatarios: LinhaDeUsuario[],
  ): LinhaDeCanal {
    return {
      id: c.id,
      snowflake: c.snowflake,
      guildId: c.guildId,
      guildSnowflake: c.guildId === null ? null : guildSnowflake,
      name: c.name,
      type: c.type,
      position: c.position,
      topic: c.topic,
      nsfw: c.nsfw,
      slowmodeSeconds: c.slowmodeSeconds,
      categoriaSnowflake: c.category?.snowflake ?? null,
      destinatarios,
    };
  }

  private paraLinhaDeMensagem(m: LinhaCrua, paraBotUserId: string | null): LinhaDeMensagem {
    return {
      id: m.id,
      snowflake: m.snowflake,
      channelSnowflake: m.channel.snowflake,
      guildSnowflake: m.channel.guild?.snowflake ?? null,
      author: m.author,
      content: m.content,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      type: m.type,
      attachments: m.attachments.map(paraLinhaDeAnexo),
      reactions: agruparReacoes(m.reactions, paraBotUserId),
      respostaA: m.replyTo
        ? { snowflake: m.replyTo.snowflake, channelSnowflake: m.replyTo.channel.snowflake }
        : null,
      pinned: m.pin !== null,
    };
  }
}

/** A linha crua da mensagem, como o `select` acima a devolve. */
interface LinhaCrua {
  id: string;
  snowflake: bigint;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  type: LinhaDeMensagem["type"];
  author: LinhaDeUsuario;
  channel: { snowflake: bigint; guildId: string | null; guild: { snowflake: bigint } | null };
  attachments: {
    id: string;
    snowflake: bigint;
    key: string;
    filename: string;
    contentType: string;
    size: number;
    width: number | null;
    height: number | null;
    externalUrl: string | null;
  }[];
  reactions: { emoji: string; userId: string }[];
  replyTo: { snowflake: bigint; channel: { snowflake: bigint } } | null;
  pin: { messageId: string } | null;
}

/**
 * Os cargos de um membro, **sem** o `@everyone`.
 *
 * No Discord ele é implícito e o id dele é o do servidor; mandá-lo na lista faz
 * o discord.js contar o servidor inteiro como um cargo atribuído.
 */
function semOEveryone(
  atribuicoes: { role: { snowflake: bigint; isDefault: boolean } }[],
): bigint[] {
  return atribuicoes.filter((a) => !a.role.isDefault).map((a) => a.role.snowflake);
}

/** Linhas de `Reaction` (uma por pessoa) → os grupos que o Discord manda. */
function agruparReacoes(
  linhas: { emoji: string; userId: string }[],
  paraBotUserId: string | null,
): LinhaDeReacao[] {
  const grupos = new Map<string, LinhaDeReacao>();
  for (const linha of linhas) {
    const grupo = grupos.get(linha.emoji);
    if (grupo) {
      grupo.count += 1;
      grupo.euReagi ||= linha.userId === paraBotUserId;
    } else {
      grupos.set(linha.emoji, {
        emoji: linha.emoji,
        count: 1,
        euReagi: paraBotUserId !== null && linha.userId === paraBotUserId,
      });
    }
  }
  return [...grupos.values()];
}

/**
 * Linha de `Attachment` → `LinhaDeAnexo`.
 *
 * **Limitação declarada da F1:** a URL de um anexo guardado no nosso bucket é
 * assinada na hora pelo `StorageService` (`attachmentUrl`), e ele não está
 * disponível aqui — o `DiscordCompatModule` não importa o `StorageModule`, e o
 * módulo é do coordenador. Então o que sai é: a URL do provedor quando o anexo é
 * externo (GIF), o caminho público do R2 quando `R2_PUBLIC_BASE_URL` existe, e o
 * proxy da API sem o `?t=` no resto — que o bot não consegue baixar. Relatado no
 * PR: resolve-se injetando `StorageService` neste service.
 */
function paraLinhaDeAnexo(a: LinhaCrua["attachments"][number]): LinhaDeAnexo {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(/\/+$/, "");
  return {
    id: a.id,
    snowflake: a.snowflake,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    width: a.width,
    height: a.height,
    url: a.externalUrl ?? (base ? `${base}/${a.key}` : `${api}/api/uploads/file/${a.id}`),
  };
}
