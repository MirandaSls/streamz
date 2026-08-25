import { Injectable } from "@nestjs/common";
import type { Attachment } from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { StorageService } from "../storage/storage.service";
import { toAttachmentDTO } from "../uploads/attachment-dto";

/** Quantos anexos a galeria do painel lateral traz de uma vez. */
const PAGINA = 50;

/**
 * Galeria de mídia de um canal — a aba "Mídia" do painel lateral.
 *
 * Só anexos já vinculados a mensagem entram: um anexo solto (enviado e nunca
 * mandado) é privado de quem enviou e não faz parte do canal.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly storage: StorageService,
  ) {}

  async listForChannel(
    userId: string,
    channelId: string,
    tipo: "image" | "all",
    take = PAGINA,
  ): Promise<Attachment[]> {
    await this.guilds.assertCanViewChannel(userId, channelId);
    const rows = await this.prisma.attachment.findMany({
      where: {
        message: { channelId },
        ...(tipo === "image" ? { contentType: { startsWith: "image/" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(take, 1), PAGINA),
    });
    return Promise.all(rows.map((a) => toAttachmentDTO(this.storage, a)));
  }
}
