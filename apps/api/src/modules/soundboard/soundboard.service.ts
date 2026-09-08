import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  MAX_SOUNDBOARD_POR_GUILD,
  MAX_SOUNDBOARD_SIZE,
  Permission,
  SOUNDBOARD_INTERVALO_MS,
  WS_EVENTS,
  hasPermission,
  soundboardEmojiSchema,
  soundboardNomeSchema,
  type GuildSoundboard,
  type SoundboardPlayEvent,
  type SoundboardSound,
} from "@streamz/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { GuildsService } from "../guilds/guilds.service";
import { RealtimeService } from "../realtime/realtime.service";
import { StorageService } from "../storage/storage.service";
import { VoiceService } from "../voice/voice.service";
import { redisClient } from "../realtime/redis";
import { toPublicUser } from "../../common/dto";
import { extensaoDeAudio, validarAudio } from "./audio";
import { intervaloRespeitado } from "./intervalo";
import { toSoundDTO } from "./dto";

/** O que o multer entrega ao controller (o mesmo formato do envio de emoji). */
export interface ArquivoDeSom {
  buffer: Buffer;
  size: number;
}

/**
 * Painel de efeitos sonoros: os sons de cada servidor e o disparo deles na
 * chamada.
 *
 * A parte de arquivo é a do emoji, ponto por ponto (bucket, `key` única,
 * permissão `MANAGE_EMOJIS`, evento de lista). A parte nova é o **disparo**, e
 * ela tem uma regra que não existe em nenhum outro lugar do app: o efeito de
 * apertar o botão não é uma escrita, é um som na orelha de outras pessoas. Daí
 * as três guardas de `play`:
 *
 * 1. **quem aperta está na chamada** — não basta enxergar o canal. Sem isso,
 *    qualquer membro do servidor faria barulho numa sala em que não está;
 * 2. **o som é daquele servidor** (ou um dos padrão) — senão o id de um som de
 *    outro servidor viraria um jeito de tocar o que a sala não conhece;
 * 3. **um som por segundo, por pessoa** — ver `intervalo.ts`.
 *
 * E o destino do evento não é a sala do servidor, é **quem está no canal de
 * voz**: quem está lendo um canal de texto ao lado não ouve nada.
 */
