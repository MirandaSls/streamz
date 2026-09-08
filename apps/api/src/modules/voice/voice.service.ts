import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import {
  Permission,
  hasPermission,
  VOICE_FLAGS_PADRAO,
  WS_EVENTS,
  identidadeDeTela,
  type VoiceFlags,
  type VoiceMovedEvent,
  type VoiceStateEvent,
  type VoiceTokenResponse,
} from "@streamz/shared";
import { GuildsService } from "../guilds/guilds.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { redisClient } from "../realtime/redis";
import { toPublicUser } from "../../common/dto";
import {
  MemoryVoiceStateStore,
  RedisVoiceStateStore,
  type VoiceMember,
  type VoiceStateStore,
} from "./voice-state.store";

// ── j-bots ── a ponte de voz (F2) ────────────────────────────
//
// Estas constantes e as duas funções abaixo são a metade da API do contrato da
// F2 (`apps/ponte-voz/CONTRATO-F2.md` §3). Os **nomes dos campos do JWT são
// contrato com a ponte em Go** (`Reivindicacao`, em `sessao.go`) e não mudam de
// um lado só.

/**
 * Validade do JWT da ponte: **15 minutos**, e não os 60 s do documento.
 *
 * O `@discordjs/voice` **reusa o mesmo token** ao reconectar o WS de voz (close
 * 4015, queda de rede, reinício da ponte) sem pedir um `VOICE_SERVER_UPDATE`
 * novo. Com 60 s, a primeira reconexão depois de um minuto de música morre com
 * 4004 e o bot desiste. Divergência registrada no §3 do CONTRATO-F2.
 */
export const VALIDADE_DO_TOKEN_DA_PONTE_S = 15 * 60;

/**
 * TTL do token do **LiveKit** que viaja dentro do JWT da ponte: 6 h, e não a
 * 1 h do `assinarToken` de hoje. O TTL do LiveKit vale na **entrada** na sala, e
 * uma reconexão duas horas depois do `/play` precisa entrar de novo.
 */
export const TTL_DO_LIVEKIT_DA_PONTE = "6h";

/** `endpoint` do `VOICE_SERVER_UPDATE` quando `PONTE_VOZ_ENDPOINT` não vier. */
export const ENDPOINT_PADRAO_DA_PONTE = "voz.streamz.chat";

/** O corpo do JWT da ponte, campo por campo (§3 do CONTRATO-F2). */
export interface ReivindicacaoDaPonte {
  iss: "streamz-api";
  aud: "ponte-voz";
  /** snowflake do BOT → `IDENTIFY.user_id` do gateway de voz. */
  sub: string;
  /** snowflake da GUILD → `IDENTIFY.server_id`. */
  gid: string;
  /** `session_id` do gateway compat → `IDENTIFY.session_id`. */
  sid: string;
  /** sala do LiveKit (`VoiceService.salaDe`). */
  sala: string;
  /** snowflake do canal de voz. */
  canal: string;
  /** nome do participante no LiveKit. */
  nome: string;
  /** identidade no LiveKit (§D5.6). */
  ident: string;
  /** token do LiveKit, já assinado pela API. */
  lk: string;
  lkUrl: string;
  iat: number;
  exp: number;
}

/**
 * Assina um JWT HS256 com `node:crypto`.
 *
 * Dez linhas em vez de uma dependência: `jsonwebtoken` não está no
 * `package.json` da API (só transitivamente, sob o `@nestjs/jwt`, e depender de
 * dependência transitiva quebra no pnpm), e o que a ponte verifica com
 * `golang-jwt/jwt/v5` é exatamente isto — base64url **sem padding** nas três
 * partes, que é o que o `"base64url"` do Node produz.
 */
export function assinarHs256(reivindicacao: Record<string, unknown>, segredo: string): string {
  const cabecalho = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const corpo = Buffer.from(JSON.stringify(reivindicacao)).toString("base64url");
  const conteudo = `${cabecalho}.${corpo}`;
  const assinatura = createHmac("sha256", segredo).update(conteudo).digest().toString("base64url");
  return `${conteudo}.${assinatura}`;
}

