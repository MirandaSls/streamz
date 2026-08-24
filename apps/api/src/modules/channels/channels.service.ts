import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import type { ChannelType } from "@newdisc/shared";

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
  ) {}

  async create(
    userId: string,
    guildId: string,
    name: string,
    type: ChannelType,
  ) {
    await this.guilds.assertMember(userId, guildId);
    const count = await this.prisma.channel.count({ where: { guildId } });
    return this.prisma.channel.create({
      data: { guildId, name, type, position: count },
    });
  }

  async listForGuild(userId: string, guildId: string) {
    await this.guilds.assertMember(userId, guildId);
    return this.prisma.channel.findMany({
      where: { guildId },
      orderBy: { position: "asc" },
    });
  }
}
