import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  MAX_STICKERS_PER_GUILD,
  MAX_STICKER_DIMENSION,
  MAX_STICKER_SIZE,
  WS_EVENTS,
  emojiNameSchema,
  type GuildStickers,
  type Sticker,
} from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { StorageService } from "../storage/storage.service";
import { isUniqueViolation } from "../../common/prisma-errors";
import { toStickerDTO } from "./dto";
import { extensaoDe, validarImagem } from "./imagem";
import type { ArquivoEnviado } from "./emojis.service";

/** Palavras-chave da busca do seletor: minúsculas, sem repetição, no máximo 8. */
const MAX_TAGS = 8;

@Injectable()
export class StickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  async listForGuild(userId: string, guildId: string): Promise<Sticker[]> {
    await this.guilds.assertMember(userId, guildId);
    return this.doGuild(guildId);
  }

  /** Figurinhas de todos os servidores do usuário, agrupadas (seletor). */
  async listForUser(userId: string): Promise<GuildStickers[]> {
    const guilds = await this.prisma.guild.findMany({
      where: { members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        iconUrl: true,
        stickers: { orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    });
    return guilds.map((g) => ({
      guildId: g.id,
      guildName: g.name,
      guildIconUrl: g.iconUrl,
      stickers: g.stickers.map(toStickerDTO),
    }));
  }

  async create(
    userId: string,
    guildId: string,
    nome: string,
    tags: string,
    file: ArquivoEnviado | undefined,
  ): Promise<Sticker> {
    await this.assertPodeGerenciar(userId, guildId);
    const name = this.validarNome(nome);

    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        "Armazenamento (R2) não configurado — sem ele não dá para guardar a imagem da figurinha. Ver PENDENCIAS.md.",
      );
    }

    const total = await this.prisma.sticker.count({ where: { guildId } });
    if (total >= MAX_STICKERS_PER_GUILD) {
      throw new ConflictException(
        `Este servidor já tem ${MAX_STICKERS_PER_GUILD} figurinhas. Apague uma antes de enviar outra.`,
      );
    }

    const imagem = validarImagem(file?.buffer ?? Buffer.alloc(0), {
      maxBytes: MAX_STICKER_SIZE,
      maxLado: MAX_STICKER_DIMENSION,
    });
    if (!imagem.ok) {
      throw imagem.grande
        ? new PayloadTooLargeException(imagem.motivo)
        : new BadRequestException(imagem.motivo);
    }

    const key = `stickers/${guildId}/${randomUUID()}.${extensaoDe(imagem.mime)}`;
    await this.storage.put(key, file!.buffer, imagem.mime);

    try {
      const row = await this.prisma.sticker.create({
        data: {
          guildId,
          name,
          tags: normalizarTags(tags),
          key,
          contentType: imagem.mime,
          size: file!.size,
          createdById: userId,
        },
      });
      await this.anunciar(guildId);
      return toStickerDTO(row);
    } catch (e) {
      await this.storage.delete(key);
      if (isUniqueViolation(e)) {
        throw new ConflictException(`Já existe uma figurinha "${name}" neste servidor`);
      }
      throw e;
    }
  }

  async update(
    userId: string,
    guildId: string,
    id: string,
    patch: { name?: string; tags?: string },
  ): Promise<Sticker> {
    await this.assertPodeGerenciar(userId, guildId);
    await this.buscarDoGuild(id, guildId);
    const data: { name?: string; tags?: string } = {};
    if (patch.name !== undefined) data.name = this.validarNome(patch.name);
    if (patch.tags !== undefined) data.tags = normalizarTags(patch.tags);
    try {
      const row = await this.prisma.sticker.update({ where: { id }, data });
      await this.anunciar(guildId);
      return toStickerDTO(row);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(`Já existe uma figurinha "${data.name}" neste servidor`);
      }
      throw e;
    }
  }

  /**
   * Apagar a figurinha não apaga as mensagens que a usaram: a relação é
   * `onDelete: SetNull`, então a mensagem antiga fica sem figurinha em vez de
   * sumir da conversa de todo mundo.
   */
  async remove(userId: string, guildId: string, id: string): Promise<{ deleted: string }> {
    await this.assertPodeGerenciar(userId, guildId);
    const row = await this.buscarDoGuild(id, guildId);
    await this.prisma.sticker.delete({ where: { id } });
    await this.storage.delete(row.key);
    await this.anunciar(guildId);
    return { deleted: id };
  }

  /** Bytes da imagem — pública por id, pelo mesmo motivo do emoji. */
  async imageStream(id: string): Promise<{ body: Readable; contentType: string }> {
    const row = await this.prisma.sticker.findUnique({
      where: { id },
      select: { key: true, contentType: true },
    });
    if (!row) throw new NotFoundException("Figurinha não encontrada");
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException("Armazenamento (R2) não configurado.");
    }
    return { body: await this.storage.get(row.key), contentType: row.contentType };
  }

  /**
   * A figurinha que uma mensagem pode carregar: só vale se o autor for membro
   * do servidor dono dela. Sem isso, um id vazado deixaria qualquer um enviar a
   * figurinha de um servidor fechado — e o `Sticker` viaja no DTO da mensagem.
   */
  async assertPodeUsar(userId: string, stickerId: string) {
    const row = await this.prisma.sticker.findUnique({ where: { id: stickerId } });
    if (!row) throw new NotFoundException("Figurinha não encontrada");
    await this.guilds.assertMember(userId, row.guildId);
    return row;
  }

  private async doGuild(guildId: string): Promise<Sticker[]> {
    const rows = await this.prisma.sticker.findMany({
      where: { guildId },
      orderBy: { name: "asc" },
    });
    return rows.map(toStickerDTO);
  }

  private async buscarDoGuild(id: string, guildId: string) {
    const row = await this.prisma.sticker.findUnique({ where: { id } });
    if (!row || row.guildId !== guildId) throw new NotFoundException("Figurinha não encontrada");
    return row;
  }

  /** TODO(agente C): `MANAGE_EMOJIS` quando os cargos existirem (ver EmojisService). */
  private async assertPodeGerenciar(userId: string, guildId: string) {
    return this.guilds.assertCanModerate(userId, guildId);
  }

  private validarNome(nome: string): string {
    const parsed = emojiNameSchema.safeParse((nome ?? "").trim().toLowerCase());
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Nome inválido");
    }
    return parsed.data;
  }

  private async anunciar(guildId: string) {
    this.realtime.emitToGuild(guildId, WS_EVENTS.STICKER_UPDATED, {
      guildId,
      stickers: await this.doGuild(guildId),
    });
  }
}

/** Palavras-chave em minúsculas, separadas por espaço, sem repetição. */
export function normalizarTags(tags: string): string {
  const vistas = new Set<string>();
  for (const bruto of (tags ?? "").toLowerCase().split(/[\s,]+/)) {
    const t = bruto.replace(/[^a-z0-9_]/g, "").slice(0, 24);
    if (t) vistas.add(t);
    if (vistas.size >= MAX_TAGS) break;
  }
  return Array.from(vistas).join(" ");
}
