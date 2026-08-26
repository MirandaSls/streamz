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
  MAX_CUSTOM_EMOJI_DIMENSION,
  MAX_CUSTOM_EMOJI_SIZE,
  MAX_EMOJIS_PER_GUILD,
  Permission,
  WS_EVENTS,
  emojiNameSchema,
  type CustomEmoji,
  type GuildEmojis,
} from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { StorageService } from "../storage/storage.service";
import { isUniqueViolation } from "../../common/prisma-errors";
import { toEmojiDTO } from "./dto";
import { extensaoDe, validarImagem } from "./imagem";

/** O que o multer entrega ao controller. */
export interface ArquivoEnviado {
  buffer: Buffer;
  size: number;
}

@Injectable()
export class EmojisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Emojis de um servidor (qualquer membro vê). */
  async listForGuild(userId: string, guildId: string): Promise<CustomEmoji[]> {
    await this.guilds.assertMember(userId, guildId);
    return this.doGuild(guildId);
  }

  /**
   * Emojis de todos os servidores do usuário, agrupados — é o que o seletor
   * mostra: a seção do servidor aberto e, abaixo, a dos outros. Numa consulta
   * só, porque o seletor abre a cada clique no botão de emoji.
   */
  async listForUser(userId: string): Promise<GuildEmojis[]> {
    const guilds = await this.prisma.guild.findMany({
      where: { members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        iconUrl: true,
        customEmojis: { orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    });
    return guilds.map((g) => ({
      guildId: g.id,
      guildName: g.name,
      guildIconUrl: g.iconUrl,
      emojis: g.customEmojis.map(toEmojiDTO),
    }));
  }

  async create(
    userId: string,
    guildId: string,
    nome: string,
    file: ArquivoEnviado | undefined,
  ): Promise<CustomEmoji> {
    await this.assertPodeGerenciar(userId, guildId);
    const name = this.validarNome(nome);

    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        "Armazenamento (R2) não configurado — sem ele não dá para guardar a imagem do emoji. Ver PENDENCIAS.md.",
      );
    }

    const total = await this.prisma.customEmoji.count({ where: { guildId } });
    if (total >= MAX_EMOJIS_PER_GUILD) {
      throw new ConflictException(
        `Este servidor já tem ${MAX_EMOJIS_PER_GUILD} emojis. Apague um antes de enviar outro.`,
      );
    }

    const imagem = validarImagem(file?.buffer ?? Buffer.alloc(0), {
      maxBytes: MAX_CUSTOM_EMOJI_SIZE,
      maxLado: MAX_CUSTOM_EMOJI_DIMENSION,
    });
    if (!imagem.ok) {
      throw imagem.grande
        ? new PayloadTooLargeException(imagem.motivo)
        : new BadRequestException(imagem.motivo);
    }

    // a chave nasce única (uuid) — renomear o emoji não move o objeto
    const key = `emojis/${guildId}/${randomUUID()}.${extensaoDe(imagem.mime)}`;
    await this.storage.put(key, file!.buffer, imagem.mime);

    try {
      const row = await this.prisma.customEmoji.create({
        data: {
          guildId,
          name,
          key,
          contentType: imagem.mime,
          size: file!.size,
          animated: imagem.animated,
          createdById: userId,
        },
      });
      await this.anunciar(guildId);
      return toEmojiDTO(row);
    } catch (e) {
      // o objeto já subiu; sem a linha ele viraria lixo no bucket
      await this.storage.delete(key);
      if (isUniqueViolation(e)) {
        throw new ConflictException(`Já existe um emoji :${name}: neste servidor`);
      }
      throw e;
    }
  }

  async rename(
    userId: string,
    guildId: string,
    id: string,
    nome: string,
  ): Promise<CustomEmoji> {
    await this.assertPodeGerenciar(userId, guildId);
    const name = this.validarNome(nome);
    await this.buscarDoGuild(id, guildId);
    try {
      const row = await this.prisma.customEmoji.update({ where: { id }, data: { name } });
      await this.anunciar(guildId);
      return toEmojiDTO(row);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(`Já existe um emoji :${name}: neste servidor`);
      }
      throw e;
    }
  }

  async remove(userId: string, guildId: string, id: string): Promise<{ deleted: string }> {
    await this.assertPodeGerenciar(userId, guildId);
    const row = await this.buscarDoGuild(id, guildId);
    await this.prisma.customEmoji.delete({ where: { id } });
    await this.storage.delete(row.key);
    await this.anunciar(guildId);
    return { deleted: id };
  }

  /**
   * Bytes da imagem para a rota pública `GET /emojis/:id/image`.
   *
   * Pública de propósito: o mesmo emoji aparece em mensagem de qualquer canal —
   * inclusive para quem não é (ou deixou de ser) membro do servidor de origem —,
   * então exigir autorização do servidor quebraria o render sem esconder nada
   * que já não estivesse na mensagem. É o mesmo desenho do CDN de emoji do
   * Discord, e o oposto do anexo, cuja leitura é sempre autorizada.
   */
  async imageStream(id: string): Promise<{ body: Readable; contentType: string }> {
    const row = await this.prisma.customEmoji.findUnique({
      where: { id },
      select: { key: true, contentType: true },
    });
    if (!row) throw new NotFoundException("Emoji não encontrado");
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException("Armazenamento (R2) não configurado.");
    }
    return { body: await this.storage.get(row.key), contentType: row.contentType };
  }

  /**
   * O emoji que uma reação pode usar: precisa existir e o autor precisa ser
   * membro do servidor dono dele. Sem isso, um id vazado deixaria reagir com o
   * emoji de um servidor fechado — a reação carrega `<:nome:id>` para todo mundo.
   */
  async assertPodeUsar(userId: string, emojiId: string) {
    const row = await this.prisma.customEmoji.findUnique({ where: { id: emojiId } });
    if (!row) throw new NotFoundException("Emoji não encontrado");
    await this.guilds.assertMember(userId, row.guildId);
    return row;
  }

  /** Lista crua de um servidor, sem checar associação (uso interno). */
  private async doGuild(guildId: string): Promise<CustomEmoji[]> {
    const rows = await this.prisma.customEmoji.findMany({
      where: { guildId },
      orderBy: { name: "asc" },
    });
    return rows.map(toEmojiDTO);
  }

  private async buscarDoGuild(id: string, guildId: string) {
    const row = await this.prisma.customEmoji.findUnique({ where: { id } });
    if (!row || row.guildId !== guildId) throw new NotFoundException("Emoji não encontrado");
    return row;
  }

  /** Quem pode mexer nos emojis do servidor: `MANAGE_EMOJIS` (ADR-0002). */
  private async assertPodeGerenciar(userId: string, guildId: string) {
    return this.guilds.assertCanModerate(userId, guildId, Permission.MANAGE_EMOJIS);
  }

  private validarNome(nome: string): string {
    const parsed = emojiNameSchema.safeParse((nome ?? "").trim().toLowerCase());
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Nome inválido");
    }
    return parsed.data;
  }

  /** A lista mudou: quem está no servidor atualiza o seletor na hora. */
  private async anunciar(guildId: string) {
    this.realtime.emitToGuild(guildId, WS_EVENTS.EMOJI_UPDATED, {
      guildId,
      emojis: await this.doGuild(guildId),
    });
  }
}
