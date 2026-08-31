// Canais: categorias, tópico, modo lento e permissões por canal.
//
// Parte do contrato de `@streamz/shared`. Importe sempre pelo pacote
// (`@streamz/shared`), nunca por este caminho: o índice é a fronteira.

// ── b-canais ─────────────────────────────────────────────────

import { idSchema } from "./internos";

import { z } from "zod";
import type { Channel, PublicUser } from "./dominio";
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
 * Estado de voz de um usuário num canal, do jeito que o gateway transmite:
 * quem está num canal de voz, ao vivo (emitido na sala `guild:<id>`; a barra
 * lateral consome para listar sob o canal).
 *
 * Vale tanto para canal de voz de servidor (`guildId` preenchido) quanto para
 * chamada em conversa direta (`guildId` null) — a "sala" é sempre um canal, na
 * mesma linha da ADR-0001. `connected: false` é a saída: o cliente remove o
 * participante em vez de manter um estado zumbi.
 */
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
 * não para câmera: privilegiam nitidez por quadro. 1440p30 é o padrão porque
 * ler código na tela de alguém depende de resolução, não de fluidez — quem
 * compartilha jogo ou vídeo troca para 1080p60 no seletor.
 */
export const SCREEN_QUALITY: Record<ScreenQuality, ScreenQualityPreset> = {
  "720p30": { label: "720p · 30 fps", width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 },
  "720p60": { label: "720p · 60 fps", width: 1280, height: 720, frameRate: 60, maxBitrate: 2_500_000 },
  "1080p30": { label: "1080p · 30 fps", width: 1920, height: 1080, frameRate: 30, maxBitrate: 3_000_000 },
  "1080p60": { label: "1080p · 60 fps", width: 1920, height: 1080, frameRate: 60, maxBitrate: 4_500_000 },
  "1440p30": { label: "1440p · 30 fps", width: 2560, height: 1440, frameRate: 30, maxBitrate: 6_000_000 },
  "1440p60": { label: "1440p · 60 fps", width: 2560, height: 1440, frameRate: 60, maxBitrate: 9_000_000 },
};

/** Resolução padrão do seletor de tela. */
export const SCREEN_QUALITY_PADRAO: ScreenQuality = "1440p30";

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
  /** Câmera: 1080p30. Acima disso o encoder do navegador vira o gargalo. */
  camera: { width: 1920, height: 1080, frameRate: 30, maxBitrate: 3_000_000 },
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