/**
 * O `endpoint` do `VOICE_SERVER_UPDATE`: **sem esquema e sem porta**.
 *
 * As libs montam `wss://<endpoint>/?v=8` sozinhas, e o §D5.8 (risco 3) avisa que
 * algumas cortam `:80`/`:443` do que recebem. Aceitamos o valor configurado com
 * esquema ou com porta e limpamos aqui, em vez de confiar no `.env`.
 */
export function endpointDaPonte(env: NodeJS.ProcessEnv = process.env): string {
  const bruto = env.PONTE_VOZ_ENDPOINT?.trim();
  if (!bruto) return ENDPOINT_PADRAO_DA_PONTE;
  const semEsquema = bruto.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
  return semEsquema.replace(/:\d+$/, "") || ENDPOINT_PADRAO_DA_PONTE;
}

/**
 * Voz: token do LiveKit e o **estado de quem está em cada sala**.
 *
 * As duas coisas são independentes de propósito. O estado de voz (quem entrou,
 * quem está mudo) é do Streamz e funciona sem servidor de mídia nenhum — é o
 * que a barra lateral mostra. O token é só a credencial para o LiveKit
 * transportar áudio/vídeo; sem as credenciais a rota responde 503 e o resto
 * continua de pé (ver PENDENCIAS.md).
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  /** Estado efêmero: em memória por padrão, no Redis quando há várias instâncias. */
  private readonly store: VoiceStateStore = (() => {
    const redis = redisClient();
    return redis ? new RedisVoiceStateStore(redis) : new MemoryVoiceStateStore();
  })();

  constructor(
    private readonly guilds: GuildsService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * true só com as três variáveis do LiveKit presentes. Espelha o
   * `StorageService.isConfigured()`: voz é opcional no dev, e sem credencial a
   * rota responde 503 em vez de assinar um token com `undefined`.
   */
  isConfigured(): boolean {
    return Boolean(
      process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET &&
        process.env.LIVEKIT_URL,
    );
  }

  /**
   * Gera um token de acesso do LiveKit para um usuário entrar na sala
   * correspondente a um canal de voz.
   */
  async createToken(
    channelId: string,
    userId: string,
    username: string,
  ): Promise<VoiceTokenResponse> {
    // só quem pode ver o canal (membro; se privado, na allowlist) recebe token
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    const { channel } = access;
    if (channel.type !== "VOICE") {
      throw new BadRequestException("Este canal não é de voz");
    }
    // c-cargos: ver o canal de voz não é poder entrar nele
    this.assertPodeConectar(access.permissions);
    return this.assinarToken(
      this.salaDe(channel.type, channelId),
      userId,
      username,
      access.permissions,
    );
  }

  /**
   * Token do **participante de tela** (`<userId>#tela`) para o app de desktop.
   *
   * No desktop a captura de tela é nativa (Rust) e publica na sala por uma
   * segunda conexão LiveKit, separada da do webview. Esse participante só
   * publica: `canSubscribe: false` (não baixa o áudio de ninguém — a pessoa já
   * está ouvindo pela conexão principal) e `canPublishData: false` (não é um
   * cliente, não manda mensagem). A metadata `telaDe` é o dono, para qualquer
   * consumidor que não queira depender do sufixo do nome.
   *
   * Serve canal de voz e conversa direta: a checagem de acesso é a mesma da
   * chamada (só quem vê o canal), e a sala é a que `salaDe` já calcula. Canal
   * de texto é recusado como em `join`.
   */
  async createScreenToken(
    channelId: string,
    userId: string,
    username: string,
  ): Promise<VoiceTokenResponse> {
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    const { channel } = access;
    if (channel.type === "TEXT") {
      throw new BadRequestException("Este canal não tem voz");
    }
    // c-cargos: a segunda conexão só existe para publicar tela — sem STREAM ela
    // não deve nem ser assinada. A conexão principal continua ouvindo.
    if (!hasPermission(access.permissions, Permission.STREAM)) {
      throw new ForbiddenException("Você não pode compartilhar a tela neste canal");
    }
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "Voz (LiveKit) não configurada. Ver PENDENCIAS.md.",
      );
    }
    const room = this.salaDe(channel.type, channelId);
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: identidadeDeTela(userId),
      // o mesmo nome do dono: um cliente que não conheça o sufixo ainda
      // mostra "tela de fulano" com o nome certo
      name: username,
      metadata: JSON.stringify({ telaDe: userId }),
      ttl: "1h",
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: false,
      canPublishData: false,
    });
    return { token: await at.toJwt(), url: process.env.LIVEKIT_URL!, room };
  }

  /** Nome da sala no LiveKit: prefixo `voice:` num canal de servidor, `dm:` numa conversa. */
  salaDe(tipo: string, channelId: string): string {
    return tipo === "VOICE" ? `voice:${channelId}` : `dm:${channelId}`;
  }

  /**
   * Assina o token da sala. Devolve `null` — em vez de 503 — quando o LiveKit
   * não está configurado e o chamador consegue seguir sem mídia: é o caso da
   * chamada em DM, que continua tocando e registrando participantes.
   */
  async tokenOpcional(
    room: string,
    userId: string,
    username: string,
  ): Promise<VoiceTokenResponse | null> {
    if (!this.isConfigured()) return null;
    return this.assinarToken(room, userId, username);
  }

  /**
   * Assina o token do LiveKit **com o que a pessoa pode publicar**.
   *
   * É aqui que `SPEAK` e `STREAM` viram regra de verdade. Uma checagem só na
   * hora do `join` seria decorativa: quem falasse com o cliente na mão pediria
   * o token e publicaria assim mesmo. O `canPublishSources` do LiveKit é o que
   * o servidor de mídia obedece, e ele é derivado da permissão efetiva do canal.
   *
   * `permissions` ausente = conversa direta ou grupo (`DM_PERMISSIONS` já traz
   * SPEAK e STREAM): quem participa fala e mostra a tela, como sempre foi.
   */
  private async assinarToken(
    room: string,
    userId: string,
    username: string,
    permissions?: number,
  ): Promise<VoiceTokenResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "Voz (LiveKit) não configurada. Ver PENDENCIAS.md.",
      );
    }
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: userId,
      name: username,
      ttl: "1h",
    });
    const podeFalar = permissions === undefined || hasPermission(permissions, Permission.SPEAK);
    const podeVideo = permissions === undefined || hasPermission(permissions, Permission.STREAM);
    const fontes: TrackSource[] = [
      ...(podeFalar ? [TrackSource.MICROPHONE] : []),
      ...(podeVideo
        ? [TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
        : []),
    ];
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: fontes.length > 0,
      canPublishSources: fontes,
      canSubscribe: true,
    });
    return { token: await at.toJwt(), url: process.env.LIVEKIT_URL!, room };
  }

  // ── j-bots ── o token da ponte de voz (F2) ─────────────────

  /**
   * O JWT que vai no `VOICE_SERVER_UPDATE.token` (§3 do CONTRATO-F2).
   *
   * Dentro dele viaja o token do **LiveKit**, já assinado por nós — é assim que
   * a ponte entra na sala sem nunca ver `LIVEKIT_API_KEY`/`SECRET` (§D5.6). Os
   * grants são os do documento: `roomJoin`, `canPublish: true`,
   * `canSubscribe: false` (bot de música não escuta) e `canPublishData: false`.
   *
   * Devolve o **tamanho** junto porque o §D5.8 lista "o `token` passar de 1 KB"
   * como o risco nº 1 do Lavalink; medido e logado a cada assinatura, não
   * estimado. A saída documentada, se algum cliente truncar, é o ticket opaco de
   * 32 bytes — primeiro item de dívida da fase, não implementado aqui.
   */
  async assinarTokenDaPonte(dados: {
    /** snowflake do usuário-bot, string decimal. */
    botSnowflake: string;
    guildSnowflake: string;
    /** `session_id` da sessão do gateway compat. */
    sessionId: string;
    /** cuid do canal de voz — é dele que sai a sala do LiveKit. */
    canalId: string;
    canalSnowflake: string;
    /** nome do participante no LiveKit (o nome da aplicação). */
    nome: string;
  }): Promise<{ token: string; tamanho: number; endpoint: string }> {
    const segredo = process.env.PONTE_VOZ_SEGREDO?.trim();
    if (!segredo) {
      throw new ServiceUnavailableException(
        "PONTE_VOZ_SEGREDO não configurado: a ponte de voz dos bots está desligada",
      );
    }
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Voz (LiveKit) não configurada. Ver PENDENCIAS.md.");
    }

    const sala = this.salaDe("VOICE", dados.canalId);
    const identidade = `bot:${dados.botSnowflake}`;

    const lk = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: identidade,
      name: dados.nome,
      ttl: TTL_DO_LIVEKIT_DA_PONTE,
    });
    lk.addGrant({
      room: sala,
      roomJoin: true,
      canPublish: true,
      // Bot de música não escuta ninguém: sem isto ele baixaria o áudio da call
      // inteira à toa, e um bot com `canSubscribe` é um gravador silencioso.
      canSubscribe: false,
      canPublishData: false,
    });

    const agora = Math.floor(Date.now() / 1000);
    const reivindicacao: ReivindicacaoDaPonte = {
      iss: "streamz-api",
      aud: "ponte-voz",
      sub: dados.botSnowflake,
      gid: dados.guildSnowflake,
      sid: dados.sessionId,
      sala,
      canal: dados.canalSnowflake,
      nome: dados.nome,
      ident: identidade,
      lk: await lk.toJwt(),
      lkUrl: process.env.LIVEKIT_URL!,
      iat: agora,
      exp: agora + VALIDADE_DO_TOKEN_DA_PONTE_S,
    };

    const token = assinarHs256(reivindicacao as unknown as Record<string, unknown>, segredo);
    const endpoint = endpointDaPonte();
    // O número que o PR da F2 reporta. `warn` acima de 1 KB porque é exatamente
    // o limite que o §D5.8 aponta como risco nº 1.
    const medida = `JWT da ponte para bot:${dados.botSnowflake} — ${token.length} bytes (LiveKit: ${reivindicacao.lk.length})`;
    if (token.length > 1024) this.logger.warn(`${medida} — acima de 1 KB (§D5.8, risco 1)`);
    else this.logger.log(medida);

    return { token, tamanho: token.length, endpoint };
  }

  /** `CONNECT` — ver o canal de voz na coluna não é poder entrar nele. */
  private assertPodeConectar(permissions: number): void {
    if (!hasPermission(permissions, Permission.CONNECT)) {
      throw new ForbiddenException("Você não pode entrar neste canal de voz");
    }
  }

  // ── estado de voz ──────────────────────────────────────────

  /**
   * Entra numa sala de voz. Passa pelo assert de canal (não existe entrar em
   * canal que você não enxerga) e recusa canal de texto — sala de voz é canal
   * de voz ou conversa direta.
   */
  async join(userId: string, channelId: string, flags: VoiceFlags = VOICE_FLAGS_PADRAO) {
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    const { channel } = access;
    if (channel.type === "TEXT") {
      throw new BadRequestException("Este canal não tem voz");
    }
    // c-cargos: `CONNECT` para entrar, e as flags de entrada já respeitam
    // `SPEAK`/`STREAM` — entrar mudo num canal onde não se fala é o que o
    // Discord faz, em vez de recusar a entrada inteira
    this.assertPodeConectar(access.permissions);
    const flagsPermitidas = this.flagsPermitidas(flags, access.permissions);
    // uma conexão de voz por usuário: sair da anterior evita estado zumbi em
    // duas salas quando o cliente entra num canal sem sair do outro
    await this.leaveAllExcept(userId, channelId);
    await this.store.join(channelId, userId, flagsPermitidas);
    await this.broadcast(channelId, channel.guildId, userId, flagsPermitidas, true);
    return channel;
  }

  /**
   * As flags que a pessoa pode mesmo ligar naquele canal.
   *
   * Sem `SPEAK` ela entra muda e não desmuta; sem `STREAM` a câmera e a tela
   * ficam desligadas. O `deafened` é escolha dela e não depende de permissão.
   * O LiveKit já recusaria a publicação (o token não a autoriza), mas o estado
   * de voz é do Streamz: sem isto a coluna mostraria "com câmera" para alguém
   * que não está publicando nada.
   */
  private flagsPermitidas(flags: VoiceFlags, permissions: number): VoiceFlags {
    const podeFalar = hasPermission(permissions, Permission.SPEAK);
    const podeVideo = hasPermission(permissions, Permission.STREAM);
    return {
      ...flags,
      muted: podeFalar ? flags.muted : true,
      video: podeVideo ? flags.video : false,
      screen: podeVideo ? flags.screen : false,
    };
  }

  /**
   * Move alguém de um canal de voz para outro **do mesmo servidor**.
   *
   * É a versão servidor do arrasto da barra lateral. Quatro coisas têm de valer
   * antes de mexer no estado, e cada uma já foi um jeito de burlar:
   *
   * 1. quem move precisa de `MOVE_MEMBERS` no servidor (o dono tem tudo);
   * 2. o destino é canal de voz **daquele** servidor — sem isso dava para jogar
   *    alguém na chamada de uma conversa direta de que ele nem participa;
   * 3. o alvo tem de estar em voz **neste** servidor agora: mover quem está
   *    offline seria arrastá-lo para dentro de uma chamada sem ele saber;
   * 4. o alvo tem de **enxergar** o destino — quem move não empurra ninguém
   *    para dentro de um canal privado. Quem garante isso é o `join`, que passa
   *    pelo `assertCanViewChannel` do próprio movido.
   *
   * O caminho de estado é o mesmo do join normal (`join` já tira da sala
   * anterior e emite os dois `voice.state`); o `voice.moved` por cima é só para
   * o cliente movido, que precisa trocar de sala no LiveKit.
   */
  async move(actorId: string, guildId: string, userId: string, channelId: string) {
    await this.guilds.assertCanModerate(actorId, guildId, Permission.MOVE_MEMBERS);

    const destino = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, guildId: true, type: true, name: true },
    });
    if (!destino || destino.guildId !== guildId || destino.type !== "VOICE") {
      throw new BadRequestException("O canal de destino não é um canal de voz deste servidor");
    }

    const origem = await this.canalDeVozNoServidor(userId, guildId);
    if (!origem) {
      throw new BadRequestException("Esta pessoa não está em nenhum canal de voz do servidor");
    }
    if (origem.channelId === channelId) {
      throw new BadRequestException("Esta pessoa já está neste canal");
    }

    // as flags viajam com a pessoa: quem estava mudo continua mudo do outro lado
    await this.join(userId, channelId, {
      muted: origem.membro.muted,
      deafened: origem.membro.deafened,
      // câmera e tela não sobrevivem à troca de sala: as faixas ficaram na
      // sala antiga do LiveKit, e o cliente republica se quiser
      video: false,
      screen: false,
    });

    const ator = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (ator) {
      const evento: VoiceMovedEvent = {
        guildId,
        channelId,
        channelName: destino.name ?? "voz",
        deChannelId: origem.channelId,
        movedBy: toPublicUser(ator),
      };
      this.realtime.emitToUser(userId, WS_EVENTS.VOICE_MOVED, evento);
    }
    return { moved: userId, from: origem.channelId, to: channelId };
  }

  /** Em qual canal de voz **deste servidor** o usuário está agora (ou null). */
  private async canalDeVozNoServidor(userId: string, guildId: string) {
    const canais = await this.prisma.channel.findMany({
      where: { guildId, type: "VOICE" },
      select: { id: true },
    });
    const mapa = await this.store.membersOf(canais.map((c) => c.id));
    for (const [channelId, membros] of mapa) {
      const membro = membros.find((m) => m.userId === userId);
      if (membro) return { channelId, membro };
    }
    return null;
  }

  /** Atualiza mudo/surdo/vídeo/tela. Devolve null se o usuário não estava na sala. */
  async update(userId: string, channelId: string, flags: VoiceFlags) {
    // c-cargos: desmutar sem SPEAK, ou ligar câmera/tela sem STREAM, não passa.
    // Vale o mesmo caminho do join — quem entrou com permissão e a perdeu no
    // meio (cargo removido) é corrigido no primeiro update que mandar.
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    const permitidas = this.flagsPermitidas(flags, access.permissions);
    const membro = await this.store.update(channelId, userId, permitidas);
    if (!membro) return null;
    const channel = await this.canal(channelId);
    await this.broadcast(channelId, channel?.guildId ?? null, userId, permitidas, true);
    return membro;
  }

  /** Sai da sala. Devolve o canal quando havia mesmo o que sair. */
  async leave(userId: string, channelId: string) {
    const saiu = await this.store.leave(channelId, userId);
    if (!saiu) return null;
    const channel = await this.canal(channelId);
    await this.broadcast(channelId, channel?.guildId ?? null, userId, VOICE_FLAGS_PADRAO, false);
    return channel;
  }

  /**
   * Marca (ou desmarca) o membro como "reconectando" e avisa a sala.
   *
   * Não mexe na lista de propósito: durante a carência a pessoa **continua** na
   * chamada, e quem está do outro lado precisa ver "reconectando" em vez de ver
   * o participante sumir e voltar a cada oscilação de rede.
   */
  async marcarReconectando(userId: string, channelId: string, reconnecting: boolean) {
    const membro = await this.store.marcarReconectando(channelId, userId, reconnecting);
    if (!membro) return null;
    const channel = await this.canal(channelId);
    await this.broadcast(
      channelId,
      channel?.guildId ?? null,
      userId,
      { muted: membro.muted, deafened: membro.deafened, video: membro.video, screen: membro.screen },
      true,
      reconnecting,
    );
    return membro;
  }

  /** Canais em que o usuário aparece como conectado (para limpar no disconnect). */
  async channelsOf(userId: string): Promise<string[]> {
    const canais = await this.canaisDeVozDoUsuario(userId);
    const mapa = await this.store.membersOf(canais);
    return Array.from(mapa.entries())
      .filter(([, membros]) => membros.some((m) => m.userId === userId))
      .map(([channelId]) => channelId);
  }

  /** Quantos estão numa sala — o "ainda tem alguém na chamada?" do fim de chamada. */
  async count(channelId: string): Promise<number> {
    return (await this.store.members(channelId)).length;
  }

  /** Quem está na sala agora. É o `count` para quem precisa saber *quem* sobrou. */
  async membrosDaSala(channelId: string): Promise<string[]> {
    return (await this.store.members(channelId)).map((m) => m.userId);
  }

  /**
   * **Toda** chamada aberta na instância, por canal. Só o painel do
   * administrador usa: o resto do app sempre parte de um canal ou servidor
   * concreto, e varrer o estado inteiro seria trabalho jogado fora.
   */
  async salasAbertas(): Promise<Map<string, VoiceMember[]>> {
    return this.store.membersOf(await this.store.salasAbertas());
  }

  /** Estado inicial de um servidor: quem está em cada canal de voz dele. */
  async statesForGuild(userId: string, guildId: string): Promise<VoiceStateEvent[]> {
    await this.guilds.assertMember(userId, guildId);
    const canais = await this.prisma.channel.findMany({
      where: { guildId, type: "VOICE" },
      select: { id: true },
    });
    return this.statesOf(
      canais.map((c) => c.id),
      guildId,
    );
  }

  /** Estado de uma sala só (usado ao abrir uma chamada em DM). */
  async statesForChannel(channelId: string, guildId: string | null): Promise<VoiceStateEvent[]> {
    return this.statesOf([channelId], guildId);
  }

  /**
   * Estado da chamada de uma conversa direta, para quem chega depois — ou
   * recarrega a página no meio dela.
   *
   * O estado de servidor tem carga inicial (`statesForGuild`); o de conversa
   * só chegava por `startCall` ou por `voice.state`. Depois de um F5 a store
   * do cliente nascia vazia e ele não sabia que a própria chamada continuava
   * de pé na carência do gateway: sem faixa, sem palco, sem como voltar a não
   * ser ligando de novo. Mesmo guard das outras rotas de conversa: só
   * participante lê, e canal de servidor não entra por aqui.
   */
  async statesForDM(userId: string, channelId: string): Promise<VoiceStateEvent[]> {
    const access = await this.guilds.assertCanViewChannel(userId, channelId);
    if (access.tipo !== "dm") {
      throw new BadRequestException("Estado de chamada é de conversa direta — use o do servidor");
    }
    return this.statesOf([channelId], null);
  }

  private async statesOf(channelIds: string[], guildId: string | null): Promise<VoiceStateEvent[]> {
    const mapa = await this.store.membersOf(channelIds);
    const userIds = Array.from(
      new Set(Array.from(mapa.values()).flatMap((membros) => membros.map((m) => m.userId))),
    );
    if (userIds.length === 0) return [];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
    const porId = new Map(users.map((u) => [u.id, toPublicUser(u)]));
    const out: VoiceStateEvent[] = [];
    for (const [channelId, membros] of mapa) {
      for (const m of membros) {
        const user = porId.get(m.userId);
        if (!user) continue; // usuário apagado no meio: some da sala
        out.push({
          channelId,
          guildId,
          user,
          connected: true,
          muted: m.muted,
          deafened: m.deafened,
          video: m.video,
          screen: m.screen,
          reconnecting: m.reconnecting ?? false,
        });
      }
    }
    return out;
  }

  /**
   * Difunde `voice.state`. Em canal de servidor vai para a sala do servidor
   * (todo membro vê quem está na voz pela barra lateral); em conversa direta,
   * só para os participantes — não há sala de servidor a que recorrer.
   */
  private async broadcast(
    channelId: string,
    guildId: string | null,
    userId: string,
    flags: VoiceFlags,
    connected: boolean,
    reconnecting = false,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const evento: VoiceStateEvent = {
      channelId,
      guildId,
      user: toPublicUser(user),
      connected,
      ...flags,
      reconnecting,
    };
    if (guildId) {
      this.realtime.emitToGuild(guildId, WS_EVENTS.VOICE_STATE, evento);
      return;
    }
    this.realtime.emitToUsers(await this.participantes(channelId), WS_EVENTS.VOICE_STATE, evento);
  }

  /** Participantes de uma conversa direta (destinatários dos eventos de chamada). */
  async participantes(channelId: string): Promise<string[]> {
    const membros = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });
    return membros.map((m) => m.userId);
  }

  private async canal(channelId: string) {
    return this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, guildId: true, type: true },
    });
  }

  /** Todo canal em que o usuário poderia estar em voz: de voz nos servidores + conversas. */
  private async canaisDeVozDoUsuario(userId: string): Promise<string[]> {
    const canais = await this.prisma.channel.findMany({
      where: {
        OR: [
          { type: "VOICE", guild: { members: { some: { userId } } } },
          { guildId: null, members: { some: { userId } } },
        ],
      },
      select: { id: true },
    });
    return canais.map((c) => c.id);
  }

  private async leaveAllExcept(userId: string, manter: string) {
    for (const channelId of await this.channelsOf(userId)) {
      if (channelId !== manter) await this.leave(userId, channelId);
    }
  }
}
