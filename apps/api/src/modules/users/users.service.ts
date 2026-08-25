import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { PublicUser } from "@newdisc/shared";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublic(id: string): Promise<PublicUser> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("Usuário não encontrado");
    return {
      id: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      status: u.status,
    };
  }
}
