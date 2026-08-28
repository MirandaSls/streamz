import type Redis from "ioredis";
import type { VoiceFlags } from "@streamz/shared";

/**
 * Quem está em cada sala de voz, e como (mudo, surdo, câmera, tela).
 *
 * É estado **efêmero**: existe enquanto o socket existe, então não vai ao
 * banco — sobreviver a um restart da API seria mentira (o cliente já caiu
 * junto). Em memória basta numa instância; com `REDIS_URL` o mapa é
 * compartilhado, senão duas instâncias mostrariam salas de voz diferentes.
 */
export interface VoiceMember extends VoiceFlags {
  userId: string;
  /**
   * Socket caiu e a carência está correndo. Fica **no estado**, e não só num
   * mapa do gateway, para que quem abrir o servidor no meio da queda veja o
   * participante esmaecido em vez de vê-lo aparecer do nada quando ele voltar.
   */
  reconnecting?: boolean;
  /**
   * Epoch em ms de quando entrou na sala. Serve ao painel do administrador
   * ("nesta chamada há 12 min") e é **opcional** de propósito: um estado
   * gravado no Redis antes deste campo existir continua válido, só sem relógio.
   */
  entrouEm?: number;
}

export interface VoiceStateStore {
  /** Entra (ou atualiza) na sala. Devolve o estado gravado. */
  join(channelId: string, userId: string, flags: VoiceFlags): Promise<VoiceMember>;
  /** Atualiza as flags de quem já está. Devolve null se não estava na sala. */
  update(channelId: string, userId: string, flags: VoiceFlags): Promise<VoiceMember | null>;
  /** Sai da sala. Devolve true se realmente estava lá. */
  leave(channelId: string, userId: string): Promise<boolean>;
  /** Liga/desliga o "reconectando". Devolve null se não estava na sala. */
  marcarReconectando(
    channelId: string,
    userId: string,
    reconnecting: boolean,
  ): Promise<VoiceMember | null>;
  /** Membros de uma sala. */
  members(channelId: string): Promise<VoiceMember[]>;
  /** Membros de várias salas de uma vez (canais de um servidor). */
  membersOf(channelIds: string[]): Promise<Map<string, VoiceMember[]>>;
  /**
   * Ids dos canais com alguém dentro agora — todas as chamadas abertas da
   * instância. Só o painel do administrador precisa disso: o resto do app
   * sempre parte de um canal ou de um servidor concreto.
   */
  salasAbertas(): Promise<string[]>;
}

function chave(channelId: string) {
  return `voice:${channelId}`;
}

/** Single-process: o mapa some junto com o processo, que é o tempo de vida certo. */
export class MemoryVoiceStateStore implements VoiceStateStore {
  private readonly salas = new Map<string, Map<string, VoiceMember>>();

  async join(channelId: string, userId: string, flags: VoiceFlags) {
    const sala = this.salas.get(channelId) ?? new Map<string, VoiceMember>();
    // sem `reconnecting`: reentrar na sala é voltar inteiro, e um join por cima
    // de uma carência em curso tem de limpar a marca. `entrouEm` só nasce aqui:
    // um join por cima de si mesmo (trocar de mudo para não-mudo passa pelo
    // `update`) reinicia o relógio, o que é o certo — é uma chamada nova.
    const membro: VoiceMember = { userId, ...flags, entrouEm: Date.now() };
    sala.set(userId, membro);
    this.salas.set(channelId, sala);
    return membro;
  }

  async update(channelId: string, userId: string, flags: VoiceFlags) {
    const sala = this.salas.get(channelId);
    const anterior = sala?.get(userId);
    if (!sala || !anterior) return null;
    // mexer no microfone não é entrar de novo: o relógio da chamada continua
    const membro: VoiceMember = { userId, ...flags, entrouEm: anterior.entrouEm };
    sala.set(userId, membro);
    return membro;
  }

