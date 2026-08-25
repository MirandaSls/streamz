import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { WS_EVENTS, MAX_AVATAR_SIZE, MAX_DISPLAY_NAME } from "@newdisc/shared";
import type { PublicUser, UserStatus } from "@newdisc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { toPublicUser } from "../../common/dto";
import { RealtimeService } from "../realtime/realtime.service";
import { StorageService } from "../storage/storage.service";
import { sniffImage } from "../uploads/media";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly storage: StorageService,
  ) {}

  async getPublic(id: string): Promise<PublicUser> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("Usuário não encontrado");
    return toPublicUser(u);
  }

  /** Busca por username (prefixo ou trecho), sem incluir quem pergunta. */
  async search(meId: string, query: string, take = 10): Promise<PublicUser[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        id: { not: meId },
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { username: "asc" },
      take,
    });
    return rows.map(toPublicUser);
  }

  /** Edita o nome de exibição e avisa todo mundo (nomes aparecem em toda tela). */
  async updateProfile(meId: string, patch: { displayName?: string | null }): Promise<PublicUser> {
    const displayName =
      patch.displayName === undefined ? undefined : patch.displayName?.trim() || null;
    if (displayName && displayName.length > MAX_DISPLAY_NAME) {
      throw new BadRequestException(`Nome de exibição acima de ${MAX_DISPLAY_NAME} caracteres`);
    }
    const u = await this.prisma.user.update({ where: { id: meId }, data: { displayName } });
    const dto = toPublicUser(u);
    this.realtime.emitAll(WS_EVENTS.USER_UPDATED, dto);
    return dto;
  }

  /**
   * Status escolhido pelo usuário. `null` volta ao automático. Se ele está
   * conectado, a presença efetiva muda na hora (OFFLINE manual = invisível).
   */
  async updateStatus(meId: string, manualStatus: UserStatus | null): Promise<PublicUser> {
    const atual = await this.prisma.user.findUnique({ where: { id: meId } });
    if (!atual) throw new NotFoundException("Usuário não encontrado");
    // conectado = status efetivo diferente de OFFLINE ou já estava invisível
    const conectado = atual.status !== "OFFLINE" || atual.manualStatus === "OFFLINE";
    const status: UserStatus = conectado ? (manualStatus ?? "ONLINE") : "OFFLINE";
    const u = await this.prisma.user.update({
      where: { id: meId },
      data: { manualStatus, status },
    });
    const dto = toPublicUser(u);
    this.realtime.emitAll(WS_EVENTS.PRESENCE_UPDATE, { userId: meId, status });
    this.realtime.emitAll(WS_EVENTS.USER_UPDATED, dto);
    return dto;
  }

  /** Avatar: imagem reconhecida pelos bytes, guardada no storage, servida por /users/:id/avatar. */
  async updateAvatar(
    meId: string,
    file: { buffer: Buffer; size: number },
  ): Promise<PublicUser> {
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException("Armazenamento (R2) não configurado. Ver PENDENCIAS.md.");
    }
    if (!file?.buffer?.length) throw new BadRequestException("Arquivo vazio");
    if (file.size > MAX_AVATAR_SIZE) {
      throw new PayloadTooLargeException(`Avatar acima de ${MAX_AVATAR_SIZE / 1024 / 1024} MB`);
    }
    const image = sniffImage(file.buffer);
    if (!image) throw new BadRequestException("O avatar precisa ser uma imagem (PNG, JPEG, GIF ou WebP)");

    const key = `avatars/${meId}/${randomUUID()}`;
    await this.storage.put(key, file.buffer, image.mime);

    const antes = await this.prisma.user.findUnique({ where: { id: meId }, select: { avatarKey: true } });
    const u = await this.prisma.user.update({
      where: { id: meId },
      data: { avatarKey: key, avatarUrl: this.avatarUrl(meId, key) },
    });
    if (antes?.avatarKey) await this.storage.delete(antes.avatarKey);

    const dto = toPublicUser(u);
    this.realtime.emitAll(WS_EVENTS.USER_UPDATED, dto);
    return dto;
  }

  /** Corpo + content-type do avatar para o proxy público. */
  async avatarStream(userId: string): Promise<{ body: Readable; contentType: string }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    if (!u?.avatarKey) throw new NotFoundException("Sem avatar");
    // o content-type real foi validado no upload; o proxy sempre serve como imagem
    return { body: await this.storage.get(u.avatarKey), contentType: "image/*" };
  }

  /**
   * Avatares são públicos (como no Discord) — a URL leva a versão na query para
   * o cache do browser trocar quando o avatar muda.
   */
  private avatarUrl(userId: string, key: string): string {
    const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(/\/+$/, "");
    const v = key.split("/").pop() ?? "";
    return `${api}/api/users/${userId}/avatar?v=${v}`;
  }
}
