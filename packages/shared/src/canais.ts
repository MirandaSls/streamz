// Canais: categorias, tópico, modo lento e permissões por canal.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── b-canais ─────────────────────────────────────────────────

import { idSchema } from "./internos";

import { z } from "zod";
import type { Channel, ChannelType, PublicUser } from "./dominio";
import { isDirectChannel } from "./midia";
import type { VoiceTokenResponse } from "./voz";

/**
 * Categoria de canais dentro de um servidor. É só agrupamento visual da barra
 * lateral: não autoriza nada e não muda a rota de nenhum canal. Um canal sem
 * categoria (`categoryId` null) fica no topo da lista, como no Discord.
 */
export interface Category {
  id: string;
  guildId: string;
  name: string;
  position: number;
}

export const MAX_CATEGORY_NAME = 64;
/** Teto do tópico do canal (o mesmo do Discord). */
export const MAX_CHANNEL_TOPIC = 1024;
/** Teto do modo lento: 6 horas, como no Discord. */
export const MAX_SLOWMODE_SECONDS = 21600;

/** Presets de modo lento oferecidos na UI (segundos). */
export const SLOWMODE_PRESETS: readonly number[] = [
  0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600,
];

/** Rótulo humano de uma duração de modo lento ("5s", "2min", "6h"). */
export function slowmodeLabel(seconds: number): string {
  if (seconds <= 0) return "Desligado";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * Segundos que ainda faltam para o autor poder mandar outra mensagem.
 *
 * Fica no contrato porque os dois lados precisam do *mesmo* cálculo: a API
 * recusa o envio (429) e o cliente mostra a contagem regressiva. Arredonda para
 * cima para nunca prometer um envio que o servidor ainda recusaria.
 */
export function slowmodeRemaining(
  slowmodeSeconds: number,
  lastMessageAt: Date | string | null,
  now: Date = new Date(),
): number {
  if (slowmodeSeconds <= 0 || !lastMessageAt) return 0;
  const last = typeof lastMessageAt === "string" ? new Date(lastMessageAt) : lastMessageAt;
  const decorrido = (now.getTime() - last.getTime()) / 1000;
  if (!Number.isFinite(decorrido)) return 0;
  return Math.max(0, Math.ceil(slowmodeSeconds - decorrido));
}

/**
 * Resposta de `GET /channels/:channelId/resumo`: o mínimo para desenhar a
 * pílula de `<#id>` de um canal que o cliente não tem carregado — de outro
 * servidor ou uma conversa. No Discord a menção a canal de fora sai com o nome
 * quando você o enxerga e como "sem acesso" quando não.
 *
 * Só sai depois de `assertCanViewChannel` (a mesma porta de ler mensagens):
 * quem não vê o canal recebe 403/404 e não descobre nem o nome. `name` já vem
 * resolvido para conversa sem nome (os participantes, menos quem pede), então
 * o cliente não precisa de outra consulta.
 */
export type ResumoDeCanal = {
  id: string;
  name: string;
  type: ChannelType;
  /** null em conversa direta ou grupo. */
  guildId: string | null;
};

/** Canal onde se lê e escreve texto — inclui o canal de anúncios. */
export function isTextChannel(c: Pick<Channel, "type">): boolean {
  return c.type === "TEXT" || c.type === "ANNOUNCEMENT";
}

/** Um canal na nova ordem: posição dentro da categoria (null = sem categoria). */
export interface ChannelPosition {
  id: string;
  position: number;
  categoryId: string | null;
}

/** Uma categoria na nova ordem. */
export interface CategoryPosition {
  id: string;
  position: number;
}

/** Corpo de `PATCH /guilds/:id/channels/positions` (reordenar em lote). */
export interface ReorderPayload {
  channels?: ChannelPosition[];
  categories?: CategoryPosition[];
}

/** Categoria apagada — os canais dela ficam sem categoria. */
export interface CategoryDeletedEvent {
  categoryId: string;
  guildId: string;
}

/** Resultado de "marcar servidor como lido" (`POST /guilds/:id/read`). */
export interface GuildReadResult {
  guildId: string;
  channelIds: string[];
  lastReadAt: string;
}

/**
 * Evento `channel.read`: eu li estes canais até `lastReadAt`.
 *
 * Vai para a sala `user:<id>` — leitura é por pessoa, ninguém mais precisa
 * saber. É o que faz abrir a conversa no desktop apagar o badge dela no site
 * sem F5, e cobre as três portas de leitura: um canal
 * (`POST /channels/:id/read`), um servidor inteiro (`POST /guilds/:id/read`) e
 * a caixa de entrada (`POST /me/read-all`).
 *
 * `guildId` é o servidor quando a leitura veio dele (o rail zera o badge mesmo
 * sem os canais carregados); `null` quando é conversa direta ou lote misto.
 * Aplicar duas vezes dá o mesmo estado: quem originou a leitura já a aplicou
 * de forma otimista e o eco não desfaz nada.
 */
export interface ChannelReadEvent {
  channelIds: string[];
  lastReadAt: string;
  guildId: string | null;
}

/**
 * Estado de voz de um usuário num canal, do jeito que o gateway transmite:
 * quem está num canal de voz, ao vivo (emitido na sala `guild:<id>`; a barra
 * lateral consome para listar sob o canal).
 *
 * Vale tanto para canal de voz de servidor (`guildId` preenchido) quanto para
 * chamada em conversa direta (`guildId` null) — a "sala" é sempre um canal, na
 * mesma linha da ADR-0001. `connected: false` é a saída: o cliente remove o
 * participante em vez de manter um estado zumbi.
 */
/**
 * Esta conexão foi tirada da voz porque a mesma conta entrou de outro lugar.
 *
 * `channelId` é o canal de onde ela saiu — pode ser o mesmo em que a outra
 * ponta acabou de entrar (dois aparelhos na mesma sala), e é justamente esse
 * caso que a expulsão resolve: o LiveKit não aceita identidade repetida.
 */
export interface VoiceEvictedEvent {
  channelId: string;
  /** Para onde a conta foi. Igual a `channelId` quando é a mesma sala. */
  novoCanalId: string;
}

/**
 * Fui movido de canal de voz por quem tem `MOVE_MEMBERS`.
 *
 * Chega **só** para quem foi movido, e é o gatilho de trocar de sala no
 * LiveKit: o estado de voz no servidor já mudou antes do evento sair. O nome do
 * canal viaja junto para que o cliente consiga reconectar mesmo que a lista de
 * canais dele ainda não tenha o destino (canal recém-criado, por exemplo).
 */
export interface VoiceMovedEvent {
  guildId: string;
  /** canal de destino — para onde o cliente deve se conectar agora. */
  channelId: string;
  channelName: string;
  /** canal de origem, para o cliente ignorar o evento se já saiu de lá. */
  deChannelId: string;
  /** quem moveu (para a mensagem "fulano moveu você"). */
  movedBy: PublicUser;
}

/** Corpo de `POST /guilds/:id/voice/move`. */
export interface VoiceMoveInput {
  userId: string;
  channelId: string;
}

export interface VoiceStateEvent {
  channelId: string;
  guildId: string | null;
  user: PublicUser;
  connected: boolean;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  /**
   * O socket caiu e a carência do servidor está correndo: a pessoa **continua**
   * na chamada (`connected: true`) e some dela só se não voltar a tempo. A UI
   * usa isto para esmaecer o tile em vez de fazer o participante piscar para
   * fora da grade a cada oscilação de rede. Ausente = conectada normalmente.
   */
  reconnecting?: boolean;
}

/** Flags que o próprio usuário controla e transmite (`voice.update`). */
export type VoiceFlags = Pick<VoiceStateEvent, "muted" | "deafened" | "video" | "screen">;

export const VOICE_FLAGS_PADRAO: VoiceFlags = {
  muted: false,
  deafened: false,
  video: false,
  screen: false,
};

/** Tempo que uma chamada em DM toca antes de desistir sozinha. */
export const CALL_RING_TIMEOUT_MS = 30_000;

/**
 * Quanto tempo o servidor segura alguém na sala de voz depois de o socket cair.
 *
 * Queda de socket **não** é sair da chamada: trocar de rede, o navegador
 * estrangular a aba em segundo plano ou o notebook suspender por um instante
 * derrubavam o usuário na hora. Dentro desta janela ele volta e a chamada
 * continua como se nada tivesse acontecido; passada ela, sai de verdade.
 *
 * Fechar a aba também espera a carência — o preço é um participante fantasma
 * por até este tempo, bem menor que o de ser expulso da call ao minimizar.
 */
export const VOICE_RECONNECT_GRACE_MS = 45_000;

/**
 * Quanto tempo alguém pode ficar **sozinho** numa chamada de conversa antes de
 * ela encerrar. Não tem nada a ver com o toque: o toque é "ninguém atendeu", e
 * este é "todo mundo já saiu". Ficar sozinho num canal de voz de servidor é
 * normal e não expira nunca — a regra vale só para conversa direta e grupo.
 */
export const CALL_ALONE_TIMEOUT_MS = 5 * 60_000;

/** Folga entre soltar a tecla de push-to-talk e o microfone fechar de novo. */
export const PTT_RELEASE_MS = 200;

/** Presets de qualidade do compartilhamento de tela (o seletor do botão). */
export type ScreenQuality =
  | "720p30"
  | "720p60"
  | "1080p30"
  | "1080p60"
  | "1440p30"
  | "1440p60";

export interface ScreenQualityPreset {
  label: string;
  width: number;
  height: number;
  frameRate: number;
  /**
   * Teto de bitrate (bits/s) com que a faixa é publicada.
   *
   * Mora no preset porque **resolução sem bitrate não é qualidade**: o padrão
   * do SDK é dimensionado para 1080p e, aplicado a 1440p, entrega mais pixels
   * borrados do que 1080p nítido. Quem publica lê daqui (`videoEncoding`), e é
   * por isso que os dois andam sempre juntos.
   */
  maxBitrate: number;
}

/**
 * Resolução × taxa de quadros, todas as combinações que a UI oferece.
 *
 * Os valores de bitrate são para **tela** (conteúdo estático com texto fino),
 * não para câmera: privilegiam nitidez por quadro. Quem compartilha jogo ou
 * vídeo troca para 60 fps no seletor.
 */
export const SCREEN_QUALITY: Record<ScreenQuality, ScreenQualityPreset> = {
  "720p30": { label: "720p · 30 fps", width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 },
  "720p60": { label: "720p · 60 fps", width: 1280, height: 720, frameRate: 60, maxBitrate: 2_500_000 },
  "1080p30": { label: "1080p · 30 fps", width: 1920, height: 1080, frameRate: 30, maxBitrate: 3_000_000 },
  "1080p60": { label: "1080p · 60 fps", width: 1920, height: 1080, frameRate: 60, maxBitrate: 4_500_000 },
  "1440p30": { label: "1440p · 30 fps", width: 2560, height: 1440, frameRate: 30, maxBitrate: 6_000_000 },
  "1440p60": { label: "1440p · 60 fps", width: 2560, height: 1440, frameRate: 60, maxBitrate: 9_000_000 },
};

/**
 * Resolução padrão do seletor de tela.
 *
 * 1080p30, e não 1440p30: o VP8 é codificado em software, e 1440p são 1,78× os
 * pixels de 1080p por quadro — com a câmera ligada junto, era o que deixava o
 * PC lento. Quem precisa ler texto miúdo sobe para 1440p no seletor (a escolha
 * fica guardada).
 */
export const SCREEN_QUALITY_PADRAO: ScreenQuality = "1080p30";

/** Taxas de quadros que a câmera oferece (o seletor de fps). */
export const CAMERA_FPS_OPCOES = [15, 24, 30, 60] as const;
export type CameraFps = (typeof CAMERA_FPS_OPCOES)[number];
export const CAMERA_FPS_PADRAO: CameraFps = 30;

/** Captura e teto de encoding de uma camada de vídeo da câmera. */
export interface CameraQualityPreset {
  width: number;
  height: number;
  frameRate: number;
  /** teto de bitrate (bits/s) da camada. */
  maxBitrate: number;
}

/**
 * Captura e encoding da câmera por taxa de quadros escolhida.
 *
 * O bitrate acompanha o fps (menos quadros, menos bits pela mesma nitidez).
 * 60 fps pede **720p**: é o que webcam comum entrega a 60 — pedir 1080p60 cai
 * em 1080p30 na maioria delas, ou em MJPEG que o navegador decodifica na CPU.
 */
export const CAMERA_QUALITY: Record<CameraFps, CameraQualityPreset> = {
  15: { width: 1920, height: 1080, frameRate: 15, maxBitrate: 1_700_000 },
  24: { width: 1920, height: 1080, frameRate: 24, maxBitrate: 2_500_000 },
  30: { width: 1920, height: 1080, frameRate: 30, maxBitrate: 3_000_000 },
  60: { width: 1280, height: 720, frameRate: 60, maxBitrate: 2_500_000 },
};

/**
 * A segunda camada do simulcast da câmera (a de miniatura da grade). Só duas
 * camadas — a cheia e esta —, e não as três do SDK: cada camada é mais uma
 * codificação do mesmo quadro na CPU de quem transmite. O fps desta camada
 * nunca passa do escolhido (ver `lib/qualidade-de-camera.ts`).
 */
export const CAMERA_CAMADA_BAIXA: CameraQualityPreset = {
  width: 640,
  height: 360,
  frameRate: 20,
  maxBitrate: 450_000,
};

/**
 * Teto da câmera enquanto a tela está sendo compartilhada (ou o navegador
 * avisa que a CPU não dá conta): as duas codificações ao mesmo tempo eram o
 * que deixava o PC lento. Aplicado só no sender, sem republicar a faixa.
 */
export const CAMERA_ALIVIO = { alturaMaxima: 720, frameRate: 15, maxBitrate: 1_000_000 } as const;

/**
 * Tetos de qualidade de microfone, áudio de tela e câmera.
 *
 * Ficam ao lado de `SCREEN_QUALITY` porque são a mesma decisão de produto —
 * "prezar pela melhor qualidade possível" — e não o default do SDK, que é
 * conservador de propósito (o LiveKit assume sala grande e rede ruim).
 */
export const MEDIA_QUALITY = {
  /**
   * Microfone: 64 kbps mono, o dobro do preset `music` do SDK. Voz em 64 kbps
   * com Opus é transparente; acima disso só se paga banda sem ganho audível.
   */
  micBitrate: 64_000,
  /**
   * Áudio da tela: 160 kbps **estéreo**. Aqui o conteúdo é música, jogo ou
   * vídeo — o oposto do microfone — e a imagem estéreo é parte do que se está
   * compartilhando. Exige captura sem os processadores de voz (ver o seletor).
   */
  screenAudioBitrate: 160_000,
  /**
   * Câmera no fps padrão (1080p30). Acima disso o encoder do navegador vira o
   * gargalo; a escolha de fps de cada um mora em `CAMERA_QUALITY`.
   */
  camera: CAMERA_QUALITY[CAMERA_FPS_PADRAO],
} as const;

/** Quem está numa chamada e o token de mídia, quando o LiveKit está configurado. */
export interface CallStartResponse {
  channelId: string;
  /** null quando o LiveKit não está configurado: a chamada toca, mas não conecta mídia. */
  voice: VoiceTokenResponse | null;
  /** estado de voz de quem já está na sala (inclusive quem acabou de entrar). */
  states: VoiceStateEvent[];
  /** participantes para quem o `call.ring` foi emitido. */
  ringing: PublicUser[];
}

/** Alguém está chamando numa conversa direta. */
export interface CallRingEvent {
  channelId: string;
  from: PublicUser;
}

/** Fim de uma chamada em DM, do ponto de vista de quem recebe o aviso. */
export interface CallEndedEvent {
  channelId: string;
  /** quem encerrou/recusou (null = a chamada expirou sozinha). */
  by: PublicUser | null;
  /** `timeout` = ninguém atendeu; `alone` = sobrou uma pessoa só tempo demais. */
  reason: "declined" | "ended" | "timeout" | "alone";
}

export const voiceJoinSchema = z.object({ channelId: idSchema });
export type VoiceJoinPayload = z.infer<typeof voiceJoinSchema>;

export const voiceUpdateSchema = z.object({
  muted: z.boolean(),
  deafened: z.boolean(),
  video: z.boolean(),
  screen: z.boolean(),
});
export type VoiceUpdatePayload = z.infer<typeof voiceUpdateSchema>;

/** `call.decline` / `call.end`: só o canal da conversa. */
export const callSchema = z.object({ channelId: idSchema });
export type CallPayload = z.infer<typeof callSchema>;

/** true se o canal é uma sala de voz possível (canal de voz ou conversa direta). */
export function isVoiceCapable(c: Pick<Channel, "type">): boolean {
  return c.type === "VOICE" || isDirectChannel(c);
}
