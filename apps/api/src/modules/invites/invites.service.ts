import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import type { InviteInfo, InvitePreview } from "@newdisc/shared";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
  ) {}

  /** Cria um convite. Só membros do servidor podem convidar. */
  async create(
    userId: string,
    guildId: string,
    opts?: { maxUses?: number; expiresInHours?: number },
  ): Promise<InviteInfo> {
    await this.guilds.assertMember(userId, guildId);

    const expiresAt =
      opts?.expiresInHours && opts.expiresInHours > 0
        ? new Date(Date.now() + opts.expiresInHours * 3600 * 1000)
        : null;

    // gera um código único (tenta algumas vezes em caso de colisão)
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.genCode();
      const exists = await this.prisma.invite.findUnique({ where: { code } });
      if (exists) continue;
      const invite = await this.prisma.invite.create({
        data: {
          code,
          guildId,
          creatorId: userId,
          maxUses: opts?.maxUses && opts.maxUses > 0 ? opts.maxUses : null,
          expiresAt,
        },
      });
      return this.toInfo(invite);
    }
    throw new BadRequestException("Não foi possível gerar um código de convite");
  }

  /** Prévia pública do convite (para a tela de "entrar no servidor"). */
  async preview(code: string): Promise<InvitePreview> {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { guild: true },
    });
    if (!invite) throw new NotFoundException("Convite inválido");

    const { valid, reason } = this.checkValidity(invite);
    return {
      code: invite.code,
      guild: {
        id: invite.guild.id,
        name: invite.guild.name,
        iconUrl: invite.guild.iconUrl,
      },
      valid,
      reason,
    };
  }

  /** Resgata o convite: adiciona o usuário como membro e conta o uso. */
  async redeem(userId: string, code: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { guild: true },
    });
    if (!invite) throw new NotFoundException("Convite inválido");

    const { valid, reason } = this.checkValidity(invite);
    if (!valid) throw new BadRequestException(reason ?? "Convite expirado");

    if (await this.guilds.isBanned(invite.guildId, userId)) {
      throw new ForbiddenException("Você foi banido deste servidor");
    }

    const already = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId: invite.guildId } },
    });

    if (!already) {
      await this.prisma.$transaction([
        this.prisma.guildMember.create({
          data: { userId, guildId: invite.guildId, role: "MEMBER" },
        }),
        this.prisma.invite.update({
          where: { id: invite.id },
          data: { uses: { increment: 1 } },
        }),
      ]);
    }

    return invite.guild;
  }

  private checkValidity(invite: {
    expiresAt: Date | null;
    maxUses: number | null;
    uses: number;
  }): { valid: boolean; reason?: string } {
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      return { valid: false, reason: "Convite expirado" };
    }
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
      return { valid: false, reason: "Convite atingiu o limite de usos" };
    }
    return { valid: true };
  }

  private toInfo(invite: {
    code: string;
    guildId: string;
    uses: number;
    maxUses: number | null;
    expiresAt: Date | null;
  }): InviteInfo {
    return {
      code: invite.code,
      guildId: invite.guildId,
      uses: invite.uses,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    };
  }

  private genCode(len = 8): string {
    const bytes = randomBytes(len);
    let out = "";
    for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
  }
}
