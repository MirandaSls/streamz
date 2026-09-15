import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { displayNameOf, type ResumoDeCanal } from "@streamz/shared";
import { JwtGuard, type JwtPayload } from "../../common/jwt.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";

/**
 * Resumo de um canal para a pílula de menção `<#id>` (`lib/markdown.tsx`).
 *
 * O cliente só tem carregados os canais do servidor aberto e as conversas da
 * lista; uma menção a canal de outro servidor saía "#canal-desconhecido". Aqui
 * ele pergunta o nome, o tipo e o servidor — nada mais.
 *
 * A autorização é a central (`assertCanViewChannel`, a mesma de ler as
 * mensagens do canal): quem não enxerga o canal recebe 403 (privado, ou não
 * participa da conversa) ou 404 (não existe / não é membro do servidor), e o
 * cliente desenha a pílula de "sem acesso" sem nunca ver o nome.
 *
 * Rota: `GET /api/channels/:channelId/resumo`. Não colide com os outros
 * controllers em `channels/:channelId` — `read` (POST), `messages`, `pins`,
 * `threads` e `attachments` são segmentos fixos diferentes, e o
 * `/api/v10/channels/:id` da compatibilidade com o Discord vive sob `v10`.
 */
@UseGuards(JwtGuard)
@Controller("channels")
export class ResumoDeCanalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
  ) {}

  @Get(":channelId/resumo")
  async resumo(
    @CurrentUser() user: JwtPayload,
    @Param("channelId") channelId: string,
  ): Promise<ResumoDeCanal> {
    const acesso = await this.guilds.assertCanViewChannel(user.sub, channelId);
    const { channel } = acesso;

    // `ChannelAccess` não traz o nome: é o único campo que falta
    const linha = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { name: true },
    });

    let name = linha?.name ?? "";
    if (!name && channel.guildId === null) {
      // conversa 1-a-1 (ou grupo sem nome): o título são os outros
      // participantes, como a lista de conversas mostra (`dmTitle`)
      const outros = await this.prisma.channelMember.findMany({
        where: { channelId, userId: { not: user.sub } },
        select: { user: { select: { username: true, displayName: true } } },
        orderBy: { joinedAt: "asc" },
      });
      name = outros.map((m) => displayNameOf(m.user)).join(", ");
    }

    return {
      id: channel.id,
      name,
      type: channel.type,
      guildId: channel.guildId,
    };
  }
}
