import { Injectable, NotFoundException } from "@nestjs/common";
import { Permission } from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";

export interface WidgetDTO {
  id: string;
  name: string;
  instantInvite: string | null;
  channels: { id: string; name: string; position: number }[];
  presenceCount: number;
}

interface CanalBruto {
  id: string;
  name: string | null;
  position: number;
  overrides: { roleId: string | null; userId: string | null; deny: number }[];
}

/**
 * Canal de voz entra no widget só se o `@everyone` enxerga: o cargo padrão
 * tem VIEW_CHANNEL e nenhum override do canal para ele nega o bit. Override
 * de cargo/usuário específico não importa — o widget é para quem não é membro.
 * Função pura para ser testável sem banco.
 */
export function canaisVisiveisAoEveryone(
  canais: CanalBruto[],
  everyoneRoleId: string | null,
  everyonePermissions: number,
): { id: string; name: string; position: number }[] {
  if (!everyoneRoleId || (everyonePermissions & Permission.VIEW_CHANNEL) === 0) return [];
  return canais
    .filter(
      (c) =>
        !c.overrides.some(
          (o) => o.roleId === everyoneRoleId && (o.deny & Permission.VIEW_CHANNEL) !== 0,
        ),
    )
    .sort((a, b) => a.position - b.position || (a.name ?? "").localeCompare(b.name ?? ""))
    .map((c) => ({ id: c.id, name: c.name ?? "", position: c.position }));
}

/** Convite que ainda serve e não é temporário (o temporário expulsa quem desconecta). */
export function escolherConviteValido(
  convites: { code: string; temporary: boolean; expiresAt: Date | null; maxUses: number | null; uses: number }[],
  agora = Date.now(),
): string | null {
  const ok = convites.find(
    (i) =>
      !i.temporary &&
      (!i.expiresAt || i.expiresAt.getTime() >= agora) &&
      (i.maxUses === null || i.uses < i.maxUses),
  );
  return ok?.code ?? null;
}

@Injectable()
export class WidgetService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rota pública: devolve só agregados e nomes de canal de voz. Nunca membros
   * nem mensagens. Servidor inexistente e widget desligado dão o mesmo 404,
   * para não revelar quais ids existem.
   */
  async obter(guildId: string): Promise<WidgetDTO> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { id: true, name: true, widgetEnabled: true },
    });
    if (!guild || !guild.widgetEnabled) throw new NotFoundException("Widget desativado");

    const [everyone, canais, convites, presenceCount] = await Promise.all([
      this.prisma.role.findFirst({
        where: { guildId, isDefault: true },
        select: { id: true, permissions: true },
      }),
      this.prisma.channel.findMany({
        where: { guildId, type: "VOICE" },
        select: {
          id: true,
          name: true,
          position: true,
          overrides: { select: { roleId: true, userId: true, deny: true } },
        },
      }),
      this.prisma.invite.findMany({
        where: { guildId, temporary: false },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { code: true, temporary: true, expiresAt: true, maxUses: true, uses: true },
      }),
      // mesma fonte do preview de convite: o status gravado no usuário
      this.prisma.guildMember.count({
        where: { guildId, user: { status: { not: "OFFLINE" } } },
      }),
    ]);

    return {
      id: guild.id,
      name: guild.name,
      instantInvite: escolherConviteValido(convites),
      channels: canaisVisiveisAoEveryone(canais, everyone?.id ?? null, everyone?.permissions ?? 0),
      presenceCount,
    };
  }
}
