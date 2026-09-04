import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  WS_EVENTS,
  MAX_ABOUT_ME,
  MAX_AVATAR_SIZE,
  MAX_BANNER_SIZE,
  MAX_CUSTOM_STATUS,
  MAX_DISPLAY_NAME,
  MAX_PRONOUNS,
  HEX_COLOR,
  customStatusExpiry,
} from "@streamz/shared";
import type {
  CustomStatusUpdate,
  MemberRole,
  ProfileUpdate,
  PublicUser,
  UserProfile,
  UserStatus,
} from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { toPublicUser } from "../../common/dto";
import { RealtimeService } from "../realtime/realtime.service";
import { StorageService } from "../storage/storage.service";
import { FriendsService } from "../friends/friends.service";
import { contentTypeDaChave, validarImagemDePerfil } from "./imagem-de-perfil";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly storage: StorageService,
    private readonly friends: FriendsService,
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
    return rows.map((u) => toPublicUser(u));
  }

  /**
   * Edita o perfil e avisa todo mundo (nome e avatar aparecem em toda tela).
   *
   * Campo ausente no patch fica como está; campo presente e vazio *limpa* — por
   * isso cada um vira `undefined` (não mexe) ou `null` (apaga), nunca `""`.
   */
  async updateProfile(meId: string, patch: ProfileUpdate): Promise<PublicUser> {
    const displayName = this.texto(patch.displayName, MAX_DISPLAY_NAME, "Nome de exibição");
    const aboutMe = this.texto(patch.aboutMe, MAX_ABOUT_ME, "Sobre mim");
    const pronouns = this.texto(patch.pronouns, MAX_PRONOUNS, "Pronomes");
    const bannerColor =
      patch.bannerColor === undefined ? undefined : patch.bannerColor?.trim() || null;
    if (bannerColor && !HEX_COLOR.test(bannerColor)) {
      throw new BadRequestException("A cor do perfil precisa estar no formato #rrggbb");
    }

    const u = await this.prisma.user.update({
      where: { id: meId },
      data: { displayName, aboutMe, pronouns, bannerColor },
    });
    const dto = toPublicUser(u);
    this.realtime.emitAll(WS_EVENTS.USER_UPDATED, dto);
    return dto;
  }

  /** `undefined` = não mexe; vazio = limpa; acima do teto = 400. */
  private texto(valor: string | null | undefined, teto: number, campo: string) {
    if (valor === undefined) return undefined;
    const t = valor?.trim() || null;
    if (t && t.length > teto) {
      throw new BadRequestException(`${campo} acima de ${teto} caracteres`);
    }
    return t;
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

  /**
   * Avatar: imagem reconhecida pelos bytes, guardada no storage, servida por
   * /users/:id/avatar. GIF entra inteiro e sem passar por nenhum processamento
   * — é o que preserva a animação (ver `imagem-de-perfil.ts`).
   */
  async updateAvatar(
    meId: string,
    file: { buffer: Buffer; size: number },
  ): Promise<PublicUser> {
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException("Armazenamento (R2) não configurado. Ver PENDENCIAS.md.");
    }
    const imagem = validarImagemDePerfil(file?.buffer, {
      maxEstatico: MAX_AVATAR_SIZE,
      rotulo: "Avatar",
    });
    if (!imagem.ok) {
      throw imagem.grande
        ? new PayloadTooLargeException(imagem.motivo)
        : new BadRequestException(imagem.motivo);
    }

    // a extensão fica na chave: é dela que sai o content-type do proxy, e é o
    // que faz um GIF chegar ao browser como GIF (ver `contentTypeDaChave`)
    const key = `avatars/${meId}/${randomUUID()}.${imagem.extensao}`;
    await this.storage.put(key, file.buffer, imagem.mime);

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

  /**
   * Remove a foto (o perfil volta para as iniciais).
   *
   * Ao contrário do banner, isto **avisa todo mundo**: a foto aparece em cada
   * linha de mensagem e na lista de membros, e sem o evento as outras telas
   * seguiriam mostrando um rosto que já não existe até alguém recarregar.
   */
  async removeAvatar(meId: string): Promise<PublicUser> {
    const antes = await this.prisma.user.findUnique({
      where: { id: meId },
      select: { avatarKey: true },
    });
    // a URL zera junto: ela é derivada da chave, e deixá-la apontaria o `<img>`
    // de todo mundo para um proxy que agora responde 404
    const u = await this.prisma.user.update({
      where: { id: meId },
      data: { avatarKey: null, avatarUrl: null },
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
    // o content-type real foi validado no upload e vive na extensão da chave
    return {
      body: await this.storage.get(u.avatarKey),
      contentType: contentTypeDaChave(u.avatarKey),
    };
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

  // ── d-social ────────────────────────────────────────────────

  /**
   * Status personalizado (texto + emoji + prazo). O prazo é calculado pelo
   * contrato (`customStatusExpiry`) para a tela mostrar exatamente o que o
   * servidor vai gravar. Texto e emoji vazios limpam o status.
   */
  async updateCustomStatus(meId: string, patch: CustomStatusUpdate): Promise<PublicUser> {
    const text = patch.text?.trim() || null;
    const emoji = patch.emoji?.trim() || null;
    if (text && text.length > MAX_CUSTOM_STATUS) {
      throw new BadRequestException(`Status acima de ${MAX_CUSTOM_STATUS} caracteres`);
    }
    // sem texto nem emoji não há status — e um prazo sobrando faria a coluna
    // "expirar" um status que já não existe
    const vazio = !text && !emoji;
    const u = await this.prisma.user.update({
      where: { id: meId },
      data: {
        customStatusText: text,
        customStatusEmoji: emoji,
        customStatusExpiresAt: vazio ? null : customStatusExpiry(patch.duration, new Date()),
      },
    });
    const dto = toPublicUser(u);
    this.realtime.emitAll(WS_EVENTS.USER_UPDATED, dto);
    return dto;
  }

  /** Banner do perfil: mesma mecânica do avatar (magic-bytes + storage + proxy), GIF incluído. */
  async updateBanner(meId: string, file: { buffer: Buffer; size: number }): Promise<PublicUser> {
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException("Armazenamento (R2) não configurado. Ver PENDENCIAS.md.");
    }
    const imagem = validarImagemDePerfil(file?.buffer, {
      maxEstatico: MAX_BANNER_SIZE,
      rotulo: "Banner",
    });
    if (!imagem.ok) {
      throw imagem.grande
        ? new PayloadTooLargeException(imagem.motivo)
        : new BadRequestException(imagem.motivo);
    }

    const key = `banners/${meId}/${randomUUID()}.${imagem.extensao}`;
    await this.storage.put(key, file.buffer, imagem.mime);

    const antes = await this.prisma.user.findUnique({
      where: { id: meId },
      select: { bannerKey: true },
    });
    const u = await this.prisma.user.update({ where: { id: meId }, data: { bannerKey: key } });
    if (antes?.bannerKey) await this.storage.delete(antes.bannerKey);

    const dto = toPublicUser(u);
    // o banner não vive no PublicUser (só no perfil), mas o evento mantém as
    // outras abas do próprio usuário em dia com o resto do cartão
    this.realtime.emitAll(WS_EVENTS.USER_UPDATED, dto);
    return dto;
  }

  /** Remove o banner (volta para a cor). */
  async removeBanner(meId: string): Promise<PublicUser> {
    const antes = await this.prisma.user.findUnique({
      where: { id: meId },
      select: { bannerKey: true },
    });
    const u = await this.prisma.user.update({ where: { id: meId }, data: { bannerKey: null } });
    if (antes?.bannerKey) await this.storage.delete(antes.bannerKey);

    const dto = toPublicUser(u);
    // o par de `updateBanner`: sem este aviso, tirar o banner num aparelho
    // deixava o cartão do outro com o banner antigo até recarregar
    this.realtime.emitAll(WS_EVENTS.USER_UPDATED, dto);
    return dto;
  }

  /** Corpo + content-type do banner para o proxy público (como o avatar). */
  async bannerStream(userId: string): Promise<{ body: Readable; contentType: string }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { bannerKey: true },
    });
    if (!u?.bannerKey) throw new NotFoundException("Sem banner");
    return {
      body: await this.storage.get(u.bannerKey),
      contentType: contentTypeDaChave(u.bannerKey),
    };
  }

  /**
   * Perfil completo na visão de quem pede. Os "em comum" e a `relationship`
   * mudam por espectador — é o que separa este endpoint do `PublicUser`.
   *
   * `guildId` é o servidor de onde o cartão foi aberto: serve para mostrar o
   * papel do usuário ali (e, quando o agente C entregar `Permission`, os cargos).
   */
  async profile(meId: string, targetId: string, guildId?: string): Promise<UserProfile> {
    const alvo = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!alvo) throw new NotFoundException("Usuário não encontrado");

    const [relationship, meusAmigos, amigosDele, guildRole] = await Promise.all([
      this.friends.relationship(meId, targetId),
      this.friends.friendIds(meId),
      this.friends.friendIds(targetId),
      this.papelNoServidor(targetId, guildId),
    ]);

    const emComum = meusAmigos.filter((id) => amigosDele.includes(id) && id !== targetId);
    const [mutualFriends, mutualGuilds] = await Promise.all([
      emComum.length > 0
        ? this.prisma.user
            .findMany({ where: { id: { in: emComum } }, orderBy: { username: "asc" } })
            .then((rows) => rows.map((r) => toPublicUser(r)))
        : Promise.resolve([]),
      this.servidoresEmComum(meId, targetId),
    ]);

    return {
      user: toPublicUser(alvo),
      aboutMe: alvo.aboutMe,
      pronouns: alvo.pronouns,
      bannerColor: alvo.bannerColor,
      bannerUrl: alvo.bannerKey ? this.bannerUrl(alvo.id, alvo.bannerKey) : null,
      createdAt: alvo.createdAt.toISOString(),
      // online agora torna "visto por último" ruído: o cartão já diz Online
      lastSeenAt: alvo.status === "OFFLINE" && alvo.lastSeenAt ? alvo.lastSeenAt.toISOString() : null,
      relationship,
      mutualFriends,
      mutualGuilds,
      guildRole,
    };
  }

  /** Papel do usuário no servidor de onde o cartão foi aberto (null fora dele). */
  private async papelNoServidor(userId: string, guildId?: string): Promise<MemberRole | null> {
    if (!guildId) return null;
    const m = await this.prisma.guildMember.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { role: true },
    });
    return m?.role ?? null;
  }

  /** Servidores em que os dois estão — só os que *eu* também vejo. */
  private async servidoresEmComum(meId: string, targetId: string) {
    const guilds = await this.prisma.guild.findMany({
      where: {
        AND: [{ members: { some: { userId: meId } } }, { members: { some: { userId: targetId } } }],
      },
      select: { id: true, name: true, iconUrl: true },
      orderBy: { createdAt: "asc" },
    });
    return guilds;
  }

  /** Igual ao avatar: URL pública versionada pela chave do objeto. */
  private bannerUrl(userId: string, key: string): string {
    const api = (process.env.API_PUBLIC_URL ?? "http://localhost:3333").replace(/\/+$/, "");
    const v = key.split("/").pop() ?? "";
    return `${api}/api/users/${userId}/banner?v=${v}`;
  }
}