  async marcarReconectando(channelId: string, userId: string, reconnecting: boolean) {
    const membro = this.salas.get(channelId)?.get(userId);
    if (!membro) return null;
    const atualizado: VoiceMember = { ...membro, reconnecting };
    this.salas.get(channelId)!.set(userId, atualizado);
    return atualizado;
  }

  async leave(channelId: string, userId: string) {
    const sala = this.salas.get(channelId);
    if (!sala?.delete(userId)) return false;
    if (sala.size === 0) this.salas.delete(channelId);
    return true;
  }

  async members(channelId: string) {
    return Array.from(this.salas.get(channelId)?.values() ?? []);
  }

  async membersOf(channelIds: string[]) {
    const out = new Map<string, VoiceMember[]>();
    for (const id of channelIds) {
      const membros = await this.members(id);
      if (membros.length > 0) out.set(id, membros);
    }
    return out;
  }

  async salasAbertas() {
    // `leave` já apaga a sala que esvazia, então toda chave aqui tem gente
    return Array.from(this.salas.keys());
  }
}

/** Compartilhada entre instâncias: um hash por canal, userId → flags em JSON. */
export class RedisVoiceStateStore implements VoiceStateStore {
  constructor(private readonly redis: Redis) {}

  async join(channelId: string, userId: string, flags: VoiceFlags) {
    return this.gravar(channelId, { userId, ...flags, entrouEm: Date.now() });
  }

  async update(channelId: string, userId: string, flags: VoiceFlags) {
    // só atualiza quem já estava: `hset` cru ressuscitaria quem saiu
    const raw = await this.redis.hget(chave(channelId), userId);
    const anterior = raw ? parseMembro(raw) : null;
    if (!anterior) return null;
    // mexer no microfone não é entrar de novo: o relógio da chamada continua
    return this.gravar(channelId, { userId, ...flags, entrouEm: anterior.entrouEm });
  }

  private async gravar(channelId: string, membro: VoiceMember) {
    await this.redis.hset(chave(channelId), membro.userId, JSON.stringify(membro));
    return membro;
  }

  async marcarReconectando(channelId: string, userId: string, reconnecting: boolean) {
    const raw = await this.redis.hget(chave(channelId), userId);
    const membro = raw ? parseMembro(raw) : null;
    if (!membro) return null;
    const atualizado: VoiceMember = { ...membro, reconnecting };
    return this.gravar(channelId, atualizado);
  }

  async leave(channelId: string, userId: string) {
    return (await this.redis.hdel(chave(channelId), userId)) > 0;
  }

  async members(channelId: string) {
    const hash = await this.redis.hgetall(chave(channelId));
    return Object.values(hash)
      .map((raw) => parseMembro(raw))
      .filter((m): m is VoiceMember => m !== null);
  }

  async membersOf(channelIds: string[]) {
    const out = new Map<string, VoiceMember[]>();
    for (const id of channelIds) {
      const membros = await this.members(id);
      if (membros.length > 0) out.set(id, membros);
    }
    return out;
  }

  /**
   * `SCAN` em vez de `KEYS`: a varredura é cursorizada e não trava o Redis, e
   * esta é uma chamada de painel administrativo — pode custar um punhado de
   * viagens. O hash vazio some sozinho no Redis, então toda chave tem gente.
   */
  async salasAbertas() {
    const ids: string[] = [];
    let cursor = "0";
    do {
      const [proximo, chaves] = await this.redis.scan(cursor, "MATCH", "voice:*", "COUNT", 200);
      cursor = proximo;
      for (const k of chaves) ids.push(k.slice("voice:".length));
    } while (cursor !== "0");
    return ids;
  }
}

/** JSON corrompido no Redis não derruba a sala inteira: aquele membro some. */
function parseMembro(raw: string): VoiceMember | null {
  try {
    const v = JSON.parse(raw) as VoiceMember;
    return typeof v?.userId === "string" ? v : null;
  } catch {
    return null;
  }
}