@Injectable()
export class SoundboardService {
  /**
   * Último disparo por usuário, quando não há Redis. É estado efêmero como o de
   * voz: um restart soltar o teto de uma pessoa por um segundo não é problema.
   */
  private readonly ultimoLocal = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly guilds: GuildsService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
    private readonly voice: VoiceService,
  ) {}

  /** Sons de um servidor (qualquer membro vê). */
  async listForGuild(userId: string, guildId: string): Promise<SoundboardSound[]> {
    await this.guilds.assertMember(userId, guildId);
    return this.doGuild(guildId);
  }

  /**
   * Sons de todos os servidores do usuário, agrupados — é o que o painel mostra
   * abaixo dos padrão. Numa consulta só, como o seletor de emoji.
   */
  async listForUser(userId: string): Promise<GuildSoundboard[]> {
    const guilds = await this.prisma.guild.findMany({
      where: { members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        iconUrl: true,
        soundboard: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { name: "asc" },
    });
    return guilds.map((g) => ({
      guildId: g.id,
      guildName: g.name,
      guildIconUrl: g.iconUrl,
      sounds: g.soundboard.map(toSoundDTO),
    }));
  }

  async create(
    userId: string,
    guildId: string,
    nome: string,
    emoji: string | undefined,
    file: ArquivoDeSom | undefined,
  ): Promise<SoundboardSound> {
    await this.assertPodeGerenciar(userId, guildId);
    const name = this.validarNome(nome);
    const emojiLimpo = this.validarEmoji(emoji);

    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        "Armazenamento (R2) não configurado — sem ele não dá para guardar o arquivo do som. Ver PENDENCIAS.md.",
      );
    }

    const total = await this.prisma.soundboardSound.count({ where: { guildId } });
    if (total >= MAX_SOUNDBOARD_POR_GUILD) {
      throw new ConflictException(
        `Este servidor já tem ${MAX_SOUNDBOARD_POR_GUILD} sons. Apague um antes de enviar outro.`,
      );
    }

    const audio = validarAudio(file?.buffer ?? Buffer.alloc(0), MAX_SOUNDBOARD_SIZE);
    if (!audio.ok) {
      throw audio.grande
        ? new PayloadTooLargeException(audio.motivo)
        : new BadRequestException(audio.motivo);
    }

    // a chave nasce única (uuid): renomear o som não move o objeto
    const key = `soundboard/${guildId}/${randomUUID()}.${extensaoDeAudio(audio.mime)}`;
    await this.storage.put(key, file!.buffer, audio.mime);

    try {
      const row = await this.prisma.soundboardSound.create({
        data: {
          guildId,
          name,
          emoji: emojiLimpo,
          key,
          contentType: audio.mime,
          size: file!.size,
          createdById: userId,
        },
      });
      await this.anunciar(guildId);
      return toSoundDTO(row);
    } catch (e) {
      // o objeto já subiu; sem a linha ele viraria lixo no bucket
      await this.storage.delete(key);
      throw e;
    }
  }

  async remove(userId: string, guildId: string, id: string): Promise<{ deleted: string }> {
    await this.assertPodeGerenciar(userId, guildId);
    const row = await this.prisma.soundboardSound.findUnique({ where: { id } });
    if (!row || row.guildId !== guildId) throw new NotFoundException("Som não encontrado");
    await this.prisma.soundboardSound.delete({ where: { id } });
    await this.storage.delete(row.key);
    await this.anunciar(guildId);
    return { deleted: id };
  }

  /**
   * Bytes do áudio para a rota pública `GET /soundboard/:id/audio`.
   *
   * Pública pelo mesmo motivo da imagem do emoji (ver `dto.ts`): quem aperta o
   * som faz a sala inteira baixá-lo, e parte da sala pode não ser do servidor
   * de origem.
   */
  async audioStream(id: string): Promise<{ body: Readable; contentType: string }> {
    const row = await this.prisma.soundboardSound.findUnique({
      where: { id },
      select: { key: true, contentType: true },
    });
    if (!row) throw new NotFoundException("Som não encontrado");
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException("Armazenamento (R2) não configurado.");
    }
    return { body: await this.storage.get(row.key), contentType: row.contentType };
  }

  /**
   * Toca um som para quem está no canal de voz.
   *
   * Devolve o evento emitido (o cliente que apertou usa a resposta para saber
   * que deu certo; o som em si ele ouve pelo evento, como todo mundo).
   */
  async play(userId: string, channelId: string, soundId: string): Promise<SoundboardPlayEvent> {
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    const { channel } = access;
    if (channel.type === "TEXT") {
      throw new BadRequestException("Este canal não tem voz");
    }
    // c-cargos: quem não pode falar no canal também não faz barulho nele. É a
    // mesma regra do microfone — um som do painel é fala por outro meio, e sem
    // isto o silenciado teria no botão um caminho para ser ouvido assim mesmo.
    if (!hasPermission(access.permissions, Permission.SPEAK)) {
      throw new ForbiddenException("Você não pode falar neste canal");
    }

    const naSala = await this.voice.membrosDaSala(channelId);
    if (!naSala.includes(userId)) {
      throw new ForbiddenException("Você precisa estar na chamada para tocar um som");
    }

    const sound = await this.resolverSom(soundId, channel.guildId);
    if (!(await this.podeTocarAgora(userId))) {
      // 429 e não 400: o pedido está certo, só chegou cedo demais — é o que
      // deixa o cliente distinguir "espere" de "não pode" (ver `PainelDeSons`)
      throw new HttpException(
        "Espere um segundo antes de tocar outro som",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuário não encontrado");

    const evento: SoundboardPlayEvent = {
      channelId,
      guildId: channel.guildId,
      sound,
      user: toPublicUser(user),
    };
    // **quem está na chamada**, e não a sala do servidor: o som é da call
    this.realtime.emitToUsers(naSala, WS_EVENTS.SOUNDBOARD_PLAY, evento);
    return evento;
  }

  /**
   * O som que aquele id representa naquele canal.
   *
   * Todo som é de um servidor e só vale no canal daquele servidor — não existe
   * mais som de fábrica. Numa conversa direta não há servidor a que pertencer,
   * então não há o que tocar.
   */
  private async resolverSom(soundId: string, guildId: string | null): Promise<SoundboardSound> {
    if (!guildId) {
      throw new BadRequestException("Só dá para tocar um som num canal de voz de servidor");
    }
    const row = await this.prisma.soundboardSound.findUnique({ where: { id: soundId } });
    if (!row || row.guildId !== guildId) {
      throw new NotFoundException("Este som não é deste servidor");
    }
    return toSoundDTO(row);
  }

  /**
   * O teto de um som por segundo. Com `REDIS_URL` o contador é compartilhado
   * entre instâncias (um `SET NX PX` resolve tudo numa viagem); sem ele, cai no
   * mapa em memória — que é o mesmo desenho do estado de voz.
   */
  private async podeTocarAgora(userId: string): Promise<boolean> {
    const redis = redisClient();
    if (redis) {
      const ok = await redis.set(
        `soundboard:${userId}`,
        "1",
        "PX",
        SOUNDBOARD_INTERVALO_MS,
        "NX",
      );
      return ok === "OK";
    }
    const agora = Date.now();
    if (!intervaloRespeitado(this.ultimoLocal.get(userId), agora, SOUNDBOARD_INTERVALO_MS)) {
      return false;
    }
    this.ultimoLocal.set(userId, agora);
    // o mapa não pode crescer para sempre: quem não toca há uma janela sai
    if (this.ultimoLocal.size > 1000) {
      for (const [id, quando] of this.ultimoLocal) {
        if (agora - quando > SOUNDBOARD_INTERVALO_MS) this.ultimoLocal.delete(id);
      }
    }
    return true;
  }

  /** Lista crua de um servidor, sem checar associação (uso interno). */
  private async doGuild(guildId: string): Promise<SoundboardSound[]> {
    const rows = await this.prisma.soundboardSound.findMany({
      where: { guildId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toSoundDTO);
  }

  /** Quem pode mexer nos sons: a mesma permissão das expressões (`MANAGE_EMOJIS`). */
  private async assertPodeGerenciar(userId: string, guildId: string) {
    return this.guilds.assertCanModerate(userId, guildId, Permission.MANAGE_EMOJIS);
  }

  private validarNome(nome: string): string {
    const parsed = soundboardNomeSchema.safeParse(nome ?? "");
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Nome inválido");
    }
    return parsed.data;
  }

  private validarEmoji(emoji: string | undefined): string {
    const parsed = soundboardEmojiSchema.safeParse(emoji ?? "");
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Emoji inválido");
    }
    return parsed.data;
  }

  /** A lista mudou: quem está no servidor atualiza o painel na hora. */
  private async anunciar(guildId: string) {
    this.realtime.emitToGuild(guildId, WS_EVENTS.SOUNDBOARD_UPDATED, {
      guildId,
      sounds: await this.doGuild(guildId),
    });
  }
}
