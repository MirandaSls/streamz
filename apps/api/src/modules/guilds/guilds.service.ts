import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class GuildsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria o servidor, registra o dono como membro OWNER e um canal #geral. */
  async create(ownerId: string, name: string) {
    return this.prisma.guild.create({
      data: {
        name,
        ownerId,
        members: { create: { userId: ownerId, role: "OWNER" } },
        channels: { create: { name: "geral", type: "TEXT", position: 0 } },
      },
      include: { channels: true },
    });
  }

  /** Servidores em que o usuário é membro. */
  async listForUser(userId: string) {
    return this.prisma.guild.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async getWithChannels(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      include: { channels: { orderBy: { position: "asc" } } },
    });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    await this.assertMember(userId, guildId);
    return guild;
  }

  async assertMember(userId: string, guildId: string) {
    const member = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
    });
    if (!member) throw new ForbiddenException("Você não é membro deste servidor");
    return member;
  }

  /** Entra num servidor via id (convite simplificado para o MVP). */
  async join(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new NotFoundException("Servidor não encontrado");
    await this.prisma.guildMember.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId, role: "MEMBER" },
      update: {},
    });
    return guild;
  }
}
