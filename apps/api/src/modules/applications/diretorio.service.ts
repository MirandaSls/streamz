import { Injectable, NotFoundException } from "@nestjs/common";
import type { AppDoDiretorio, PaginaDoDiretorio } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { toPublicUser, type PublicUserRow } from "../../common/dto";

/**
 * "Descobrir aplicativos" — o catálogo do que roda **nesta** instância.
 *
 * ── j-bots · F4, lote B ──
 *
 * É a vista de quem vai **instalar**, e não a do dono: nada de `publico`, de
 * `createdAt` nem do prefixo do token sai daqui (ver `AppDoDiretorio` em
 * `@streamz/shared`, que de propósito não estende `AppView`). O que entra e não
 * está lá é `servidores`, a contagem inteira de instalações — a que vira o
 * "em N servidores" do card.
 *
 * Ver `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` §11 e o `CONTRATO-F4.md` §3.2.
 */

/** Quantos cards uma página do diretório traz. */
export const TAMANHO_DA_PAGINA = 24;

/** O que o service precisa de uma linha para montar o `AppDoDiretorio`. */
const SELECT_DO_DIRETORIO = {
  id: true,
  snowflake: true,
  name: true,
  description: true,
  iconKey: true,
  permissoesPadrao: true,
  ownerId: true,
  publico: true,
  oficial: true,
  botUser: true,
  _count: { select: { installs: true } },
} as const;

@Injectable()
export class DiretorioService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Uma página do diretório: **só** os aplicativos com `publico: true`.
   *
   * A busca cobre nome e descrição, `insensitive` — é o mesmo par que o card
   * mostra, e procurar por uma palavra que só aparece na descrição ("música")
   * é o caso mais comum de quem não decorou o nome do bot.
   *
   * Paginação por cursor opaco, no padrão de `admin.service.ts`: pede-se
   * `TAMANHO_DA_PAGINA + 1` e a linha excedente vira o `proximoCursor`, em vez
   * de um `count` a mais por página.
   */
  async listarPublicas(q?: string, cursor?: string, limit?: number): Promise<PaginaDoDiretorio> {
    const busca = q?.trim();
    const tamanho = this.tamanhoPedido(limit);
    const where = {
      publico: true,
      ...(busca
        ? {
            OR: [
              { name: { contains: busca, mode: "insensitive" as const } },
              { description: { contains: busca, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.application.findMany({
      where,
      select: SELECT_DO_DIRETORIO,
      // `id` no desempate: dois apps criados no mesmo milissegundo (a semente
      // faz isso) embaralhariam entre uma página e a seguinte, e o cursor
      // pularia ou repetiria uma linha.
      // Os oficiais primeiro: quem abre "Descobrir aplicativos" numa instância
      // nova está procurando os bots que a instância oferece, não o terceiro
      // app que alguém publicou hoje. O `id` continua no fim como desempate do
      // cursor (dois apps criados no mesmo milissegundo embaralhariam entre uma
      // página e a seguinte).
      orderBy: [{ oficial: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: tamanho + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const pagina = rows.slice(0, tamanho);
    return {
      itens: pagina.map((a) => this.paraDiretorio(a)),
      proximoCursor: rows.length > tamanho ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * A página de um aplicativo.
   *
   * Devolve o app se ele for público **ou** se quem pergunta for o dono; caso
   * contrário **404**, e não 403. Um 403 confirmaria que o id existe, e a
   * privacidade de um app privado inclui a existência dele: o dono que ainda
   * não publicou não deve ser descobrível por força bruta de cuid.
   */
  async porId(actorId: string, id: string): Promise<AppDoDiretorio> {
    const app = await this.prisma.application.findUnique({
      where: { id },
      select: SELECT_DO_DIRETORIO,
    });
    if (!app || (!app.publico && app.ownerId !== actorId)) {
      throw new NotFoundException("Aplicativo não encontrado");
    }
    return this.paraDiretorio(app);
  }

  /**
   * Linha → DTO, campo a campo.
   *
   * Campo a campo e não `...app` pelo mesmo motivo do `paraDetalhe` do
   * `ApplicationsService`: `snowflake` é `BigInt` e `JSON.stringify` de um
   * `bigint` lança `TypeError`. Aqui ele vira string decimal.
   */
  private paraDiretorio(app: {
    id: string;
    snowflake: bigint;
    name: string;
    description: string | null;
    iconKey: string | null;
    permissoesPadrao: number;
    oficial: boolean;
    botUser: PublicUserRow;
    _count: { installs: number };
  }): AppDoDiretorio {
    return {
      id: app.id,
      snowflake: app.snowflake.toString(),
      name: app.name,
      description: app.description,
      iconUrl: urlDoIconeDoApp(app.id, app.iconKey),
      permissoesPadrao: app.permissoesPadrao,
      oficial: app.oficial,
      servidores: app._count.installs,
      botUser: toPublicUser(app.botUser),
    };
  }

  /** Teto e piso do `limit` da rota: um `?limit=100000` não vira uma varredura. */
  private tamanhoPedido(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit)) return TAMANHO_DA_PAGINA;
    return Math.min(Math.max(Math.trunc(limit), 1), TAMANHO_DA_PAGINA);
  }
}

/**
 * A URL do ícone do aplicativo, derivada da chave no storage.
 *
 * `Application` **não tem coluna `iconUrl`** (só `iconKey`, ver §10): a URL é
 * derivada na hora, como o §10 pede. A rota de leitura em si — o proxy que
 * serve os bytes — é do **lote A**, junto com o upload; enquanto ela não
 * existir, `iconKey` é sempre `null` no banco e esta função devolve `null` para
 * todo mundo. O caminho `/api/applications/:id/icone` é o que o lote A vai
 * publicar (é o espelho de `GET /api/guilds/:id/icon`, o proxy do ícone de
 * servidor), e deixá-lo escrito aqui é o que faz o diretório passar a mostrar
 * ícone **sem nenhuma mudança neste arquivo** no dia em que o lote A entrar.
 *
 * A forma é a mesma do ícone de servidor (`GuildsService.iconUrl`), inclusive o
 * `?v=` com o último segmento da chave: sem ele, trocar o ícone não trocaria a
 * URL e o navegador continuaria mostrando o antigo do cache.
 *
 * Exportada para o `InstalacaoService`, que monta o mesmo DTO.
 */
export function urlDoIconeDoApp(appId: string, iconKey: string | null): string | null {
  if (!iconKey) return null;
  const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(/\/+$/, "");
  const v = iconKey.split("/").pop() ?? "";
  return `${api}/api/applications/${appId}/icone?v=${v}`;
}
