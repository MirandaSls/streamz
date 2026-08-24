import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { isUniqueViolation } from "../../common/prisma-errors";
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

    const maxUses = opts?.maxUses && opts.maxUses > 0 ? opts.maxUses : null;

    // Tenta criar direto; em caso de colisão no code (@unique → P2002) gera
    // outro. Evita o findUnique-then-create, que tem corrida entre a checagem
    // e a inserção.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invite = await this.prisma.invite.create({
          data: { code: this.genCode(), guildId, creatorId: userId, maxUses, expiresAt },
        });
        return this.toInfo(invite);
      } catch (e) {
        if (isUniqueViolation(e)) continue;
        throw e;
      }
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

    // rejeição rápida (expirado / limite já atingido); o limite ainda é
    // reforçado atomicamente na transação abaixo, à prova de corrida
    const { valid, reason } = this.checkValidity(invite);
    if (!valid) throw new BadRequestException(reason ?? "Convite inválido");

    if (await this.guilds.isBanned(invite.guildId, userId)) {
      throw new ForbiddenException("Você foi banido deste servidor");
    }

    // Idempotência: quem já é membro não consome outro uso.
    const already = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId: invite.guildId } },
    });
    if (already) return invite.guild;

    await this.prisma.$transaction(async (tx) => {
      // 1. cria a associação. Se dois pedidos do mesmo usuário correm juntos, o
      //    segundo bate no unique (userId_guildId) e sai sem consumir uso.
      try {
        await tx.guildMember.create({
          data: { userId, guildId: invite.guildId, role: "MEMBER" },
        });
      } catch (e) {
        if (isUniqueViolation(e)) return; // já virou membro numa corrida
        throw e;
      }

      // 2. consome um uso de forma atômica, respeitando maxUses. O where com
      //    `uses < maxUses` fecha a corrida TOCTOU: se o limite já foi atingido,
      //    count === 0 e o throw desfaz o guildMember.create acima (rollback).
      if (invite.maxUses !== null) {
        const res = await tx.invite.updateMany({
          where: { id: invite.id, uses: { lt: invite.maxUses } },
          data: { uses: { increment: 1 } },
        });
        if (res.count === 0) {
          throw new BadRequestException("Convite atingiu o limite de usos");
        }
      } else {
        await tx.invite.update({
          where: { id: invite.id },
          data: { uses: { increment: 1 } },
        });
      }
    });

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
    // Rejection sampling: descarta bytes na "cauda" que não formam um múltiplo
    // completo do alfabeto, evitando o viés de módulo (256 % 36 !== 0).
    const limit = 256 - (256 % ALPHABET.length);
    let out = "";
    while (out.length < len) {
      const bytes = randomBytes(len);
      for (let i = 0; i < bytes.length && out.length < len; i++) {
        if (bytes[i] < limit) out += ALPHABET[bytes[i] % ALPHABET.length];
      }
    }
    return out;
  }
}
