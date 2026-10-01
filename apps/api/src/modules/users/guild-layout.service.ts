import { BadRequestException, Injectable } from "@nestjs/common";
import { WS_EVENTS, guildLayoutSchema, resolveGuildLayout } from "@streamz/shared";
import type { GuildLayout } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

/** Layout da barra de servidores (pastas + ordem), um documento por usuário. */
@Injectable()
export class GuildLayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Ids dos servidores do usuário na "ordem atual". Ordena por Guild.createdAt,
   * igual a GuildsService.listForUser: com outra ordem a barra "pula" ao criar
   * a primeira pasta.
   */
  private async idsDosServidores(userId: string): Promise<string[]> {
    const membros = await this.prisma.guildMember.findMany({
      where: { userId },
      select: { guildId: true },
      orderBy: { guild: { createdAt: "asc" } },
    });
    return membros.map((m) => m.guildId);
  }

  /**
   * Sempre reconcilia com a lista atual: o layout gravado não é reescrito
   * quando o usuário entra/sai de servidor, então a correção acontece na leitura.
   */
  async obter(userId: string): Promise<GuildLayout> {
    const [salvo, ids] = await Promise.all([
      this.prisma.userGuildLayout.findUnique({ where: { userId } }),
      this.idsDosServidores(userId),
    ]);
    const parsed = salvo ? guildLayoutSchema.safeParse(salvo.layout) : null;
    // documento corrompido/antigo vira "nunca arrumou": tudo solto, sem 500
    return resolveGuildLayout(parsed?.success ? parsed.data : null, ids);
  }

  async salvar(userId: string, entrada: GuildLayout): Promise<GuildLayout> {
    const ids = await this.idsDosServidores(userId);
    const meus = new Set(ids);
    // recusa em vez de descartar em silêncio: id alheio indica cliente errado
    // ou tentativa de sondar servidores que o usuário não vê
    const alheios = new Set<string>();
    for (const item of entrada.items) {
      const guildIds = item.kind === "folder" ? item.folder.guildIds : [item.guildId];
      for (const id of guildIds) if (!meus.has(id)) alheios.add(id);
    }
    if (alheios.size > 0) {
      throw new BadRequestException("O layout referencia servidor de que você não é membro");
    }

    const layout = resolveGuildLayout(entrada, ids);
    const json = layout as unknown as object;
    await this.prisma.userGuildLayout.upsert({
      where: { userId },
      create: { userId, layout: json },
      update: { layout: json },
    });
    this.realtime.emitToUser(userId, WS_EVENTS.GUILD_LAYOUT_UPDATE, layout);
    return layout;
  }
}
